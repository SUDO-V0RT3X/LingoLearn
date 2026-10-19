// Imports Vitest's lifecycle, grouping, assertion, test, and mocking helpers.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Imports the public-user contract used by the method under test.
import type { PublicUser } from '../../src/routes/api/routes.api/authRoutes/types/authType.js';

// Hoist database spies so they exist before Vitest evaluates the mocked module.
const database = vi.hoisted(() => ({
    // Simulates every SQL query made through the transaction client.
    query: vi.fn(),
    // Confirms that each borrowed database connection is returned to the pool.
    release: vi.fn(),
    // Simulates borrowing a dedicated transaction connection from the pool.
    connect: vi.fn(),
}));

// Replace the real PostgreSQL pool so unit tests never require Docker or a database.
vi.mock('../../src/config/db/db_init.js', () => ({
    // createLinkCode only needs pool.connect; the returned client is configured below.
    pool: { connect: database.connect },
}));

// Import after declaring the mock so ParentLinkMethods receives the fake pool.
import {
    generateSixCharacterCode,
    LINK_CODE_ALPHABET,
    ParentLinkMethods,
} from '../../src/routes/api/routes.api/authRoutes/methods/parentLinkMethods.js';

// Provide a complete signed-in learner accepted by createLinkCode's public contract.
const learner: PublicUser = {
    // Database identity used by the row lock and code lookup queries.
    id: 1,
    // Learners authenticate with a username rather than an email address.
    username: 'learnerone',
    // Public profile fields returned by authentication endpoints.
    firstName: 'Learner',
    lastName: 'One',
    name: 'Learner One',
    // Learner accounts intentionally do not require an email address.
    email: null,
    // This role is required to pass createLinkCode's role guard.
    role: 'learner',
    // The learner still needs a guardian relationship before redemption occurs.
    requiresGuardianLink: true,
};

// An eight-year-old's date of birth, so the learner may get a guardian link.
const childSettings = { rows: [{ date_of_birth: `${new Date().getUTCFullYear() - 8}-01-01` }] };
// A twenty-year-old's, who may not.
const adultSettings = { rows: [{ date_of_birth: `${new Date().getUTCFullYear() - 20}-01-01` }] };

/**
 * Resets every spy before each test and makes pool.connect return a transaction
 * client containing the shared query and release spies.
 */
beforeEach(() => {
    // Remove SQL call history and queued responses from the previous test.
    database.query.mockReset();
    // Remove previous connection-release call history.
    database.release.mockReset();
    // Remove previous pool-connection call history and implementations.
    database.connect.mockReset();
    // Return the same controllable fake client whenever the method connects.
    database.connect.mockResolvedValue({
        // Route SQL statements through the response sequence defined by each test.
        query: database.query,
        // Expose a spy for the method's finally block.
        release: database.release,
    });
});

