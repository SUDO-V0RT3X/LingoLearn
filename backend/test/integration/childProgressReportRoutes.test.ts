// These integration tests call the real Express route through Supertest and PostgreSQL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { MAX_LEVEL, TESTS_REQUIRED_PER_LEVEL } from '../../src/shared/levelRules.js';
import { accountWithToken, childWithToken, deleteTestAccounts, finishLearnerSetup } from '../helpers/accounts.js';
import { ALL_RIGHT, deleteTestContent, insertContent } from '../helpers/learnerContent.js';

// Supply the secret used to create and verify integration-test sessions.
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';
// Create one Express application with all production routes mounted.
const app = createApp();

// One author owns the content the learners take tests on.
let authorId = 0;
beforeAll(async () => {
    authorId = (await accountWithToken('author')).user.id;
});

// Remove every test account, its content and relationships after this file completes.
afterAll(async () => {
    await deleteTestContent();
    await deleteTestAccounts();
});

// This helper links a guardian to a learner, as redeeming the learner's code does.
async function link(guardianId: number, learnerId: number) {
    await pool.query(
        `INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`,
        [guardianId, learnerId],
    );
}

// This helper creates a guardian and a child (setup finished, isiZulu, no level yet) linked to them.
async function linkedGuardianAndChild() {
    const guardian = await accountWithToken('guardian');
    const learner = await childWithToken();
    await link(guardian.user.id, learner.user.id);
    return { guardian, learner };
}

// This helper places a learner at a level.
async function place(learnerId: number, level: number) {
    await pool.query(
        `INSERT INTO learner_levels (user_id, level_number) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET level_number = EXCLUDED.level_number`,
        [learnerId, level],
    );
}

// This helper records passed tests straight into test_attempts, for the level-up counts.
async function passedTestsAt(learnerId: number, level: number, count: number) {
    for (let index = 0; index < count; index += 1) {
        const contentId = await insertContent(authorId, { level });
        await pool.query(
            `INSERT INTO test_attempts (content_id, learner_id, level, language, answers, total, score, percent, passed)
             VALUES ($1, $2, $3, 'english', '[]'::jsonb, 3, 3, 100, true)`,
            [contentId, learnerId, level],
        );
    }
}

const report = (token: string, childId: number, query = '') => request(app)
    .get(`/api/guardians/me/children/${childId}/report${query}`)
    .set('Authorization', `Bearer ${token}`);

