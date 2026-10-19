// TEST ATTEMPTS integration tests — the real Express app over the real database
// (docker locally). Every row a test creates is deleted afterwards.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { MAX_LEVEL, TESTS_REQUIRED_PER_LEVEL } from '../../src/shared/levelRules.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';
import { ALL_RIGHT, deleteTestContent, insertContent, learnerAt, text } from '../helpers/learnerContent.js';

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';
const app = createApp();

let authorId = 0;
beforeAll(async () => {
    authorId = (await accountWithToken('author')).user.id;
});

afterAll(async () => {
    await deleteTestContent();
    await deleteTestAccounts();
});

const submit = (token: string, body: object) => request(app).post('/api/testAttempts/submit')
    .set('Authorization', `Bearer ${token}`).send(body);
const myLearning = (token: string) => request(app).get('/api/testAttempts/myLearning')
    .set('Authorization', `Bearer ${token}`);

describe('POST /api/testAttempts/submit', () => {
    it('nominal: all answers right passes, is recorded, and says which were right', async () => {
        const contentId = await insertContent(authorId);
        const learner = await learnerAt(1);

        const res = await submit(learner.token, { contentId, answers: ALL_RIGHT });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            contentId, total: 3, score: 3, percent: 100, passed: true,
            questions: [{ correct: true }, { correct: true }, { correct: true }],
        });
        expect(Number.isInteger(res.body.attemptId)).toBe(true);
        expect(typeof res.body.passMark).toBe('number');
        // A test at the learner's own level counts toward their level-up challenge.
        expect(res.body.countsTowardLevelUp).toBe(true);

        const { rows } = await pool.query(
            `SELECT learner_id, level, language, score, total, passed FROM test_attempts WHERE id = $1`, [res.body.attemptId]);
        expect(rows[0]).toEqual({ learner_id: learner.user.id, level: 1, language: 'english', score: 3, total: 3, passed: true });
    });

    it('nominal: all answers wrong fails, without saying what the right answers were', async () => {
        const contentId = await insertContent(authorId);
        const learner = await learnerAt(1);

        const res = await submit(learner.token, { contentId, answers: [0, 'goodbye', 1] });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ score: 0, percent: 0, passed: false,
                                         questions: [{ correct: false }, { correct: false }, { correct: false }] });
        // Searched as text, so an answer field anywhere in the response fails the test.
        expect(JSON.stringify(res.body)).not.toMatch(/correctOption|accepted|Sawubona|sawubona|options/);
    });

    it('a pass on a test below the learner\'s level is practice: it does not count toward levelling up', async () => {
        const contentId = await insertContent(authorId, { level: 1 });
        const learner = await learnerAt(2);

        const res = await submit(learner.token, { contentId, answers: ALL_RIGHT });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ passed: true, countsTowardLevelUp: false });
        expect((await myLearning(learner.token)).body.testsPassedAtLevel).toBe(0);
    });

    it('boundary: two of three (67%) is judged against the level\'s pass mark', async () => {
        const contentId = await insertContent(authorId);
        const learner = await learnerAt(1);

        const res = await submit(learner.token, { contentId, answers: [1, 'sawubona ', null] });
        expect(res.status).toBe(201);
        expect(res.body.percent).toBe(67);
        expect(res.body.passed).toBe(67 >= res.body.passMark);
    });

    it('invalid input: a missing contentId, the wrong number of answers, or answers that are not a list are 400', async () => {
        const contentId = await insertContent(authorId);
        const learner = await learnerAt(1);

        expect((await submit(learner.token, { answers: ALL_RIGHT })).status).toBe(400);
        expect((await submit(learner.token, { contentId: 'one', answers: ALL_RIGHT })).status).toBe(400);
        const short = await submit(learner.token, { contentId, answers: [1, 'Sawubona'] });
        expect(short.status).toBe(400);
        expect(short.body.error).toMatch(/expected 3 answers/);
        expect((await submit(learner.token, { contentId, answers: 'all of them' })).status).toBe(400);
        expect((await submit(learner.token, { contentId, answers: [1.5, 'x', 0] })).status).toBe(400);

        // A refused submission is not recorded.
        const { rows } = await pool.query(`SELECT 1 FROM test_attempts WHERE learner_id = $1`, [learner.user.id]);
        expect(rows).toHaveLength(0);
    });

    it('permission: content above the learner\'s level is refused (403)', async () => {
        const contentId = await insertContent(authorId, { level: 3 });
        const learner = await learnerAt(2);

        const res = await submit(learner.token, { contentId, answers: ALL_RIGHT });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('this content is above your level');
    });

    it('invalid input: a draft or unknown content is 404, content with no questions is 400', async () => {
        const draft = await insertContent(authorId, { status: 'draft' });
        const story = await insertContent(authorId, { pages: [[text('Just a story.')]] });
        const learner = await learnerAt(1);

        expect((await submit(learner.token, { contentId: draft, answers: ALL_RIGHT })).status).toBe(404);
        expect((await submit(learner.token, { contentId: 2147483647, answers: ALL_RIGHT })).status).toBe(404);
        const noTest = await submit(learner.token, { contentId: story, answers: [] });
        expect(noTest.status).toBe(400);
        expect(noTest.body.error).toBe('this content has no test');
    });

    it('permission: a child may take a child-friendly test but not another (403)', async () => {
        const forChildren = await insertContent(authorId, { childFriendly: true });
        const adultOnly = await insertContent(authorId, { childFriendly: false });
        const child = await learnerAt(1, 'child');

        expect((await submit(child.token, { contentId: forChildren, answers: ALL_RIGHT })).status).toBe(201);
        const refused = await submit(child.token, { contentId: adultOnly, answers: ALL_RIGHT });
        expect(refused.status).toBe(403);
        expect(refused.body.error).toMatch(/child-friendly/);

        // An adult takes either.
        const adult = await learnerAt(1);
        expect((await submit(adult.token, { contentId: adultOnly, answers: ALL_RIGHT })).status).toBe(201);
    });

    it('permission: learners only, and only once setup is finished', async () => {
        const contentId = await insertContent(authorId);
        const author = await accountWithToken('author');
        expect((await submit(author.token, { contentId, answers: ALL_RIGHT })).status).toBe(403);

        const unfinished = await accountWithToken('learner');
        expect((await submit(unfinished.token, { contentId, answers: ALL_RIGHT })).status).toBe(403);
        expect((await request(app).post('/api/testAttempts/submit').send({ contentId, answers: ALL_RIGHT })).status).toBe(401);
    });
});