// Group the unit tests that exercise active-code reuse and collision handling.
describe('ParentLinkMethods.createLinkCode', () => {
    /**
     * Verifies that requesting a code again before expiry returns the stored code
     * and does not insert a second active code for the same learner.
     */
    it('returns the learner\'s existing code while it is still valid', async () => {
        // Create a future timestamp that represents an unexpired database code.
        const expiresAt = new Date(Date.now() + 60_000);
        // Supply results for BEGIN, learner lock, age check, active-code lookup, and COMMIT.
        database.query
            // BEGIN does not return rows.
            .mockResolvedValueOnce({ rows: [] })
            // The learner-row lock confirms that the user exists.
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            // The learner is a child, so a code may be handed out.
            .mockResolvedValueOnce(childSettings)
            // The learner has room for another guardian.
            .mockResolvedValueOnce({ rows: [{ count: 0 }] })
            // The lookup finds the learner's existing unredeemed code.
            .mockResolvedValueOnce({ rows: [{ code: 'ABC123', expires_at: expiresAt }] })
            // COMMIT completes the read-and-reuse transaction.
            .mockResolvedValueOnce({ rows: [] });

        // Execute the real method against the controlled database responses.
        const result = await ParentLinkMethods.createLinkCode(learner);

        // The API result must preserve both the code and its original expiry time.
        expect(result).toEqual({ code: 'ABC123', expiresAt: expiresAt.toISOString() });
        // Exactly six queries prove the method committed immediately after the lookup.
        expect(database.query).toHaveBeenCalledTimes(6);
        // Reusing an active code must never execute an INSERT statement.
        expect(database.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO parent_link_codes'))).toBe(false);
        // The transaction connection must always return to the pool.
        expect(database.release).toHaveBeenCalledOnce();
    });

    /**
     * Verifies that a candidate already owned by another row is not shared. The
     * method must generate another candidate and reserve that one instead.
     */
    it('retries when a generated code is already reserved for another learner', async () => {
        // Supply results for BEGIN, learner lock, age check, lookup, two inserts, and COMMIT.
        database.query
            // BEGIN starts the atomic generation operation.
            .mockResolvedValueOnce({ rows: [] })
            // The learner-row lock succeeds.
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            // The learner is a child.
            .mockResolvedValueOnce(childSettings)
            // The learner has room for another guardian.
            .mockResolvedValueOnce({ rows: [{ count: 1 }] })
            // No unexpired code currently belongs to this learner.
            .mockResolvedValueOnce({ rows: [] })
            // The first INSERT returns no row because ON CONFLICT rejected the code.
            .mockResolvedValueOnce({ rows: [] })
            // The second INSERT returns a row because its candidate was unique.
            .mockResolvedValueOnce({ rows: [{ code: 'UNIQUE' }] })
            // COMMIT makes the successful reservation permanent.
            .mockResolvedValueOnce({ rows: [] });

        // Run the generation method through the simulated collision.
        const result = await ParentLinkMethods.createLinkCode(learner);

        // Isolate the INSERT calls from the surrounding transaction queries.
        const insertCalls = database.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO parent_link_codes'));
        // One rejected insert followed by one successful insert means a retry occurred.
        expect(insertCalls).toHaveLength(2);
        // The returned code must still satisfy the six-character API contract.
        expect(result.code).toHaveLength(6);
        // The connection must be released after the successful commit.
        expect(database.release).toHaveBeenCalledOnce();
    });

    /**
     * A guardian link is for a child. A learner aged 13 or more, or one who has
     * not saved a date of birth, gets no code, and nothing is written.
     */
    it.each([
        ['is 13 or older', adultSettings],
        ['has not finished setup', { rows: [] }],
    ])('refuses a code to a learner who %s', async (_case, settings) => {
        database.query
            // BEGIN.
            .mockResolvedValueOnce({ rows: [] })
            // The learner-row lock.
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            // The age check's settings read.
            .mockResolvedValueOnce(settings)
            // ROLLBACK.
            .mockResolvedValueOnce({ rows: [] });

        await expect(ParentLinkMethods.createLinkCode(learner)).rejects.toMatchObject({
            status: 409,
            message: 'only a learner under 13 can be linked to a guardian',
        });
        expect(database.query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
        expect(database.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
        expect(database.release).toHaveBeenCalledOnce();
    });
});

describe('link code alphabet', () => {
    it('leaves out the characters a child could misread aloud: 0 and O, 1, I and L', () => {
        expect(LINK_CODE_ALPHABET).not.toMatch(/[01OIL]/);
        // Still letters and digits only, so the 6-character code format is unchanged.
        expect(LINK_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
        expect(new Set(LINK_CODE_ALPHABET).size).toBe(LINK_CODE_ALPHABET.length);
    });

    it('makes every generated code six characters from that alphabet', () => {
        for (let index = 0; index < 200; index += 1) {
            expect(generateSixCharacterCode()).toMatch(new RegExp(`^[${LINK_CODE_ALPHABET}]{6}$`));
        }
    });
});

describe('ParentLinkMethods.createLinkCode, the guardian limit', () => {
    it('refuses a code to a child who already has the most guardians allowed', async () => {
        database.query
            // BEGIN, the learner lock and the age check.
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce(childSettings)
            // Four active guardians already.
            .mockResolvedValueOnce({ rows: [{ count: 4 }] })
            // ROLLBACK.
            .mockResolvedValueOnce({ rows: [] });

        await expect(ParentLinkMethods.createLinkCode(learner)).rejects.toMatchObject({
            status: 409,
            message: 'a learner can have at most 4 linked guardians',
        });
        expect(database.query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
        expect(database.release).toHaveBeenCalledOnce();
    });
});
