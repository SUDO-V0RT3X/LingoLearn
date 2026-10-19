// Import the Vitest primitives used to structure and assert the test suite.
// `afterAll`   → teardown hook that runs once after every test in this file.
// `describe`   → groups related tests under a shared label.
// `expect`     → assertion builder used to check expected outcomes.
// `it`         → declares a single test case.
import { afterAll, describe, expect, it } from 'vitest';
// Import supertest so the tests can make real HTTP requests against the in-process app.
import request from 'supertest';
// Import the app factory that wires up routes, middleware, and error handlers.
import { createApp } from '../../src/app.js';
// Import the shared PostgreSQL pool so the tests can inspect database side effects.
import { pool } from '../../src/config/db/db_init.js';
// Import helpers that create throwaway accounts and clean them up afterwards.
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';
// Import the canonical ladders the database must hold after migration 209.
import { DEFAULT_QUESTIONS, DEFAULT_ZULU_QUESTIONS } from '../../src/routes/api/routes.api/placementRoutes/methods/placementMethods.js';

// Build one app instance shared across all tests in this file.
const app = createApp();

// Small helper that persists onboarding settings for a learner so placement has a language to route to.
// `token` — bearer token identifying the learner.
// `targetLanguage` — which question ladder the learner should be tested against.
// `dateOfBirth` — defaults to an adult birth date so the under-13 gate is not accidentally triggered.
async function saveLearnerSetup(token: string, targetLanguage: 'english' | 'zulu', dateOfBirth = '2000-01-01') {
    // Fire a PUT request against the onboarding settings endpoint.
    return request(app)
        // Target the onboarding settings route that persists learner preferences.
        .put('/api/onboarding/saveSettings')
        // Attach the bearer token so the endpoint can authenticate the caller.
        .set('Authorization', `Bearer ${token}`)
        // Send the minimal payload the onboarding validator accepts.
        .send({ targetLanguage, dateOfBirth, interfaceLanguage: 'english', dailyGoal: 15 });
}

// Global teardown: remove every account this suite created so the next run starts clean.
afterAll(async () => {
    // Delegate to the shared helper that deletes all accounts created via `accountWithToken`.
    await deleteTestAccounts();
});

