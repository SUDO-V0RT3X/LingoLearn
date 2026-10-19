// Supplies cryptographically secure random numbers for unpredictable link codes.
import { randomInt } from 'node:crypto';
// Reuses the application's PostgreSQL connection pool for every database operation.
import { pool } from '../../../../../config/db/db_init.js';
// Produces HTTP-aware errors that the shared route error handler can return safely.
import { ApiError } from '../../../../../shared/errors/ApiError.js';
// Only a child (set up, under 13) may get a new guardian link, and only up to the guardian limit.
import { requireChildForNewGuardianLink, requireRoomForAnotherGuardian } from '../../../../../shared/learnerAccess.js';
// Imports the parent-linking data contracts and the user-to-public-user mapper.
import {
    toPublicUser,
    type LinkedChild,
    type LinkedGuardian,
    type ParentLinkCode,
    type PublicUser,
    type UserRole,
    type UserRow,
} from '../types/authType.js';

// Converts the ten-minute code lifetime into milliseconds for JavaScript Date arithmetic.
const linkCodeLifetimeMs = 1000 * 60 * 10;

/**
 * The characters a new code is made of: uppercase letters and digits without
 * the ones a child reading the code aloud could mix up (0 and O, 1, I and L).
 * Older codes may still hold them, and redemption accepts any letter or digit.
 */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * The refusal when a guardian redeems a code from a learner they are already
 * linked to. The frontend translates it, so change it only together with the client.
 */
export const ALREADY_LINKED_TO_YOU = 'this learner is already linked to your account';

/**
 * Confirms that the authenticated user has one of the roles allowed to perform
 * an operation. A forbidden role is rejected before any database work occurs.
 */
function ensureRole(user: PublicUser, roles: UserRole[]) {
    // Stop immediately when the user's role is not included in the allowed list.
    if (!roles.includes(user.role)) throw new ApiError(403, 'Access denied');
}

/**
 * Validates and normalises a code supplied by a guardian. Spaces and dashes are
 * dropped, so a code read out or copied as "ABC 234" or "ABC-234" still works,
 * and uppercasing makes entry case-insensitive.
 */
function requireCode(value: unknown): string {
    // Reject missing, non-text, or whitespace-only values as invalid input.
    if (typeof value !== 'string' || value.trim() === '') {
        // Include a field-specific detail so the frontend can identify the bad input.
        throw new ApiError(400, 'code is required', [{ field: 'code', message: 'code is required' }]);
    }

    const code = value.replace(/[\s-]/g, '').toUpperCase();
    if (code.length !== 6 || !/^[A-Z0-9]{6}$/.test(code)) {
        throw new ApiError(400, 'code must be 6 characters (letters and numbers)', [
            { field: 'code', message: 'code must be 6 characters (letters and numbers)' },
        ]);
    }

    // Store and compare all codes in one canonical uppercase format.
    return code;
}

/**
 * Generates an unpredictable six-character candidate code from LINK_CODE_ALPHABET,
 * so codes are easy to read aloud and type.
 */
export function generateSixCharacterCode(): string {
    // Build the code one randomly selected character at a time.
    let code = '';
    // Exactly six iterations produce the fixed-size code expected by the database.
    for (let index = 0; index < 6; index += 1) {
        // randomInt chooses a secure index without the bias of Math.random().
        code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
    }
    // Return the completed candidate for atomic reservation in PostgreSQL.
    return code;
}

// Keeps the selected user columns consistent between parent-linking queries.
const USER_COLUMNS = 'id, username, first_name, last_name, email, role, requires_guardian_link, password_hash, is_active, interface_language';
// Prefixes each column with the user-table alias for queries that join multiple tables.
const USER_COLUMNS_PREFIXED = USER_COLUMNS.split(', ').map((column) => `u.${column}`).join(', ');

