// Security hardening and crash-resilience integration tests.
// Proves that the API is defended against SQL injection across all input vectors,
// that malformed/oversized payloads do not crash the Express server,
// and that path traversal attacks against uploaded assets are rejected.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

const SQL_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "admin'--",
    "1; DELETE FROM content",
    "\\' UNION SELECT password_hash FROM users --",
    "%' OR 1=1 --",
    "1' OR '1'='1' --",
    "\" OR \"\"=\"",
];

afterAll(async () => {
    await pool.query("DELETE FROM users WHERE username LIKE 'lsec_%' OR first_name = $1", ["O'Connor-Drop"]);
    await deleteTestAccounts();
});

describe('Security Hardening & Crash Resilience', () => {
    describe('SQL Injection Defenses', () => {
        it('parent link code redemption rejects SQL injection payloads without database error', async () => {
            const guardian = await accountWithToken('guardian');
            for (const payload of SQL_PAYLOADS) {
                const response = await request(app)
                    .post('/api/auth/parent-links/redeem')
                    .set('Authorization', `Bearer ${guardian.token}`)
                    .send({ code: payload });

                // Must be a clean client error (400 bad format), never 500
                expect(response.status).toBe(400);
                expect(response.body).toHaveProperty('error');
            }
        });

        it('registration name validation blocks SQL injection strings before database interaction', async () => {
            const injectionNames = [
                "Robert'); DROP TABLE users;--",
                "admin' OR 1=1--",
                '"><script>alert(1)</script>',
                "1; DELETE FROM users",
                "%' UNION SELECT 1--",
            ];
            for (const name of injectionNames) {
                const response = await request(app)
                    .post('/api/auth/signup')
                    .send({
                        role: 'learner',
                        firstName: name,
                        lastName: 'Test',
                        username: `user_${Date.now().toString().slice(-6)}_${Math.random().toString(36).slice(2, 6)}`,
                        password: 'valid_password_123',
                    });

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Name must be');
            }
        });

        it('parameterized queries safely store strings containing SQL quotes without executing SQL', async () => {
            const harmlessSqlLikeName = "O'Connor-Drop";
            const uniqueUser = `lsec_${Math.random().toString(36).slice(2, 10)}`;
            const response = await request(app)
                .post('/api/auth/signup')
                .send({
                    role: 'learner',
                    firstName: harmlessSqlLikeName,
                    lastName: 'Tester',
                    username: uniqueUser,
                    password: 'valid_password_123',
                });

            expect(response.status).toBe(201);
            expect(response.body.user.firstName).toBe(harmlessSqlLikeName);

            // Verify database is completely intact and users table still exists
            const dbCheck = await pool.query('SELECT count(*)::int AS count FROM users');
            expect(dbCheck.rows[0].count).toBeGreaterThan(0);
        });

        it('reading progress endpoint safely handles SQL injection in parameters', async () => {
            const learner = await accountWithToken('learner');
            for (const payload of SQL_PAYLOADS) {
                const response = await request(app)
                    .put('/api/reading/saveProgress/1')
                    .set('Authorization', `Bearer ${learner.token}`)
                    .send({ page: payload, totalPages: 10 });

                // Page must be an integer; string injection is rejected as 400
                expect([400, 403, 404]).toContain(response.status);
                expect(response.status).not.toBe(500);
            }
        });
    });

    describe('Server Crash Protection & Malformed Input Handling', () => {
        it('malformed JSON body returns 400 without crashing the Express process', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .set('Content-Type', 'application/json')
                .send('{"identifier": "test", broken_json_here:');

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('request body could not be read');

            // Confirm server is still alive and responsive
            const health = await request(app).get('/health');
            expect(health.status).toBe(200);
            expect(health.body.ok).toBe(true);
        });

        it('payloads exceeding body limit return 413 without crashing server', async () => {
            // Create a payload slightly larger than 1MB
            const largeData = 'a'.repeat(1024 * 1024 + 100);
            const response = await request(app)
                .post('/api/auth/login')
                .set('Content-Type', 'application/json')
                .send(JSON.stringify({ identifier: largeData, password: 'test' }));

            expect(response.status).toBe(413);
            expect(response.body.error).toBe('request body is too large');

            // Confirm server remains healthy
            const health = await request(app).get('/health');
            expect(health.status).toBe(200);
        });

        it('non-numeric IDs in parameterized routes return client errors, not 500', async () => {
            const learner = await accountWithToken('learner');

            const routes = [
                '/api/content/getContent/notanumber',
                '/api/taxonomy/getContentTags/invalid-id',
                '/api/reading/getProgress/abc',
            ];

            for (const route of routes) {
                const response = await request(app)
                    .get(route)
                    .set('Authorization', `Bearer ${learner.token}`);

                expect([400, 404]).toContain(response.status);
                expect(response.status).not.toBe(500);
            }
        });
    });

    describe('Path Traversal & Static Asset Protection', () => {
        it('directory traversal attempts on /uploads are refused with 404', async () => {
            const traversalAttempts = [
                '/uploads/../../package.json',
                '/uploads/..%2f..%2fpackage.json',
                '/uploads/%2e%2e%2f%2e%2e%2fpackage.json',
                '/uploads/....//....//package.json',
            ];

            for (const path of traversalAttempts) {
                const response = await request(app).get(path);
                expect(response.status).toBe(404);
            }
        });

        it('metadata sidecars (.meta.json) and private recordings cannot be accessed through /uploads', async () => {
            const protectedFiles = [
                '/uploads/sample.meta.json',
                '/uploads/audio.json',
                '/uploads/recordings/learner_recording.mp3',
                '/uploads/recordings/test.wav',
            ];

            for (const file of protectedFiles) {
                const response = await request(app).get(file);
                expect(response.status).toBe(404);
            }
        });
    });
});
