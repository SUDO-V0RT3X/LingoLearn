import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import type { UserRole } from '../../src/routes/api/routes.api/authRoutes/types/authType.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';

// Creates one Express application for all LIN-21 HTTP requests in this file.
const app = createApp();

// Stores directly seeded user IDs so the test rows can be deleted afterwards.
const seededUserIds: number[] = [];

// Adds a suffix to test identities so repeated local runs do not collide.
const runSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

let administratorToken = '';
const nonAdministratorTokens: string[] = [];

type SeedUserInput = {
    firstName: string;
    lastName: string;
    role: UserRole;
    isActive?: boolean;
};

/** Inserts one user row with fields that satisfy the repository's role-specific identity constraint. */
async function seedUser(input: SeedUserInput): Promise<number> {
    const uniquePart = `${runSuffix}${seededUserIds.length + 1}`;
    const username = input.role === 'learner' ? `lin21${uniquePart}` : null;
    const email = input.role === 'learner' ? null : `lin21.${uniquePart}@example.test`;

    const result = await pool.query<{ id: number }>(
        `INSERT INTO users
            (username, first_name, last_name, email, role, requires_guardian_link, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7)
         RETURNING id`,
        [username, input.firstName, input.lastName, email, input.role, 'test-password-hash', input.isActive ?? true],
    );

    const userId = result.rows[0].id;
    seededUserIds.push(userId);
    return userId;
}

