// AUTH integration tests — the real Express app over the real database
// (docker locally). Every account a test creates is deleted afterwards.
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { SessionMethods } from '../../src/routes/api/routes.api/authRoutes/methods/sessionMethods.js';
import { finishLearnerSetup } from '../helpers/accounts.js';
import { GUARDIAN_LIMIT_REACHED, MAX_ACTIVE_GUARDIANS } from '../../src/shared/learnerAccess.js';
import { ALREADY_LINKED_TO_YOU, LINK_CODE_ALPHABET } from '../../src/routes/api/routes.api/authRoutes/methods/parentLinkMethods.js';

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';
const app = createApp();

const createdUserIds: number[] = [];
let unique = 0;
// Short, so usernames and emails built from it stay within the account limits.
const suffix = () => `${Date.now().toString(36).slice(-6)}${(unique += 1)}`;

async function signUpLearner(overrides: Record<string, unknown> = {}) {
    const res = await request(app).post('/api/auth/signup').send({
        firstName: 'Lea',
        lastName: 'Learner',
        username: `l${suffix()}`,
        password: 'password123',
        role: 'learner',
        ...overrides,
    });
    if (res.body?.user?.id) createdUserIds.push(res.body.user.id);
    return res;
}

async function signUpGuardian(overrides: Record<string, unknown> = {}) {
    const res = await request(app).post('/api/auth/signup').send({
        firstName: 'Gia',
        lastName: 'Guardian',
        email: `g${suffix()}@example.test`,
        password: 'password123',
        role: 'guardian',
        ...overrides,
    });
    if (res.body?.user?.id) createdUserIds.push(res.body.user.id);
    return res;
}

/** Signs up a learner and saves their setup as a child, who may be linked to a guardian. */
async function signUpChild() {
    const res = await signUpLearner();
    await finishLearnerSetup(res.body.user.id, 'child');
    return res;
}

/** Signs up a child learner and a guardian, then redeems the learner's code. */
async function linkedPair() {
    const learner = (await signUpChild()).body;
    const guardian = (await signUpGuardian()).body;
    const code = (await request(app)
        .post('/api/auth/link-codes')
        .set('Authorization', `Bearer ${learner.token}`)).body.code;
    const redeem = await request(app)
        .post('/api/auth/parent-links/redeem')
        .set('Authorization', `Bearer ${guardian.token}`)
        .send({ code });
    return { learner, guardian, code, redeem };
}

afterAll(async () => {
    await pool.query(`DELETE FROM parent_link_codes WHERE learner_id = ANY($1::int[])`, [createdUserIds]);
    await pool.query(
        `DELETE FROM parent_child_links WHERE learner_id = ANY($1::int[]) OR guardian_id = ANY($1::int[])`,
        [createdUserIds],
    );
    await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [createdUserIds]);
});

