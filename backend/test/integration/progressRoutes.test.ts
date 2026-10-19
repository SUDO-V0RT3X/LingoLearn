// PROGRESSION integration tests: the level-up challenge over the real Express
// app and database. Every account, piece of content and test attempt here is
// created by the test itself, so it runs on an empty database (migrations only)
// as well as on one holding the demo seed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';
import { gradeAnswers } from '../../src/shared/grading.js';
import { TESTS_REQUIRED_PER_LEVEL, challengeCooldownMinutes, passMarkForLevel } from '../../src/shared/levelRules.js';
import type { ContentBlock } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';

const app = createApp();

const authed = (token: string) => ({
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${token}`),
});

let authorId = 0;
const contentIds: number[] = [];
const testContentIds: number[] = [];

const choice = (question: string, correctOption = 0): ContentBlock => ({
    itemType: 'Multiple Choice',
    value: { title: '', question, options: ['Sawubona', 'Hamba kahle', 'Ngiyabonga'], correctOption },
});
const gap = (sentence: string, accepted: string[]): ContentBlock => ({
    itemType: 'Fill in the Blank',
    value: { title: '', sentence, accepted },
});

/** Approved content written straight to the table, as if a moderator had approved it. */
async function approvedContent(level: number, pages: ContentBlock[][], childFriendly = true, language = 'english') {
    const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO content (author_id, status, title, language, child_friendly, level, content, version, submitted_at)
         VALUES ($1, 'approved', 'Challenge test content', $2, $3, $4, $5::jsonb, 1, now())
         RETURNING id`,
        [authorId, language, childFriendly, level, JSON.stringify(pages)]);
    contentIds.push(rows[0].id);
    return rows[0].id;
}

/** A learner who has finished setup, at a level, signed in. */
async function learner(level: number, dateOfBirth = '1995-04-01') {
    const account = await accountWithToken('learner');
    await pool.query(
        `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
         VALUES ($1, 'english', $2::date, 'english', 15)`,
        [account.user.id, dateOfBirth]);
    await pool.query(`INSERT INTO learner_levels (user_id, level_number) VALUES ($1, $2)`, [account.user.id, level]);
    return { id: account.user.id, api: authed(account.token) };
}

/** Records passes on the required number of different tests at a level (and one retake, which must count once). */
async function passRequiredTests(learnerId: number, level: number) {
    for (const contentId of [...testContentIds, testContentIds[0]]) {
        await pool.query(
            `INSERT INTO test_attempts (content_id, learner_id, level, language, answers, total, score, percent, passed)
             VALUES ($1, $2, $3, 'english', '[0]', 1, 1, 100, true)`,
            [contentId, learnerId, level]);
    }
}

/** The questions the server stored for a challenge, answers included. */
async function storedQuestions(challengeId: number): Promise<ContentBlock[]> {
    const { rows } = await pool.query(`SELECT questions FROM level_challenges WHERE id = $1`, [challengeId]);
    return rows[0].questions;
}

/** The right answer to each stored question, worked out from the stored copy. */
function rightAnswers(questions: ContentBlock[]): (number | string)[] {
    return questions.map(block => block.itemType === 'Fill in the Blank'
        ? (block.value.accepted as string[])[0]
        : block.value.correctOption as number);
}

beforeAll(async () => {
    authorId = (await accountWithToken('author')).user.id;
    // As many different tests as a learner must pass.
    for (let i = 0; i < TESTS_REQUIRED_PER_LEVEL; i++) testContentIds.push(await approvedContent(1, [[choice(`Test ${i}`)]]));
    // Level 2 questions, in the learners' language, for their challenge.
    await approvedContent(2, [[choice('Hello?'), choice('Goodbye?', 1)], [gap('Ngi[] kahle', ['philile'])]]);
    await approvedContent(2, [[choice('Thank you?', 2), choice('Hello again?'), gap('Ngiya[]', ['bonga', 'Bonga'])]]);
});

afterAll(async () => {
    await pool.query(`DELETE FROM content WHERE id = ANY($1::int[])`, [contentIds]);
    await deleteTestAccounts();
});