describe('GET /api/testAttempts/myLearning', () => {
    it('nominal: a learner with no attempts starts at zero', async () => {
        const learner = await learnerAt(2);
        const res = await myLearning(learner.token);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            currentLevel: 2, testsPassedAtLevel: 0, testsRequired: TESTS_REQUIRED_PER_LEVEL, readyForChallenge: false,
            testsCompleted: 0, testsPassed: 0, averagePercent: 0, history: [], bestResults: [], continueReading: [],
        });
    });

    it('counts distinct tests: retaking a passed test counts once, and the average is of each test\'s best score', async () => {
        const first = await insertContent(authorId, { title: 'First test' });
        const second = await insertContent(authorId, { title: 'Second test' });
        const learner = await learnerAt(1);

        await submit(learner.token, { contentId: first, answers: [0, 'no', 1] });    //   0, failed
        await submit(learner.token, { contentId: first, answers: ALL_RIGHT });       // 100, passed
        await submit(learner.token, { contentId: first, answers: ALL_RIGHT });       // 100, passed again
        await submit(learner.token, { contentId: second, answers: [0, 'no', 1] });   //   0, failed

        const res = await myLearning(learner.token);
        expect(res.body).toMatchObject({
            currentLevel: 1, testsPassedAtLevel: 1, testsCompleted: 2, testsPassed: 1,
            // Best of First (100) and best of Second (0): the failed first try at First is replaced by its pass.
            averagePercent: 50, readyForChallenge: false,
        });
        // Every attempt is in the history, newest first, with the content's title.
        expect(res.body.history.map((row: { title: string }) => row.title)).toEqual(['Second test', 'First test', 'First test', 'First test']);
        // One row per test, with its best result.
        expect(res.body.bestResults).toMatchObject([
            { contentId: second, title: 'Second test', bestPercent: 0, passed: false, attempts: 1 },
            { contentId: first, title: 'First test', bestPercent: 100, passed: true, attempts: 3 },
        ]);
        expect(res.body.history[0]).toMatchObject({ contentId: second, level: 1, score: 0, total: 3, percent: 0, passed: false });
        expect(JSON.stringify(res.body)).not.toMatch(/correctOption|accepted/);
    });

    it('boundary: ready for the challenge after the required number of distinct passes, never at the top level', async () => {
        const learner = await learnerAt(1);
        for (let i = 0; i < TESTS_REQUIRED_PER_LEVEL; i += 1) {
            const contentId = await insertContent(authorId);
            expect((await myLearning(learner.token)).body.readyForChallenge).toBe(false);
            await submit(learner.token, { contentId, answers: ALL_RIGHT });
        }
        expect((await myLearning(learner.token)).body).toMatchObject({
            testsPassedAtLevel: TESTS_REQUIRED_PER_LEVEL, readyForChallenge: true });

        // At the top level there is nothing left to level up to.
        const top = await learnerAt(MAX_LEVEL);
        await pool.query(
            `INSERT INTO test_attempts (content_id, learner_id, level, language, answers, total, score, percent, passed)
             SELECT id, $1, $2, 'english', '[]'::jsonb, 3, 3, 100, true FROM content WHERE author_id = $3 LIMIT $4`,
            [top.user.id, MAX_LEVEL, authorId, TESTS_REQUIRED_PER_LEVEL]);
        expect((await myLearning(top.token)).body).toMatchObject({
            testsPassedAtLevel: TESTS_REQUIRED_PER_LEVEL, readyForChallenge: false });
    });

    it('permission: learners only', async () => {
        const moderator = await accountWithToken('moderator');
        expect((await myLearning(moderator.token)).status).toBe(403);
    });
});