describe('accounts and sessions', () => {
    it('signs up a learner, stores only a password hash, and issues a token', async () => {
        const res = await signUpLearner();
        expect(res.status).toBe(201);
        expect(res.body.token.split('.')).toHaveLength(3);
        expect(res.body.user).toMatchObject({ role: 'learner', email: null, name: 'Lea Learner' });
        expect(res.body.user.passwordHash).toBeUndefined();

        const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [res.body.user.id]);
        expect(rows[0].password_hash).not.toContain('password123');
    });

    it('signs up, restores the session with /me, logs out, then refuses the revoked token', async () => {
        const { body } = await signUpLearner({ firstName: 'Route', lastName: 'Learner' });

        const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
        expect(me.status).toBe(200);
        expect(me.body.user).toMatchObject({ firstName: 'Route', lastName: 'Learner', role: 'learner' });

        const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${body.token}`);
        expect(logout.status).toBe(204);

        const afterLogout = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
        expect(afterLogout.status).toBe(401);
        expect(afterLogout.body.error).toBe('Session invalid');
    });

    it('logs in an existing guardian and returns a fresh token', async () => {
        const email = `login${suffix()}@example.test`;
        await signUpGuardian({ email });

        const res = await request(app).post('/api/auth/login').send({ identifier: email, password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.token.split('.')).toHaveLength(3);
        expect(res.body.user.role).toBe('guardian');
    });

    it('refuses staff roles at signup: they are seeded, never self-service', async () => {
        for (const role of ['moderator', 'author', 'administrator']) {
            const res = await request(app).post('/api/auth/signup').send({
                firstName: 'Self', lastName: 'Made', email: `${role}${suffix()}@example.test`,
                password: 'password123', role,
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('administrator');
        }
    });

    it('rejects an unsupported role', async () => {
        const res = await request(app).post('/api/auth/signup').send({
            firstName: 'No', lastName: 'Role', username: `norole${suffix()}`, password: 'password123', role: 'wizard',
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid account type');
    });

    it('accepts an 8-character password and rejects a 7-character one', async () => {
        expect((await signUpLearner({ password: 'abcdefgh' })).status).toBe(201);
        const short = await signUpLearner({ password: 'abcdefg' });
        expect(short.status).toBe(400);
        expect(short.body.error).toBe('Password must be at least 8 characters');
    });

    it('accepts usernames at the length boundaries (3 to 20) and rejects one either side', async () => {
        expect((await signUpLearner({ username: `a${suffix()}` })).status).toBe(201);
        expect((await signUpLearner({ username: 'ab' })).status).toBe(400);
        expect((await signUpLearner({ username: `${'a'.repeat(20)}${suffix()}`.slice(-20) })).status).toBe(201);
        const long = await signUpLearner({ username: 'a'.repeat(21) });
        expect(long.status).toBe(400);
        expect(long.body.error).toBe('Username must be 3-20 letters, numbers, dots, dashes, or underscores');
    });

    it('accepts a 20-character password and rejects a 21-character one', async () => {
        expect((await signUpLearner({ password: 'abcdefghijklmnopqrs!' })).status).toBe(201);
        const long = await signUpLearner({ password: 'abcdefghijklmnopqrstu' });
        expect(long.status).toBe(400);
        expect(long.body.error).toBe('Password can be at most 20 characters');
    });

    it('accepts a 60-character email and rejects a 61-character one', async () => {
        const local = (length: number) => `${suffix()}${'e'.repeat(60)}`.slice(0, length);
        // "@example.test" is 13 characters.
        expect((await signUpGuardian({ email: `${local(47)}@example.test` })).status).toBe(201);
        const long = await signUpGuardian({ email: `${local(48)}@example.test` });
        expect(long.status).toBe(400);
        expect(long.body.issues).toContainEqual({ field: 'email', message: 'Email can be at most 60 characters' });
    });

    it('refuses an over-long sign-in with 400 before looking anyone up', async () => {
        const identifier = await request(app).post('/api/auth/login').send({ identifier: 'x'.repeat(61), password: 'password123' });
        expect(identifier.status).toBe(400);
        expect(identifier.body.error).toBe('Username or email can be at most 60 characters');
        const password = await request(app).post('/api/auth/login').send({ identifier: 'someone', password: 'p'.repeat(21) });
        expect(password.status).toBe(400);
        expect(password.body.error).toBe('Password can be at most 20 characters');
    });

    it('rejects an email without a domain suffix', async () => {
        const res = await signUpGuardian({ email: 'hehe@gmail' });
        expect(res.status).toBe(400);
        expect(res.body.issues).toContainEqual({ field: 'email', message: 'Email must be a valid email address' });
    });

    it('refuses a duplicate username and a duplicate email', async () => {
        const username = `twice${suffix()}`;
        await signUpLearner({ username });
        expect((await signUpLearner({ username })).status).toBe(409);

        const email = `twice${suffix()}@example.test`;
        await signUpGuardian({ email });
        expect((await signUpGuardian({ email })).status).toBe(409);
    });

    it('rejects a wrong password without issuing a session', async () => {
        const email = `wrong${suffix()}@example.test`;
        await signUpGuardian({ email });
        const res = await request(app).post('/api/auth/login').send({ identifier: email, password: 'not-the-one' });
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid credentials');
        expect(res.body.token).toBeUndefined();
    });

    it('refuses a protected request with no token, a malformed header, or a tampered token', async () => {
        expect((await request(app).get('/api/auth/me')).status).toBe(401);
        expect((await request(app).get('/api/auth/me').set('Authorization', 'Basic abc')).status).toBe(401);

        const { body } = await signUpLearner();
        const [header, payload] = body.token.split('.');
        const tampered = `${header}.${payload}.not-the-signature`;
        expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tampered}`)).status).toBe(401);
    });

    it('refuses an expired session token', async () => {
        const { body } = await signUpLearner();
        const expired = await SessionMethods.createSession(body.user, -1000);
        const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
        expect(res.status).toBe(401);
    });

    it('protects another slice\'s routes with the same gate', async () => {
        expect((await request(app).get('/api/content/getContent/1')).status).toBe(401);
    });
});