// Outer suite grouping every placement-flow integration test in this file.
describe('authenticated placement flow', () => {
    // Primary happy-path test covering seeding, starting, grading, quitting, and level persistence.
    it('seeds complete English and Zulu ladders and exposes the owned learner level', async () => {
        // Create a fresh learner that will run the English ladder.
        const englishLearner = await accountWithToken('learner');
        // Create a separate fresh learner that will run the isiZulu ladder.
        const zuluLearner = await accountWithToken('learner');

        // Persist the English learner's onboarding settings with the English target language.
        const englishSetup = await saveLearnerSetup(englishLearner.token, 'english');
        // Persist the isiZulu learner's onboarding settings with the Zulu target language.
        const zuluSetup = await saveLearnerSetup(zuluLearner.token, 'zulu');
        // Assert that saving English settings succeeded.
        expect(englishSetup.status).toBe(200);
        // Assert that saving Zulu settings succeeded.
        expect(zuluSetup.status).toBe(200);

        // Read the learner's level before any placement has run to confirm the default.
        const defaultLevel = await request(app)
            // Target the level-read endpoint.
            .get('/api/placement/getLearnerLevel')
            // Authenticate as the English learner.
            .set('Authorization', `Bearer ${englishLearner.token}`);
        // Expect a successful response.
        expect(defaultLevel.status).toBe(200);
        // Unplaced learners must default to Level 1 for their own user id.
        expect(defaultLevel.body).toEqual({ userId: englishLearner.user.id, levelNumber: 1, placed: false });

        // Start an English placement attempt for the English learner.
        const englishStart = await request(app)
            // Target the start endpoint.
            .post('/api/placement/startPlacement')
            // Authenticate as the English learner.
            .set('Authorization', `Bearer ${englishLearner.token}`);
        // Start an isiZulu placement attempt for the Zulu learner.
        const zuluStart = await request(app)
            // Target the start endpoint.
            .post('/api/placement/startPlacement')
            // Authenticate as the Zulu learner.
            .set('Authorization', `Bearer ${zuluLearner.token}`);

        // A freshly created attempt is a new resource, so 201 is the expected status.
        expect(englishStart.status).toBe(201);
        // The English ladder must report exactly 30 questions.
        expect(englishStart.body.totalQuestions).toBe(30);
        // The first English question must be the canonical "q1".
        expect(englishStart.body.question.id).toBe('q1');
        // Same 201 expectation for the isiZulu attempt creation.
        expect(zuluStart.status).toBe(201);
        // The isiZulu ladder must also report 30 questions.
        expect(zuluStart.body.totalQuestions).toBe(30);
        // The first isiZulu question must be the canonical "zq1".
        expect(zuluStart.body.question.id).toBe('zq1');

        // Inspect the English question table directly to confirm seeding produced enough rows.
        const englishCount = await pool.query<{ count: string }>(
            // Cast the count to text so it does not come back as a JS BigInt.
            'SELECT count(*)::text AS count FROM placement_questions',
        );
        // Inspect the isiZulu question table the same way.
        const zuluCount = await pool.query<{ count: string }>(
            // Same cast-to-text trick for the Zulu table.
            'SELECT count(*)::text AS count FROM zulu_placement_questions',
        );
        // The English ladder must contain at least the 30 canonical questions.
        expect(Number(englishCount.rows[0].count)).toBeGreaterThanOrEqual(30);
        // The isiZulu ladder must contain at least the 30 canonical questions.
        expect(Number(zuluCount.rows[0].count)).toBeGreaterThanOrEqual(30);

        // Try to submit an isiZulu question id against an English attempt to prove language isolation.
        const crossLanguageAnswer = await request(app)
            // Submit into the English attempt id.
            .post(`/api/placement/submitAnswer/${englishStart.body.attemptId}`)
            // Authenticate as the English learner.
            .set('Authorization', `Bearer ${englishLearner.token}`)
            // Send the Zulu question id with the correct Zulu answer key.
            .send({ questionId: 'zq1', answer: 'a' });
        // The service must refuse to find the question in the English ladder → 404.
        expect(crossLanguageAnswer.status).toBe(404);

        // Submit the first English question with the correct answer key.
        const firstAnswer = await request(app)
            // Target the submit endpoint for this specific attempt.
            .post(`/api/placement/submitAnswer/${englishStart.body.attemptId}`)
            // Authenticate as the English learner.
            .set('Authorization', `Bearer ${englishLearner.token}`)
            // Send question "q1" with its correct option id "b".
            .send({ questionId: 'q1', answer: 'b' });
        // A correct non-terminal answer returns 200.
        expect(firstAnswer.status).toBe(200);
        // The response must advance the ladder to the second question.
        expect(firstAnswer.body.nextQuestion.id).toBe('q2');

        // Replay the same answer to test the ladder-position guard.
        const replay = await request(app)
            // Target the same attempt.
            .post(`/api/placement/submitAnswer/${englishStart.body.attemptId}`)
            // Authenticate as the English learner.
            .set('Authorization', `Bearer ${englishLearner.token}`)
            // Resend the exact same question id and answer.
            .send({ questionId: 'q1', answer: 'b' });
        // The attempt has moved on, so the server must return a state-conflict 409.
        expect(replay.status).toBe(409);

        // Submit a deliberately wrong answer on the isiZulu attempt to end the test early.
        const wrongZuluAnswer = await request(app)
            // Target the isiZulu attempt id.
            .post(`/api/placement/submitAnswer/${zuluStart.body.attemptId}`)
            // Authenticate as the Zulu learner.
            .set('Authorization', `Bearer ${zuluLearner.token}`)
            // Send the correct question id with an obviously invalid answer.
            .send({ questionId: 'zq1', answer: 'not-the-correct-choice' });
        // A graded (though incorrect) submission still returns 200.
        expect(wrongZuluAnswer.status).toBe(200);
        // The wrong answer must terminate the attempt immediately.
        expect(wrongZuluAnswer.body.isComplete).toBe(true);
        // A learner who answered nothing correctly gets assigned the lowest tier.
        expect(wrongZuluAnswer.body.result.level).toBe('A1');

        // Read the persisted attempt row to confirm the database agrees with the API response.
        const completedAttempt = await pool.query<{ completed: boolean; assigned_level: number }>(
            // Fetch only the columns needed for the assertion.
            'SELECT completed, assigned_level FROM placement_attempts WHERE id = $1',
            // Bind the isiZulu attempt id.
            [zuluStart.body.attemptId],
        );
        // The attempt must be marked completed and pinned to tier 1.
        expect(completedAttempt.rows[0]).toEqual({ completed: true, assigned_level: 1 });
        // Read the persisted learner level through the API to confirm the write path works end-to-end.
        const savedZuluLevel = await request(app)
            // Target the level-read endpoint.
            .get('/api/placement/getLearnerLevel')
            // Authenticate as the Zulu learner.
            .set('Authorization', `Bearer ${zuluLearner.token}`);
        // The learner's level must reflect the assignment made during grading.
        expect(savedZuluLevel.body.levelNumber).toBe(1);
        // A saved level marks the learner as placed, so onboarding will not force the test again.
        expect(savedZuluLevel.body.placed).toBe(true);

        // After a reload the screen asks for the unfinished attempt: it is still at question 2.
        const active = await request(app)
            .get('/api/placement/getActiveAttempt')
            .set('Authorization', `Bearer ${englishLearner.token}`);
        expect(active.status).toBe(200);
        expect(active.body.attempt).toMatchObject({
            attemptId: englishStart.body.attemptId, questionNumber: 2, resumed: true, totalQuestions: 30,
        });
        expect(active.body.attempt.question.id).toBe('q2');
        // The answer key never reaches the browser.
        expect(active.body.attempt.question).not.toHaveProperty('correct_id');
        expect(JSON.stringify(active.body)).not.toContain('correct_id');

        // Pressing Start again continues that attempt (200) instead of creating another one.
        const quitStart = await request(app)
            // Target the start endpoint.
            .post('/api/placement/startPlacement')
            // Authenticate as the English learner.
            .set('Authorization', `Bearer ${englishLearner.token}`);
        expect(quitStart.status).toBe(200);
        expect(quitStart.body).toMatchObject({ attemptId: englishStart.body.attemptId, questionNumber: 2, resumed: true });
        const openAttempts = await pool.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM placement_attempts WHERE user_id = $1 AND completed = false',
            [englishLearner.user.id],
        );
        expect(Number(openAttempts.rows[0].count)).toBe(1);
        // Quit the continued attempt without submitting any answer.
        const quitResponse = await request(app)
            // Target the quit endpoint for this attempt id.
            .post(`/api/placement/quitPlacement/${quitStart.body.attemptId}`)
            // Authenticate as the English learner.
            .set('Authorization', `Bearer ${englishLearner.token}`);
        // Quitting a valid attempt returns 200.
        expect(quitResponse.status).toBe(200);
        // Quitting on question 2 (still level 1) assigns the lowest tier.
        expect(quitResponse.body.result).toMatchObject({ levelNumber: 1, level: 'A1' });

        // Read the persisted quit attempt row to confirm the database state.
        const quitAttempt = await pool.query<{ completed: boolean; assigned_level: number; score: number }>(
            // Fetch the three columns the assertion inspects.
            'SELECT completed, assigned_level, score FROM placement_attempts WHERE id = $1',
            // Bind the quit attempt id.
            [quitStart.body.attemptId],
        );
        // Quitting keeps the one correct answer without adding to it, and closes the attempt at tier 1.
        expect(quitAttempt.rows[0]).toEqual({ completed: true, assigned_level: 1, score: 1 });

        // Once placed there is nothing left to continue.
        const afterQuit = await request(app)
            .get('/api/placement/getActiveAttempt')
            .set('Authorization', `Bearer ${englishLearner.token}`);
        expect(afterQuit.body).toEqual({ attempt: null });
    });

    it('the stored ladders are the canonical ones: levelled bands, fixed questions (migration 209)', async () => {
        for (const [table, bank] of [
            ['placement_questions', DEFAULT_QUESTIONS],
            ['zulu_placement_questions', DEFAULT_ZULU_QUESTIONS],
        ] as const) {
            const { rows } = await pool.query(
                `SELECT id, section, instructions, type, prompt, options, correct_id, order_index, level_number
                 FROM ${table} WHERE order_index < 30 ORDER BY order_index`,
            );
            expect(rows).toEqual(bank.map((question) => ({ ...question, options: question.options ?? null })));
        }
    });

    it('a child without a guardian link cannot read an unfinished attempt either', async () => {
        const child = await accountWithToken('learner');
        await saveLearnerSetup(child.token, 'english', '2018-01-01');

        const active = await request(app)
            .get('/api/placement/getActiveAttempt')
            .set('Authorization', `Bearer ${child.token}`);

        expect(active.status).toBe(403);
        expect(active.body.error).toBe('an active parent link is required before accessing content');
    });

    // Second test verifying the under-13 child-safety gate on the skip endpoint.
    it('enforces the under-13 parent-link policy when skipping placement', async () => {
        // Create a fresh learner that will represent the under-13 child.
        const childLearner = await accountWithToken('learner');
        // Persist onboarding with a birth date that makes the learner 7–8 years old.
        const setup = await saveLearnerSetup(childLearner.token, 'english', '2018-01-01');
        // Saving settings is allowed even for a child, so the response is 200.
        expect(setup.status).toBe(200);
        // The evaluated access policy must deny content access without a parent link.
        expect(setup.body.access.canAccessContent).toBe(false);

        // Attempt to skip placement as the under-13 learner.
        const skip = await request(app)
            // Target the skip endpoint.
            .post('/api/placement/skipPlacement')
            // Authenticate as the child learner.
            .set('Authorization', `Bearer ${childLearner.token}`)
            // Send an empty body; the endpoint only needs the token.
            .send({});

        // The child-safety gate must reject the skip with a 403.
        expect(skip.status).toBe(403);
        // Inspect `learner_levels` to prove no row was written for the blocked learner.
        const level = await pool.query<{ count: string }>(
            // Count rows belonging to this specific child.
            'SELECT count(*)::text AS count FROM learner_levels WHERE user_id = $1',
            // Bind the child's user id.
            [childLearner.user.id],
        );
        // A blocked skip must leave the level table untouched for this learner.
        expect(Number(level.rows[0].count)).toBe(0);
    });
});