export class ParentLinkMethods {
    /**
     * Returns the signed-in learner's current unexpired code, or atomically
     * reserves a new one. Locking the learner row prevents concurrent requests
     * from creating multiple valid codes for that learner, while the code's
     * primary-key constraint prevents it from ever belonging to two learners.
     * Only a child gets a code: a learner who is 13 or older (or has not saved
     * a date of birth yet) is refused, even one whose earlier link still stands.
     * A linked child may make another code to link a further guardian, until
     * they have the most guardians allowed.
     */
    static async createLinkCode(learner: PublicUser): Promise<ParentLinkCode> {
        // Only learner accounts are allowed to request a guardian-link code.
        ensureRole(learner, ['learner']);
        // Reserve one database connection for the complete atomic transaction.
        const client = await pool.connect();

        try {
            // Begin a transaction so the learner lock, lookup, and insert act as one unit.
            await client.query('BEGIN');
            // Lock this learner's row so simultaneous requests for this learner run in order.
            await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [learner.id]);
            // A code is the start of a new guardian link, which only a child may have.
            await requireChildForNewGuardianLink(client, learner.id);
            // A child who already has the most guardians allowed has no use for a code.
            await requireRoomForAnotherGuardian(client, learner.id);

            // Look for a code that belongs to this learner and is both unused and unexpired.
            const { rows: activeRows } = await client.query<{ code: string; expires_at: Date }>(
                `SELECT code, expires_at
                   FROM parent_link_codes
                  WHERE learner_id = $1
                    AND redeemed_at IS NULL
                    AND expires_at > now()
                  ORDER BY expires_at DESC
                  LIMIT 1`,
                [learner.id],
            );

            // LIMIT 1 means the first row is the only possible active result we need.
            const activeCode = activeRows[0];
            // Reuse an existing valid code instead of creating several active codes.
            if (activeCode) {
                // Commit releases the learner-row lock before returning to the route.
                await client.query('COMMIT');
                // CHAR values are trimmed and the database timestamp becomes API-safe ISO text.
                return { code: activeCode.code.trim(), expiresAt: activeCode.expires_at.toISOString() };
            }

            // Calculate one expiry timestamp shared by all collision-retry attempts.
            const expiresAt = new Date(Date.now() + linkCodeLifetimeMs);
            // Limit retries so a database or random-generation fault cannot loop forever.
            for (let attempt = 0; attempt < 5; attempt += 1) {
                // Generate a fresh candidate for this reservation attempt.
                const code = generateSixCharacterCode();
                // Ask PostgreSQL to insert only when no row already owns this code.
                const { rows: insertedRows } = await client.query<{ code: string }>(
                    `INSERT INTO parent_link_codes (code, learner_id, expires_at)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (code) DO NOTHING
                     RETURNING code`,
                    [code, learner.id, expiresAt],
                );

                // RETURNING supplies a row only when this attempt reserved the code.
                if (insertedRows[0]) {
                    // Commit makes the new code visible and releases the learner lock.
                    await client.query('COMMIT');
                    // Return the newly reserved code and its exact expiry to the frontend.
                    return { code, expiresAt: expiresAt.toISOString() };
                }
            }

            // Five conflicts indicate that a unique code could not be reserved safely.
            throw new ApiError(500, 'Could not generate a unique link code');
        } catch (e) {
            // Undo every transaction change when validation, SQL, or reservation fails.
            await client.query('ROLLBACK');
            // Preserve the original error so the route can return its correct status/message.
            throw e;
        } finally {
            // Always return the connection to the pool, regardless of success or failure.
            client.release();
        }
    }

    /**
     * Redeems a learner's code for a guardian. Invalid, used and expired codes
     * are kept apart so the screen can say which it was. The redemption runs in
     * one transaction with the row locked, so a code can never be used twice.
     * A code whose learner has turned 13 since it was made links nobody.
     * A learner may have several guardians, but the same guardian only once,
     * and no more than the guardian limit.
     */
    static async redeemCode(guardian: PublicUser, input: Record<string, unknown>): Promise<{ child: PublicUser; linkedAt: string }> {
        // Only guardians and administrators may consume learner link codes.
        ensureRole(guardian, ['guardian', 'administrator']);
        // Validate the request field and convert it to its canonical uppercase form.
        const code = requireCode(input.code);
        // Use one dedicated connection because redemption changes several related rows.
        const client = await pool.connect();

        try {
            // Start a transaction so the code and relationship changes succeed together.
            await client.query('BEGIN');
            // Lock the code row so two guardians cannot redeem it at the same time.
            const { rows: codeRows } = await client.query<{ learner_id: number; expires_at: Date; redeemed_at: Date | null }>(
                `SELECT learner_id, expires_at, redeemed_at FROM parent_link_codes WHERE code = $1 FOR UPDATE`,
                [code],
            );

            // A valid code query can return at most one row because code is the primary key.
            const linkCode = codeRows[0];
            // No matching database row means the supplied code was never issued.
            if (!linkCode) throw new ApiError(404, 'Invalid code');
            // A redemption timestamp proves another guardian already consumed the code.
            if (linkCode.redeemed_at) throw new ApiError(409, 'Code already used');
            // Compare the stored expiry with the current time before creating any link.
            if (linkCode.expires_at.getTime() <= Date.now()) throw new ApiError(410, 'Code expired');

            // Load the learner named by the code while also confirming the account role.
            // Locking the learner's row keeps the guardian count below steady until commit.
            const { rows: childRows } = await client.query<UserRow>(
                `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND role = 'learner' FOR UPDATE`,
                [linkCode.learner_id],
            );
            // The first row is the learner account associated with this unique code.
            const child = childRows[0];
            // Treat a deleted or non-learner account as an invalid link code.
            if (!child) throw new ApiError(404, 'Invalid code');
            // The learner must still be a child now, not only when the code was made.
            await requireChildForNewGuardianLink(client, child.id);
            // A second, different guardian is welcome; the same guardian twice is not.
            const { rowCount: alreadyLinked } = await client.query(
                `SELECT 1 FROM parent_child_links
                  WHERE guardian_id = $1 AND learner_id = $2 AND unlinked_at IS NULL`,
                [guardian.id, child.id],
            );
            if (alreadyLinked) throw new ApiError(409, ALREADY_LINKED_TO_YOU);
            // The learner must still have room for one more guardian.
            await requireRoomForAnotherGuardian(client, child.id);

            // Create the permanent guardian-child relationship and return its timestamp.
            const { rows: linkRows } = await client.query<{ linked_at: Date }>(
                `INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)
                 RETURNING linked_at`,
                [guardian.id, child.id],
            );

            // Mark the code as consumed by this guardian so it cannot work again.
            await client.query(
                `UPDATE parent_link_codes SET redeemed_at = now(), redeemed_by_guardian_id = $1 WHERE code = $2`,
                [guardian.id, code],
            );
            // Record that the learner has now completed the required guardian-link step.
            await client.query(
                `UPDATE users SET requires_guardian_link = false, updated_at = now() WHERE id = $1`,
                [child.id],
            );

            // Make the relationship, code consumption, and learner update permanent together.
            await client.query('COMMIT');
            // Return only public learner data plus the time the relationship was created.
            return {
                // Reflect the updated guardian-link status without exposing password data.
                child: { ...toPublicUser(child), requiresGuardianLink: false },
                // Convert PostgreSQL's Date object into a serialisable API timestamp.
                linkedAt: linkRows[0].linked_at.toISOString(),
            };
        } catch (e) {
            // Remove every partial change if any redemption step fails.
            await client.query('ROLLBACK');
            // Pass the original error to the shared route error handler.
            throw e;
        } finally {
            // Release the dedicated transaction connection in every outcome.
            client.release();
        }
    }

    /**
     * Lists the learners a guardian has linked. An administrator sees every
     * link, for support.
     */
    static async getChildren(guardian: PublicUser): Promise<LinkedChild[]> {
        // Prevent learners and unrelated staff roles from listing linked children.
        ensureRole(guardian, ['guardian', 'administrator']);

        // Join relationships to users so each result includes the learner's public details.
        const { rows } = await pool.query<UserRow & { linked_at: Date }>(
            `SELECT ${USER_COLUMNS_PREFIXED}, l.linked_at
               FROM parent_child_links l
               JOIN users u ON u.id = l.learner_id
              WHERE ($1::boolean OR l.guardian_id = $2) AND l.unlinked_at IS NULL
              ORDER BY l.linked_at`,
            [guardian.role === 'administrator', guardian.id],
        );

        // Remove private database fields and add a serialisable relationship timestamp.
        return rows.map((row) => ({ ...toPublicUser(row), linkedAt: row.linked_at.toISOString() }));
    }

    /**
     * The guardians actively linked to the signed-in learner, oldest link first,
     * so a linked child's screen can say who they are linked to. Only the
     * learner's own links, and only names: no email or account details.
     */
    static async getMyGuardians(learner: PublicUser): Promise<LinkedGuardian[]> {
        // Only a learner asks who they are linked to; the id comes from their session.
        ensureRole(learner, ['learner']);

        const { rows } = await pool.query<{ first_name: string; last_name: string; linked_at: Date }>(
            `SELECT g.first_name, g.last_name, l.linked_at
               FROM parent_child_links l
               JOIN users g ON g.id = l.guardian_id
              WHERE l.learner_id = $1 AND l.unlinked_at IS NULL
              ORDER BY l.linked_at`,
            [learner.id],
        );

        return rows.map((row) => ({
            firstName: row.first_name,
            lastName: row.last_name,
            linkedAt: row.linked_at.toISOString(),
        }));
    }
}