describe('parent linking', () => {
    /**
     * Sends two generation requests at the same time to prove that the learner
     * row lock serialises them and leaves only one unexpired database record.
     */
    it('returns one active code when a learner requests codes concurrently', async () => {
        // Create and authenticate the (child) learner whose concurrent requests are tested.
        const learner = (await signUpChild()).body;
        // Build the same authorised endpoint request each time this helper is called.
        const createCode = () => request(app).post('/api/auth/link-codes')
            // Attach the learner's token so the role guard permits generation.
            .set('Authorization', `Bearer ${learner.token}`);

        // Launch both requests together instead of waiting for the first to finish.
        const [first, second] = await Promise.all([createCode(), createCode()]);

        // Both callers should receive a successful creation response.
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        // The second request must reuse the first request's still-valid code.
        expect(second.body.code).toBe(first.body.code);

        // Count the learner's active rows directly to verify the database result.
        const { rows } = await pool.query<{ count: string }>(
            `SELECT count(*)::text AS count
               FROM parent_link_codes
              WHERE learner_id = $1 AND redeemed_at IS NULL AND expires_at > now()`,
            [learner.user.id],
        );
        // Exactly one unused, unexpired code may exist for the learner.
        expect(rows[0].count).toBe('1');
    });

    it('walks a learner code into a guardian redemption and the children list', async () => {
        const { learner, guardian, redeem } = await linkedPair();
        expect(redeem.status).toBe(201);
        expect(redeem.body.child.id).toBe(learner.user.id);

        const children = await request(app).get('/api/auth/children').set('Authorization', `Bearer ${guardian.token}`);
        expect(children.status).toBe(200);
        expect(children.body.children.map((child: { id: number }) => child.id)).toContain(learner.user.id);
    });

    it('tells a linked learner who their guardian is, by name only, and nobody else\'s', async () => {
        const { learner, guardian } = await linkedPair();
        const other = await linkedPair();
        const myGuardians = (token: string) => request(app).get('/api/auth/my-guardians')
            .set('Authorization', `Bearer ${token}`);

        const res = await myGuardians(learner.token);
        expect(res.status).toBe(200);
        expect(res.body.guardians).toEqual([
            { firstName: 'Gia', lastName: 'Guardian', linkedAt: expect.any(String) },
        ]);
        expect(JSON.stringify(res.body)).not.toContain(guardian.user.email);
        expect(JSON.stringify(res.body)).not.toContain(String(other.guardian.user.email));

        // A learner with no link hears of no guardian; a guardian may not ask.
        const unlinked = (await signUpChild()).body;
        expect((await myGuardians(unlinked.token)).body.guardians).toEqual([]);
        expect((await myGuardians(guardian.token)).status).toBe(403);

        // A link an administrator ended no longer counts.
        await pool.query(`UPDATE parent_child_links SET unlinked_at = now() WHERE learner_id = $1`, [learner.user.id]);
        expect((await myGuardians(learner.token)).body.guardians).toEqual([]);
    });

    it('lists no children before a code is redeemed', async () => {
        const guardian = (await signUpGuardian()).body;
        const res = await request(app).get('/api/auth/children').set('Authorization', `Bearer ${guardian.token}`);
        expect(res.body.children).toEqual([]);
    });

    it('accepts a code typed in lowercase with spaces around it', async () => {
        const learner = (await signUpChild()).body;
        const guardian = (await signUpGuardian()).body;
        const { code } = (await request(app).post('/api/auth/link-codes')
            .set('Authorization', `Bearer ${learner.token}`)).body;

        const res = await request(app).post('/api/auth/parent-links/redeem')
            .set('Authorization', `Bearer ${guardian.token}`)
            .send({ code: `  ${code.toLowerCase()}  ` });
        expect(res.status).toBe(201);
    });

    it('keeps blank, unknown, used and expired codes apart', async () => {
        const guardian = (await signUpGuardian()).body;
        const redeem = (code: unknown) => request(app).post('/api/auth/parent-links/redeem')
            .set('Authorization', `Bearer ${guardian.token}`).send({ code });

        expect((await redeem('')).status).toBe(400);
        expect((await redeem('ZZZZZZ')).status).toBe(404);

        const used = await linkedPair();
        expect((await redeem(used.code)).status).toBe(409);

        const learner = (await signUpLearner()).body;
        await pool.query(
            `INSERT INTO parent_link_codes (code, learner_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')`,
            ['EXPIRE', learner.user.id],
        );
        expect((await redeem('EXPIRE')).status).toBe(410);
    });

    it('lets only a learner create a link code', async () => {
        const guardian = (await signUpGuardian()).body;
        const res = await request(app).post('/api/auth/link-codes').set('Authorization', `Bearer ${guardian.token}`);
        expect(res.status).toBe(403);
    });

    it('gives no code to an adult learner, or to one who has not finished setup', async () => {
        const adult = (await signUpLearner()).body;
        await finishLearnerSetup(adult.user.id, 'adult');
        const notSetUp = (await signUpLearner()).body;

        for (const learner of [adult, notSetUp]) {
            const res = await request(app).post('/api/auth/link-codes').set('Authorization', `Bearer ${learner.token}`);
            expect(res.status).toBe(409);
            expect(res.body.error).toBe('only a learner under 13 can be linked to a guardian');
            const { rows } = await pool.query(`SELECT 1 FROM parent_link_codes WHERE learner_id = $1`, [learner.user.id]);
            expect(rows).toHaveLength(0);
        }
    });

    it('links nobody with a code whose learner has turned 13 since, and leaves the code unused', async () => {
        const learner = (await signUpChild()).body;
        const guardian = (await signUpGuardian()).body;
        const { code } = (await request(app).post('/api/auth/link-codes')
            .set('Authorization', `Bearer ${learner.token}`)).body;
        await finishLearnerSetup(learner.user.id, 'adult');

        const res = await request(app).post('/api/auth/parent-links/redeem')
            .set('Authorization', `Bearer ${guardian.token}`).send({ code });
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('only a learner under 13 can be linked to a guardian');

        const links = await pool.query(`SELECT 1 FROM parent_child_links WHERE learner_id = $1`, [learner.user.id]);
        expect(links.rowCount).toBe(0);
        const codes = await pool.query(`SELECT redeemed_at FROM parent_link_codes WHERE code = $1`, [code]);
        expect(codes.rows[0].redeemed_at).toBeNull();
    });

    it('keeps the link of a learner who has grown past 13, but gives them no new code', async () => {
        const { learner, guardian } = await linkedPair();
        // Time passes: the linked child is now an adult.
        await finishLearnerSetup(learner.user.id, 'adult');

        const access = await request(app).get('/api/onboarding/getAccess').set('Authorization', `Bearer ${learner.token}`);
        expect(access.status).toBe(200);
        expect(access.body).toMatchObject({ isUnder13: false, hasActiveParentLink: true, canAccessContent: true, contentAudience: 'general' });

        const children = await request(app).get('/api/auth/children').set('Authorization', `Bearer ${guardian.token}`);
        expect(children.body.children.map((child: { id: number }) => child.id)).toContain(learner.user.id);
        const { rows } = await pool.query(`SELECT unlinked_at FROM parent_child_links WHERE learner_id = $1`, [learner.user.id]);
        expect(rows).toEqual([{ unlinked_at: null }]);

        const code = await request(app).post('/api/auth/link-codes').set('Authorization', `Bearer ${learner.token}`);
        expect(code.status).toBe(409);
    });

    it('no longer serves the old progress report route: the guardian report replaced it', async () => {
        const { learner, guardian } = await linkedPair();
        const res = await request(app)
            .get(`/api/auth/children/${learner.user.id}/progress`)
            .set('Authorization', `Bearer ${guardian.token}`);
        expect(res.status).toBe(404);
    });
});

