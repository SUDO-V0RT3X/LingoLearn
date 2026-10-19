// The placement test happens once: a learner who has a level (from placement,
// skipping it, or a level-up) can neither start nor skip it again.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

async function placedLearner() {
    const learner = await accountWithToken('learner');
    await request(app).put('/api/onboarding/saveSettings').set('Authorization', `Bearer ${learner.token}`)
        .send({ targetLanguage: 'zulu', dateOfBirth: '2000-01-01', interfaceLanguage: 'english', dailyGoal: 15 });
    return learner;
}

afterAll(async () => {
    await deleteTestAccounts();
});

describe('placement is once only', () => {
    it('nominal: a new learner can skip, and is then placed', async () => {
        const learner = await placedLearner();
        const skip = await request(app).post('/api/placement/skipPlacement').set('Authorization', `Bearer ${learner.token}`).send({});
        expect(skip.status).toBe(200);
        const level = await request(app).get('/api/placement/getLearnerLevel').set('Authorization', `Bearer ${learner.token}`);
        expect(level.body.placed).toBe(true);
    });

    it('invalid: once placed, starting or skipping again is refused with 409', async () => {
        const learner = await placedLearner();
        await request(app).post('/api/placement/skipPlacement').set('Authorization', `Bearer ${learner.token}`).send({});

        const start = await request(app).post('/api/placement/startPlacement').set('Authorization', `Bearer ${learner.token}`).send({});
        const skip = await request(app).post('/api/placement/skipPlacement').set('Authorization', `Bearer ${learner.token}`).send({});

        expect(start.status).toBe(409);
        expect(start.body.error).toBe('placement has already been completed');
        expect(skip.status).toBe(409);
    });
});
