// SQL injection attempts through the forms that send text to the database:
// sign-in, sign-up, the administrator's user search and tag creation. Each is
// answered normally (never a 500), stored or matched literally, and the tables
// are untouched.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

const PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "admin'--",
    "1; DELETE FROM content",
    "\\' UNION SELECT password_hash FROM users --",
    "%' OR 1=1 --",
];

async function userCount(): Promise<number> {
    const { rows } = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM users');
    return Number(rows[0].n);
}

afterAll(async () => {
    await pool.query("DELETE FROM tags WHERE name LIKE 'sqli-%'");
    await deleteTestAccounts();
});

describe('SQL injection attempts', () => {
    it('sign-in with injection payloads is refused as a wrong login, not an error', async () => {
        const before = await userCount();
        for (const payload of PAYLOADS) {
            const response = await request(app).post('/api/auth/login').send({ identifier: payload, password: payload });
            expect([400, 401]).toContain(response.status);
        }
        expect(await userCount()).toBe(before);
    });

    it('administrator search treats a payload as plain text and finds nobody', async () => {
        const admin = await accountWithToken('administrator');
        for (const payload of PAYLOADS) {
            const response = await request(app).get('/api/admin/users').query({ q: payload })
                .set('Authorization', `Bearer ${admin.token}`);
            expect(response.status).toBe(200);
            expect(response.body.users).toEqual([]);
            expect(response.body.total).toBe(0);
        }
    });

    it('sign-up refuses a payload as an invalid username without touching the database', async () => {
        const before = await userCount();
        const response = await request(app).post('/api/auth/signup')
            .send({ role: 'learner', firstName: 'Bobby', lastName: 'Tables', username: "x'; DROP TABLE users; --", password: 'long-enough' });
        expect(response.status).toBe(400);
        expect(await userCount()).toBe(before);
    });

    it('a tag named with a payload is stored literally', async () => {
        const admin = await accountWithToken('administrator');
        const name = "sqli-'); DROP TABLE tags; --";
        const response = await request(app).post('/api/taxonomy/createTag').set('Authorization', `Bearer ${admin.token}`)
            .send({ name, tag_type: 'theme', description: "' OR 1=1 --" });
        expect([201, 400]).toContain(response.status);
        const { rows } = await pool.query('SELECT to_regclass($1) AS t', ['public.tags']);
        expect(rows[0].t).toBe('tags');
        if (response.status === 201) {
            const stored = await pool.query('SELECT name FROM tags WHERE name = $1', [name]);
            expect(stored.rows).toHaveLength(1);
        }
    });
});