describe('a child with more than one guardian', () => {
    const createCode = (token: string) => request(app).post('/api/auth/link-codes').set('Authorization', `Bearer ${token}`);
    const redeemAs = (token: string, code: string) => request(app).post('/api/auth/parent-links/redeem')
        .set('Authorization', `Bearer ${token}`).send({ code });
    const activeLinks = async (learnerId: number) => (await pool.query(
        `SELECT guardian_id FROM parent_child_links WHERE learner_id = $1 AND unlinked_at IS NULL ORDER BY linked_at`,
        [learnerId],
    )).rows.map((row: { guardian_id: number }) => row.guardian_id);

    it('makes new codes only from letters and digits that cannot be mixed up', async () => {
        const learner = (await signUpChild()).body;
        const { code } = (await createCode(learner.token)).body;
        expect(code).toMatch(new RegExp(`^[${LINK_CODE_ALPHABET}]{6}$`));
        expect(code).not.toMatch(/[01OIL]/);
    });

    it('accepts a code read out with a space or a dash in the middle', async () => {
        for (const spell of [(code: string) => `${code.slice(0, 3)} ${code.slice(3)}`, (code: string) => `${code.slice(0, 3)}-${code.slice(3).toLowerCase()}`]) {
            const learner = (await signUpChild()).body;
            const guardian = (await signUpGuardian()).body;
            const { code } = (await createCode(learner.token)).body;
            expect((await redeemAs(guardian.token, spell(code))).status).toBe(201);
        }
    });

    it('links a child to a second guardian, and both follow the child', async () => {
        const { learner, guardian: first } = await linkedPair();
        const second = (await signUpGuardian({ firstName: 'Sipho' })).body;

        // Already linked, the child still gets a code for another grown-up.
        const again = await createCode(learner.token);
        expect(again.status).toBe(201);
        const redeemed = await redeemAs(second.token, again.body.code);
        expect(redeemed.status).toBe(201);
        expect(await activeLinks(learner.user.id)).toEqual([first.user.id, second.user.id]);

        const guardians = await request(app).get('/api/auth/my-guardians').set('Authorization', `Bearer ${learner.token}`);
        expect(guardians.body.guardians.map((guardian: { firstName: string }) => guardian.firstName)).toEqual(['Gia', 'Sipho']);

        // Each guardian sees the child, opens the report, and may correct the date of birth.
        const dateOfBirth = `${new Date().getUTCFullYear() - 9}-03-04`;
        for (const guardian of [first, second]) {
            const children = await request(app).get('/api/auth/children').set('Authorization', `Bearer ${guardian.token}`);
            expect(children.body.children.map((child: { id: number }) => child.id)).toEqual([learner.user.id]);
            const report = await request(app).get(`/api/guardians/me/children/${learner.user.id}/report`)
                .set('Authorization', `Bearer ${guardian.token}`);
            expect(report.status).toBe(200);
            const dob = await request(app).put(`/api/onboarding/children/${learner.user.id}/dateOfBirth`)
                .set('Authorization', `Bearer ${guardian.token}`).send({ dateOfBirth });
            expect(dob.status).toBe(200);
            expect(dob.body.dateOfBirth).toBe(dateOfBirth);
        }
    });

    it('refuses the same guardian twice, and leaves the code for someone else', async () => {
        const { learner, guardian } = await linkedPair();
        const { code } = (await createCode(learner.token)).body;

        const twice = await redeemAs(guardian.token, code);
        expect(twice.status).toBe(409);
        expect(twice.body.error).toBe(ALREADY_LINKED_TO_YOU);
        expect(await activeLinks(learner.user.id)).toEqual([guardian.user.id]);
        const stored = await pool.query(`SELECT redeemed_at FROM parent_link_codes WHERE code = $1`, [code]);
        expect(stored.rows[0].redeemed_at).toBeNull();

        const other = (await signUpGuardian()).body;
        expect((await redeemAs(other.token, code)).status).toBe(201);
    });

    it(`stops at ${MAX_ACTIVE_GUARDIANS} guardians: no further code, and no further redemption`, async () => {
        const learner = (await signUpChild()).body;
        for (let index = 0; index < MAX_ACTIVE_GUARDIANS; index += 1) {
            const guardian = (await signUpGuardian()).body;
            const { code } = (await createCode(learner.token)).body;
            expect((await redeemAs(guardian.token, code)).status).toBe(201);
        }

        const refused = await createCode(learner.token);
        expect(refused.status).toBe(409);
        expect(refused.body.error).toBe(GUARDIAN_LIMIT_REACHED);

        // A code made before the limit was reached links nobody once it is.
        await pool.query(
            `UPDATE parent_child_links SET unlinked_at = now()
              WHERE link_id = (SELECT max(link_id) FROM parent_child_links WHERE learner_id = $1)`,
            [learner.user.id],
        );
        const { code } = (await createCode(learner.token)).body;
        await pool.query(
            `UPDATE parent_child_links SET unlinked_at = NULL
              WHERE link_id = (SELECT max(link_id) FROM parent_child_links WHERE learner_id = $1)`,
            [learner.user.id],
        );
        const late = (await signUpGuardian()).body;
        const lateRedeem = await redeemAs(late.token, code);
        expect(lateRedeem.status).toBe(409);
        expect(lateRedeem.body.error).toBe(GUARDIAN_LIMIT_REACHED);
        expect(await activeLinks(learner.user.id)).toHaveLength(MAX_ACTIVE_GUARDIANS);
    });

    it('gives a linked learner who has turned 13 no code for another guardian', async () => {
        const { learner, guardian } = await linkedPair();
        await finishLearnerSetup(learner.user.id, 'adult');

        const refused = await createCode(learner.token);
        expect(refused.status).toBe(409);
        expect(refused.body.error).toBe('only a learner under 13 can be linked to a guardian');
        expect(await activeLinks(learner.user.id)).toEqual([guardian.user.id]);
    });
});
