// Rate limits on the routes that take a secret, through the real app. Limits are
// off under NODE_ENV=test so other suites can sign in freely; this file turns
// them on for its own app (each test file runs in its own worker).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { AUTH_RATE_LIMITS } from '../../src/routes/api/routes.api/authRoutes/authRoutes.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

process.env.RATE_LIMIT = 'on';
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';
const app = createApp();

let guardian: Awaited<ReturnType<typeof accountWithToken>>;

beforeAll(async () => {
    guardian = await accountWithToken('guardian');
});

afterAll(async () => {
    delete process.env.RATE_LIMIT;
    await deleteTestAccounts();
});

describe('auth rate limits', () => {
    it('never counts a successful sign-in, so switching accounts all day is fine', async () => {
        const learner = await accountWithToken('learner');
        for (let i = 0; i < AUTH_RATE_LIMITS.login.max + 5; i += 1) {
            const res = await request(app).post('/api/auth/login')
                .send({ identifier: learner.user.username, password: 'password123' });
            expect(res.status).toBe(200);
        }
    });

    it('allows 10 failed sign-in attempts a minute, then answers 429 with a clear message', async () => {
        const attempt = () => request(app).post('/api/auth/login')
            .send({ identifier: 'nobody-rate-limit@example.test', password: 'wrong-pass1' });

        for (let i = 0; i < AUTH_RATE_LIMITS.login.max; i += 1) {
            expect((await attempt()).status).toBe(401);
        }
        const refused = await attempt();
        expect(refused.status).toBe(429);
        expect(refused.body.error).toBe(AUTH_RATE_LIMITS.login.message);
        expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('cannot be dodged with a spoofed X-Forwarded-For header', async () => {
        const res = await request(app).post('/api/auth/login')
            .set('X-Forwarded-For', '203.0.113.7')
            .send({ identifier: 'nobody-rate-limit@example.test', password: 'wrong-pass1' });
        expect(res.status).toBe(429);
    });

    it('limits sign-ups, counting refused ones too', async () => {
        // An invalid body is refused with 400 and creates nothing, but still counts.
        const attempt = () => request(app).post('/api/auth/signup').send({ role: 'learner' });
        for (let i = 0; i < AUTH_RATE_LIMITS.signup.max; i += 1) {
            expect((await attempt()).status).toBe(400);
        }
        const refused = await attempt();
        expect(refused.status).toBe(429);
        expect(refused.body.error).toBe(AUTH_RATE_LIMITS.signup.message);
    });

    it('limits parent-link code guesses', async () => {
        const attempt = () => request(app).post('/api/auth/parent-links/redeem')
            .set('Authorization', `Bearer ${guardian.token}`)
            .send({ code: 'ZZZZZ1' }); // '1' is never in a generated code
        for (let i = 0; i < AUTH_RATE_LIMITS.redeem.max; i += 1) {
            expect((await attempt()).status).toBe(404);
        }
        const refused = await attempt();
        expect(refused.status).toBe(429);
        expect(refused.body.error).toBe(AUTH_RATE_LIMITS.redeem.message);
    });
});