// Group the report endpoint's access and method behavior.
describe('GET /api/guardians/me/children/:childId/report', () => {
    // A child who has done nothing yet: not placed, no tests, child-friendly content.
    it('reports a linked child who has not been placed or taken a test yet', async () => {
        const { guardian, learner } = await linkedGuardianAndChild();
        const response = await report(guardian.token, learner.user.id);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            child: {
                id: learner.user.id,
                firstName: learner.user.firstName,
                languages: ['zu'],
                activeLanguage: 'zu',
                lastActiveAt: null,
            },
            summary: {
                level: null,
                completed: 0,
                avgScore: null,
                levelUp: { testsPassed: 0, testsRequired: TESTS_REQUIRED_PER_LEVEL },
            },
            challenge: { state: 'locked', cooldownEndsAt: null },
            recentActivity: [],
            settings: { childFriendly: true },
        });
        const codes = response.body.flags.map((flag: { code: string }) => flag.code);
        expect(codes).toEqual(expect.arrayContaining(['INACTIVE', 'PLACEMENT_UNSET']));
    });

    // The scenario the guardian cares about: the child takes a test and passes it.
    it('shows the level, the test, the average and progress once a linked child passes a test', async () => {
        const { guardian, learner } = await linkedGuardianAndChild();
        await place(learner.user.id, 1);
        const contentId = await insertContent(authorId, { title: 'Greetings quiz' });
        const submitted = await request(app).post('/api/testAttempts/submit')
            .set('Authorization', `Bearer ${learner.token}`)
            .send({ contentId, answers: ALL_RIGHT });
        expect(submitted.status).toBe(201);
        expect(submitted.body.passed).toBe(true);

        const response = await report(guardian.token, learner.user.id);
        expect(response.status).toBe(200);
        expect(response.body.summary).toEqual({
            level: 1,
            completed: 1,
            avgScore: 100,
            levelUp: { testsPassed: 1, testsRequired: TESTS_REQUIRED_PER_LEVEL },
        });
        expect(response.body.challenge).toEqual({ state: 'locked', cooldownEndsAt: null });
        expect(response.body.recentActivity).toEqual([{
            contentId,
            title: 'Greetings quiz',
            type: 'test',
            score: 100,
            outcome: 'passed',
            occurredAt: expect.any(String),
            level: 1,
        }]);
        expect(response.body.child.lastActiveAt).toBe(response.body.recentActivity[0].occurredAt);
        expect(response.body.flags).toEqual([]);
        // The guardian never sees what the right answers were.
        expect(JSON.stringify(response.body)).not.toMatch(/correctOption|accepted|answers|Sawubona|sawubona/);
    });

    // The guardian and the learner's own My learning page count the same way.
    it('agrees with the learner\'s My learning counts, and lists reading newest first', async () => {
        const { guardian, learner } = await linkedGuardianAndChild();
        await place(learner.user.id, 1);
        const contentId = await insertContent(authorId, { title: 'Two tries' });
        const submit = (answers: unknown[]) => request(app).post('/api/testAttempts/submit')
            .set('Authorization', `Bearer ${learner.token}`).send({ contentId, answers });
        expect((await submit([0, 'goodbye', 1])).status).toBe(201);
        expect((await submit(ALL_RIGHT)).status).toBe(201);
        const readingId = await insertContent(authorId, { title: 'A story' });
        expect((await request(app).put(`/api/reading/saveProgress/${readingId}`)
            .set('Authorization', `Bearer ${learner.token}`)
            .send({ page: 1, totalPages: 3 })).status).toBe(200);

        const [guardianView, learnerView] = await Promise.all([
            report(guardian.token, learner.user.id),
            request(app).get('/api/testAttempts/myLearning').set('Authorization', `Bearer ${learner.token}`),
        ]);
        expect(guardianView.body.summary.completed).toBe(learnerView.body.testsCompleted);
        expect(guardianView.body.summary.avgScore).toBe(learnerView.body.averagePercent);
        expect(guardianView.body.summary.levelUp.testsPassed).toBe(learnerView.body.testsPassedAtLevel);
        expect(guardianView.body.summary).toMatchObject({ completed: 1, avgScore: 100 });
        expect(guardianView.body.recentActivity.map((row: { type: string; outcome: string }) => [row.type, row.outcome]))
            .toEqual([['lesson', 'in_progress'], ['test', 'passed'], ['test', 'failed']]);
    });

    // The challenge line matches the learner's level-up screen.
    it('shows the challenge as eligible, cooling down, or done at the top level', async () => {
        const { guardian, learner } = await linkedGuardianAndChild();
        await place(learner.user.id, 2);
        await passedTestsAt(learner.user.id, 2, TESTS_REQUIRED_PER_LEVEL);

        const eligible = await report(guardian.token, learner.user.id);
        expect(eligible.body.summary.levelUp).toEqual({ testsPassed: TESTS_REQUIRED_PER_LEVEL, testsRequired: TESTS_REQUIRED_PER_LEVEL });
        expect(eligible.body.challenge).toEqual({ state: 'eligible', cooldownEndsAt: null });

        await pool.query(
            `INSERT INTO level_challenges (learner_id, language, target_level, score, passed, cooldown_until, submitted_at)
             VALUES ($1, 'english', 3, 20, false, now() + interval '1 day', now())`,
            [learner.user.id],
        );
        const cooling = await report(guardian.token, learner.user.id);
        expect(cooling.body.challenge.state).toBe('cooldown');
        expect(Date.parse(cooling.body.challenge.cooldownEndsAt)).toBeGreaterThan(Date.now());
        expect(cooling.body.recentActivity[0]).toMatchObject({ type: 'challenge', outcome: 'failed', score: 20, level: 3 });
        expect(cooling.body.flags.map((flag: { code: string }) => flag.code)).toContain('CHALLENGE_FAILED');
        await pool.query(`DELETE FROM level_challenges WHERE learner_id = $1`, [learner.user.id]);

        await place(learner.user.id, MAX_LEVEL);
        const top = await report(guardian.token, learner.user.id);
        expect(top.body.summary.level).toBe(MAX_LEVEL);
        expect(top.body.challenge.state).toBe('max_level');
    });

    // Child-friendly content follows the learner's age, as every content gate decides it.
    it('shows child-friendly content as disabled for a linked learner who has turned 13', async () => {
        const { guardian, learner } = await linkedGuardianAndChild();
        await finishLearnerSetup(learner.user.id, 'adult');
        const response = await report(guardian.token, learner.user.id);
        expect(response.status).toBe(200);
        expect(response.body.settings).toEqual({ childFriendly: false });
    });

    // Verify a guardian cannot read a learner without an Identity link row.
    it('returns 403 Access denied for an unlinked child, another guardian\'s child, or an ended link', async () => {
        const { guardian, learner } = await linkedGuardianAndChild();
        const stranger = await accountWithToken('guardian');
        const unlinked = await childWithToken();

        for (const [token, childId] of [[stranger.token, learner.user.id], [guardian.token, unlinked.user.id]] as const) {
            const response = await report(token, childId);
            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Access denied');
        }

        await pool.query(`UPDATE parent_child_links SET unlinked_at = now() WHERE learner_id = $1`, [learner.user.id]);
        expect((await report(guardian.token, learner.user.id)).status).toBe(403);
    });

    // Verify bad route and query values are refused before the report is built.
    it('returns 400 for a bad child id or language', async () => {
        const { guardian, learner } = await linkedGuardianAndChild();
        expect((await report(guardian.token, learner.user.id, '?language=fr')).status).toBe(400);
        expect((await request(app).get('/api/guardians/me/children/abc/report')
            .set('Authorization', `Bearer ${guardian.token}`)).status).toBe(400);
        // A supported language is accepted; the report still covers all of the child's learning.
        expect((await report(guardian.token, learner.user.id, '?language=en')).body.child.activeLanguage).toBe('zu');
    });

    // Verify RoleGuard rejects an authenticated learner before report generation.
    it('rejects a learner-role token through RoleGuard', async () => {
        // Create a learner account and session token.
        const learner = await accountWithToken('learner');
        // Request the report with the learner bearer token.
        const response = await request(app)
            .get(`/api/guardians/me/children/${learner.user.id}/report`)
            .set('Authorization', `Bearer ${learner.token}`);

        // Confirm RoleGuard returns its forbidden status.
        expect(response.status).toBe(403);
        // Confirm the response comes from RoleGuard.
        expect(response.body.error).toBe('insufficient role');
    });

    // Verify no mutation methods are registered for the report path.
    it('returns 404 for PUT, PATCH, and DELETE on the report path', async () => {
        // Create a guardian token that can pass the global authentication gate.
        const guardian = await accountWithToken('guardian');
        // Use one positive child id because the mutation requests never enter the GET handler.
        const path = '/api/guardians/me/children/1/report';
        // Send each unsupported mutation method with the guardian token.
        const responses = await Promise.all([
            request(app).put(path).set('Authorization', `Bearer ${guardian.token}`),
            request(app).patch(path).set('Authorization', `Bearer ${guardian.token}`),
            request(app).delete(path).set('Authorization', `Bearer ${guardian.token}`),
        ]);
        // Confirm each request reaches the shared no-such-endpoint response.
        expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
    });
});