/** Sends an administrator request to the user-list endpoint with optional query values. */
function listUsers(query: Record<string, string | number> = {}) {
    return request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${administratorToken}`)
        .query(query);
}

beforeAll(async () => {
    administratorToken = (await accountWithToken('administrator')).token;

    for (const role of ['learner', 'guardian', 'author', 'moderator'] as const) {
        nonAdministratorTokens.push((await accountWithToken(role)).token);
    }
});

afterAll(async () => {
    if (seededUserIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [seededUserIds]);
    }
    await deleteTestAccounts();
});

describe('GET /api/admin/users', () => {
    it('returns matching names and excludes non-matching names', async () => {
        const matchingId = await seedUser({ firstName: 'LinTwentyOne', lastName: 'Match', role: 'guardian' });
        const excludedId = await seedUser({ firstName: 'Completely', lastName: 'Different', role: 'guardian' });

        const response = await listUsers({ q: 'LinTwentyOne Match' });

        expect(response.status).toBe(200);
        expect(response.body.users.map((user: { userId: number }) => user.userId)).toContain(matchingId);
        expect(response.body.users.map((user: { userId: number }) => user.userId)).not.toContain(excludedId);
    });

    it('matches partial names without case sensitivity', async () => {
        const matchingId = await seedUser({ firstName: 'TSUser', lastName: `Account${runSuffix}`, role: 'author' });

        const response = await listUsers({ q: 'tSu' });

        expect(response.status).toBe(200);
        expect(response.body.users.map((user: { userId: number }) => user.userId)).toContain(matchingId);
    });

    it('returns a learner username when the account has no email address', async () => {
        const learnerId = await seedUser({ firstName: 'Username', lastName: `Learner${runSuffix}`, role: 'learner' });

        const response = await listUsers({ q: learnerId });

        expect(response.status).toBe(200);
        expect(response.body.users[0].email).toBeNull();
        expect(response.body.users[0].username).toMatch(/^lin21/);
    });

    it('treats a numeric search as an exact user ID', async () => {
        const expectedId = await seedUser({ firstName: 'Exact', lastName: 'Identifier', role: 'moderator' });
        await seedUser({ firstName: 'Another', lastName: 'Identifier', role: 'moderator' });

        const response = await listUsers({ q: expectedId });

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(1);
        expect(response.body.users).toHaveLength(1);
        expect(response.body.users[0].userId).toBe(expectedId);
    });

    it('filters by role and combines name and role filters with AND', async () => {
        const expectedId = await seedUser({ firstName: 'Combined', lastName: `Filter${runSuffix}`, role: 'author' });
        const wrongRoleId = await seedUser({ firstName: 'Combined', lastName: `Filter${runSuffix}`, role: 'guardian' });

        const roleOnly = await listUsers({ role: 'author', pageSize: 100 });
        expect(roleOnly.status).toBe(200);
        expect(roleOnly.body.users.every((user: { role: string }) => user.role === 'author')).toBe(true);

        const combined = await listUsers({ q: `Combined Filter${runSuffix}`, role: 'author' });
        const returnedIds = combined.body.users.map((user: { userId: number }) => user.userId);
        expect(returnedIds).toContain(expectedId);
        expect(returnedIds).not.toContain(wrongRoleId);
    });

    it('returns a clear 400 response for an invalid role', async () => {
        const response = await listUsers({ role: 'wizard' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('learner, guardian, author, moderator, administrator');
        expect(response.body.issues).toContainEqual({ field: 'role', message: 'Invalid user role' });
    });

    it('rejects each non-administrator role and a missing token', async () => {
        for (const token of nonAdministratorTokens) {
            const response = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
            expect(response.status).toBe(403);
        }

        const missingToken = await request(app).get('/api/admin/users');
        expect(missingToken.status).toBe(401);
    });

    it('never returns password hashes or token-version fields', async () => {
        await seedUser({ firstName: 'Private', lastName: `Columns${runSuffix}`, role: 'guardian' });

        const response = await listUsers({ q: `Private Columns${runSuffix}` });

        expect(response.status).toBe(200);
        expect(response.body.users.length).toBeGreaterThan(0);
        for (const user of response.body.users) {
            expect(user).not.toHaveProperty('password_hash');
            expect(user).not.toHaveProperty('passwordHash');
            expect(user).not.toHaveProperty('token_version');
            expect(user).not.toHaveProperty('tokenVersion');
        }
    });

    it('matches percent, underscore and SQL-like search text literally', async () => {
        const literalId = await seedUser({ firstName: 'Percent%_Name', lastName: `Literal${runSuffix}`, role: 'guardian' });
        const wildcardLookalikeId = await seedUser({ firstName: 'PercentXXName', lastName: `Literal${runSuffix}`, role: 'guardian' });

        const literalResponse = await listUsers({ q: 'Percent%_Name' });
        const literalIds = literalResponse.body.users.map((user: { userId: number }) => user.userId);
        expect(literalIds).toContain(literalId);
        expect(literalIds).not.toContain(wildcardLookalikeId);

        const sqlLikeResponse = await listUsers({ q: "%' OR 1=1 --" });
        expect(sqlLikeResponse.status).toBe(200);
        expect(sqlLikeResponse.body.total).toBe(0);
    });

    it('returns correct totals and page boundaries while capping pageSize at 100', async () => {
        const pageMarker = `Batch${runSuffix}`;
        const result = await pool.query<{ id: number }>(
            `INSERT INTO users
                (username, first_name, last_name, email, role, requires_guardian_link, password_hash, is_active)
             SELECT
                NULL,
                'Boundary',
                $1 || LPAD(sequence_number::text, 3, '0'),
                'lin21.page.${runSuffix}.' || sequence_number || '@example.test',
                'guardian',
                false,
                'test-password-hash',
                true
             FROM generate_series(1, 105) AS sequence_number
             RETURNING id`,
            [pageMarker],
        );
        seededUserIds.push(...result.rows.map((row) => row.id));

        const firstPage = await listUsers({ q: `Boundary ${pageMarker}`, page: 1, pageSize: 1000 });
        expect(firstPage.status).toBe(200);
        expect(firstPage.body).toMatchObject({ page: 1, pageSize: 100, total: 105 });
        expect(firstPage.body.users).toHaveLength(100);

        const secondPage = await listUsers({ q: `Boundary ${pageMarker}`, page: 2, pageSize: 100 });
        expect(secondPage.body).toMatchObject({ page: 2, pageSize: 100, total: 105 });
        expect(secondPage.body.users).toHaveLength(5);

        const emptyPage = await listUsers({ q: `Boundary ${pageMarker}`, page: 3, pageSize: 100 });
        expect(emptyPage.body.total).toBe(105);
        expect(emptyPage.body.users).toEqual([]);
    });

    it('exposes no PUT, PATCH or DELETE route for the user list', async () => {
        const authorization = `Bearer ${administratorToken}`;

        expect((await request(app).put('/api/admin/users').set('Authorization', authorization)).status).toBe(404);
        expect((await request(app).patch('/api/admin/users').set('Authorization', authorization)).status).toBe(404);
        expect((await request(app).delete('/api/admin/users').set('Authorization', authorization)).status).toBe(404);
    });
});