describe('eligibility', () => {
    it('a new learner sees their progress and is not yet eligible', async () => {
        const { api } = await learner(1);
        const res = await api.get('/api/progress/checkEligibility');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            currentLevel: 1, targetLevel: 2, testsPassed: 0, testsRequired: TESTS_REQUIRED_PER_LEVEL,
            eligible: false, reason: 'requirement_not_met', cooldownUntil: null, inProgress: false,
            passMark: await passMarkForLevel(2),
        });
    });

    it('the required number of different passed tests (a retake counted once) make them eligible', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const res = await api.get('/api/progress/checkEligibility');
        expect(res.body).toMatchObject({ testsPassed: TESTS_REQUIRED_PER_LEVEL, eligible: true, reason: null });
    });

    it('passes at another level do not count', async () => {
        const { id, api } = await learner(2);
        await passRequiredTests(id, 1);
        expect((await api.get('/api/progress/checkEligibility')).body).toMatchObject({ currentLevel: 2, testsPassed: 0, eligible: false });
    });

    it('a learner at the top level has nowhere to go', async () => {
        const { id, api } = await learner(6);
        await passRequiredTests(id, 6);
        const res = await api.get('/api/progress/checkEligibility');
        expect(res.body).toMatchObject({ currentLevel: 6, targetLevel: null, passMark: null, eligible: false, reason: 'max_level' });
        expect((await api.post('/api/progress/startChallenge')).status).toBe(403);
    });

    it('is for learners only, and needs a session', async () => {
        expect((await request(app).get('/api/progress/checkEligibility')).status).toBe(401);
        const moderator = await accountWithToken('moderator');
        expect((await authed(moderator.token).get('/api/progress/checkEligibility')).status).toBe(403);
        expect((await authed(moderator.token).post('/api/progress/startChallenge')).status).toBe(403);
    });
});

describe('starting a challenge', () => {
    it('is refused (403) to a learner who is not eligible', async () => {
        const { api } = await learner(1);
        const res = await api.post('/api/progress/startChallenge');
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(new RegExp(`${TESTS_REQUIRED_PER_LEVEL} different tests`));
    });

    it('draws questions from the next level without their answers, and keeps the answers on the server', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);

        const res = await api.post('/api/progress/startChallenge');
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body).toMatchObject({ targetLevel: 2, resumed: false });
        expect(Number.isInteger(res.body.challengeId)).toBe(true);
        expect(res.body.questions.length).toBeGreaterThanOrEqual(5);
        expect(res.body.questions.length).toBeLessThanOrEqual(15);
        for (const question of res.body.questions) {
            expect(['Multiple Choice', 'Fill in the Blank', 'Listen and Choose']).toContain(question.itemType);
            expect(question.value).not.toHaveProperty('correctOption');
            expect(question.value).not.toHaveProperty('accepted');
            // A listening question's transcript is the answer spoken aloud.
            expect(question.value).not.toHaveProperty('transcript');
        }
        expect(JSON.stringify(res.body)).not.toContain('philile');
        expect(res.body.answers).toEqual([]);

        const stored = await storedQuestions(res.body.challengeId);
        expect(stored).toHaveLength(res.body.questions.length);
        expect(stored.some(block => 'correctOption' in block.value || 'accepted' in block.value)).toBe(true);
    });

    it('starting again resumes the same questions instead of drawing new ones', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const first = await api.post('/api/progress/startChallenge');
        const second = await api.post('/api/progress/startChallenge');
        expect(second.status).toBe(200);
        expect(second.body.challengeId).toBe(first.body.challengeId);
        expect(second.body.resumed).toBe(true);
        expect(second.body.questions).toEqual(first.body.questions);
        expect((await api.get('/api/progress/checkEligibility')).body.inProgress).toBe(true);
    });

    it('a child only gets questions from child-friendly content', async () => {
        const guardian = await accountWithToken('guardian');
        const child = await learner(2, '2017-06-01');
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`, [guardian.user.id, child.id]);
        await passRequiredTests(child.id, 2);
        await approvedContent(3, [[1, 2, 3, 4, 5].map(i => choice(`Friendly ${i}`))], true);
        await approvedContent(3, [[1, 2, 3, 4, 5].map(i => choice(`Grown-up only ${i}`))], false);

        const res = await child.api.post('/api/progress/startChallenge');
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body.questions)).not.toContain('Grown-up only');
    });

    it('is refused (409) when the next level has fewer than 5 approved questions', async (ctx) => {
        // Level 6 is the one this test needs to be short of questions. On a
        // database whose seed already has enough there, the case cannot be set up.
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM content c, jsonb_array_elements(c.content) page, jsonb_array_elements(page) block
              WHERE c.status = 'approved' AND c.level = 6
                AND block->>'itemType' IN ('Multiple Choice', 'Fill in the Blank', 'Listen and Choose')`);
        if (rows[0].n >= 5) ctx.skip();

        const { id, api } = await learner(5);
        await passRequiredTests(id, 5);
        await approvedContent(6, [[choice('Only one')]]);
        const res = await api.post('/api/progress/startChallenge');
        expect(res.status).toBe(409);
        expect((await pool.query(`SELECT 1 FROM level_challenges WHERE learner_id = $1`, [id])).rows).toHaveLength(0);
    });
});

describe('leaving and resuming a challenge', () => {
    const save = (api: Awaited<ReturnType<typeof learner>>['api'], challengeId: number, answers: unknown) =>
        api.post('/api/progress/saveChallengeAnswers').send({ challengeId, answers });

    it('answers saved on the way through come back when the learner resumes', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const started = await api.post('/api/progress/startChallenge');
        const challengeId = started.body.challengeId;

        const saved = await save(api, challengeId, [0, 'ngiyabonga']);
        expect(saved.status).toBe(200);
        expect(saved.body).toEqual({ challengeId, answered: 2 });

        const resumed = await api.post('/api/progress/startChallenge');
        expect(resumed.body).toMatchObject({ challengeId, resumed: true, answers: [0, 'ngiyabonga'] });
        expect(resumed.body.questions).toEqual(started.body.questions);
    });

    it('is forward only: an answer already saved cannot be changed', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const challengeId = (await api.post('/api/progress/startChallenge')).body.challengeId;

        await save(api, challengeId, [0, 'first']);
        expect((await save(api, challengeId, [1])).body.answered).toBe(2);
        expect((await save(api, challengeId, [2, 'changed', null])).body.answered).toBe(3);
        expect((await api.post('/api/progress/startChallenge')).body.answers).toEqual([0, 'first', null]);
    });

    it('the saved answers are the ones marked, whatever the final submission says about them', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const started = await api.post('/api/progress/startChallenge');
        const answers = rightAnswers(await storedQuestions(started.body.challengeId));

        // The first question was skipped on the way through (null is never right).
        await save(api, started.body.challengeId, [null]);
        const res = await api.post('/api/progress/submitChallenge').send({ challengeId: started.body.challengeId, answers });
        expect(res.status).toBe(200);
        expect(res.body.score).toBe(answers.length - 1);
    });

    it('refuses saving to a challenge that is not the learner\'s, is submitted, or with malformed answers', async () => {
        const owner = await learner(1);
        await passRequiredTests(owner.id, 1);
        const started = await owner.api.post('/api/progress/startChallenge');
        const challengeId = started.body.challengeId;
        const total = started.body.questions.length;

        const other = await learner(1);
        expect((await save(other.api, challengeId, [0])).status).toBe(403);
        expect((await save(owner.api, challengeId, 'all of them')).status).toBe(400);
        expect((await save(owner.api, challengeId, [{}])).status).toBe(400);
        expect((await save(owner.api, challengeId, Array(total + 1).fill(0))).status).toBe(400);
        expect((await save(owner.api, 2147483647, [0])).status).toBe(404);
        expect((await save(owner.api, 'one', [0])).status).toBe(400);

        await owner.api.post('/api/progress/submitChallenge').send({ challengeId, answers: Array(total).fill(null) });
        expect((await save(owner.api, challengeId, [0])).status).toBe(409);
    });
});

describe('submitting a challenge', () => {
    it('is graded on the server: the right answers pass and level the learner up', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const started = await api.post('/api/progress/startChallenge');
        const answers = rightAnswers(await storedQuestions(started.body.challengeId));

        const res = await api.post('/api/progress/submitChallenge')
            // Score fields from the client are ignored: only the answers are read.
            .send({ challengeId: started.body.challengeId, answers, correctCount: 0, totalQuestions: 99 });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            passed: true,
            score: answers.length,
            total: answers.length,
            percent: 100,
            passMark: await passMarkForLevel(2),
            newLevel: 2,
            cooldownUntil: null,
        });
        expect((await api.get('/api/progress/getMyLevel')).body).toEqual({ level: 2 });

        const after = await api.get('/api/progress/checkEligibility');
        expect(after.body).toMatchObject({ currentLevel: 2, targetLevel: 3, testsPassed: 0, eligible: false });
    });

    it('a score under the pass mark fails, keeps the level and starts the cooldown', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const started = await api.post('/api/progress/startChallenge');
        const stored = await storedQuestions(started.body.challengeId);
        const answers = stored.map(() => null);

        const before = Date.now();
        const res = await api.post('/api/progress/submitChallenge').send({ challengeId: started.body.challengeId, answers });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ passed: false, score: 0, percent: 0, newLevel: 1 });
        const cooldown = new Date(res.body.cooldownUntil).getTime();
        const wait = challengeCooldownMinutes() * 60_000;
        expect(cooldown).toBeGreaterThan(before + wait - 60_000);
        expect(cooldown).toBeLessThan(before + wait + 60_000);

        expect(gradeAnswers([stored], answers).percent).toBe(0);
        expect((await api.get('/api/progress/getMyLevel')).body).toEqual({ level: 1 });

        const elig = await api.get('/api/progress/checkEligibility');
        expect(elig.body).toMatchObject({ eligible: false, reason: 'cooldown_active', cooldownUntil: res.body.cooldownUntil });
        expect(elig.body.secondsRemaining).toBeGreaterThan(challengeCooldownMinutes() * 60 - 60);
        expect(elig.body.cooldownMinutes).toBe(challengeCooldownMinutes());
        expect((await api.post('/api/progress/startChallenge')).status).toBe(403);
    });

    it('cannot be submitted twice', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const started = await api.post('/api/progress/startChallenge');
        const answers = rightAnswers(await storedQuestions(started.body.challengeId));
        expect((await api.post('/api/progress/submitChallenge').send({ challengeId: started.body.challengeId, answers })).status).toBe(200);
        const again = await api.post('/api/progress/submitChallenge').send({ challengeId: started.body.challengeId, answers });
        expect(again.status).toBe(409);
        expect((await api.get('/api/progress/getMyLevel')).body).toEqual({ level: 2 });
    });

    it('cannot be submitted by another learner', async () => {
        const owner = await learner(1);
        await passRequiredTests(owner.id, 1);
        const started = await owner.api.post('/api/progress/startChallenge');
        const answers = rightAnswers(await storedQuestions(started.body.challengeId));

        const other = await learner(1);
        const res = await other.api.post('/api/progress/submitChallenge').send({ challengeId: started.body.challengeId, answers });
        expect(res.status).toBe(403);
        expect((await other.api.get('/api/progress/getMyLevel')).body).toEqual({ level: 1 });
        // Still open for its owner.
        expect((await owner.api.post('/api/progress/submitChallenge').send({ challengeId: started.body.challengeId, answers })).status).toBe(200);
    });

    it('refuses a malformed submission without using up the attempt', async () => {
        const { id, api } = await learner(1);
        await passRequiredTests(id, 1);
        const started = await api.post('/api/progress/startChallenge');
        const challengeId = started.body.challengeId;

        expect((await api.post('/api/progress/submitChallenge').send({ challengeId, answers: [0] })).status).toBe(400);
        expect((await api.post('/api/progress/submitChallenge').send({ challengeId, answers: 'all right' })).status).toBe(400);
        expect((await api.post('/api/progress/submitChallenge').send({ challengeId: 'one', answers: [] })).status).toBe(400);
        expect((await api.post('/api/progress/submitChallenge').send({ challengeId: 2147483647, answers: [] })).status).toBe(404);

        const answers = started.body.questions.map(() => null);
        expect((await api.post('/api/progress/submitChallenge').send({ challengeId, answers })).status).toBe(200);
    });
});
