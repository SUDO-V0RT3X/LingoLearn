// End-to-end tests for the date-of-birth rules against the real database:
// once a guardian is linked, only that guardian can change a learner's date of
// birth; a learner with no linked guardian can correct their own.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

function saveSetup(token: string, dateOfBirth: string, targetLanguage = 'zulu') {
    return request(app)
        .put('/api/onboarding/saveSettings')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetLanguage, dateOfBirth, interfaceLanguage: 'english', dailyGoal: 15 });
}

function guardianSets(token: string, childId: number | string, body: unknown) {
    return request(app)
        .put(`/api/onboarding/children/${childId}/dateOfBirth`)
        .set('Authorization', `Bearer ${token}`)
        .send(body as object);
}

async function storedDateOfBirth(userId: number): Promise<string | undefined> {
    const { rows } = await pool.query<{ dob: string }>(
        `SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS dob FROM learner_settings WHERE user_id = $1`, [userId]);
    return rows[0]?.dob;
}

afterAll(async () => {
    await deleteTestAccounts();
});

describe('learner date of birth after the first setup save', () => {
    it('nominal: later saves with the same date of birth still update the other settings', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token, '2001-02-03')).status).toBe(200);

        const again = await saveSetup(learner.token, '2001-02-03', 'english');

        expect(again.status).toBe(200);
        expect(again.body.target_language).toBe('english');
        expect(again.body.date_of_birth).toBe('2001-02-03');
    });

    it('nominal: a learner with no linked guardian can correct their own date of birth', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token, '2001-02-03')).status).toBe(200);

        const corrected = await saveSetup(learner.token, '2001-03-04');

        expect(corrected.status).toBe(200);
        expect(await storedDateOfBirth(learner.user.id)).toBe('2001-03-04');
    });

    it('boundary: a learner whose guardian link was ended can correct it again', async () => {
        const learner = await accountWithToken('learner');
        const guardian = await accountWithToken('guardian');
        expect((await saveSetup(learner.token, '2001-02-03')).status).toBe(200);
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id, unlinked_at) VALUES ($1, $2, now())`,
            [guardian.user.id, learner.user.id]);

        expect((await saveSetup(learner.token, '2002-02-03')).status).toBe(200);
    });

    it('invalid: a linked learner\'s changed date of birth is refused with 403 and nothing changes', async () => {
        const learner = await accountWithToken('learner');
        const guardian = await accountWithToken('guardian');
        expect((await saveSetup(learner.token, '2001-02-03')).status).toBe(200);
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`,
            [guardian.user.id, learner.user.id]);

        const changed = await saveSetup(learner.token, '2016-02-03', 'english');

        expect(changed.status).toBe(403);
        expect(changed.body.error).toBe('only a linked guardian can change your date of birth');
        expect(await storedDateOfBirth(learner.user.id)).toBe('2001-02-03');
        const { rows } = await pool.query(`SELECT target_language FROM learner_settings WHERE user_id = $1`, [learner.user.id]);
        expect(rows[0].target_language).toBe('zulu');
    });

    it('invalid: a target language that is not offered is refused with 400', async () => {
        const learner = await accountWithToken('learner');
        const response = await saveSetup(learner.token, '2001-02-03', 'tshivenda');
        expect(response.status).toBe(400);
        expect(response.body.issues[0].field).toBe('targetLanguage');
    });
});

describe('PUT /api/onboarding/children/:childId/dateOfBirth', () => {
    it('nominal: a linked guardian changes the child\'s date of birth and the access policy follows it', async () => {
        const child = await accountWithToken('learner');
        const guardian = await accountWithToken('guardian');
        await saveSetup(child.token, '2001-02-03');
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`,
            [guardian.user.id, child.user.id]);

        const read = await request(app)
            .get(`/api/onboarding/children/${child.user.id}/dateOfBirth`)
            .set('Authorization', `Bearer ${guardian.token}`);
        expect(read.status).toBe(200);
        expect(read.body).toEqual({ childId: child.user.id, dateOfBirth: '2001-02-03' });

        const response = await guardianSets(guardian.token, child.user.id, { dateOfBirth: '2017-06-07' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ childId: child.user.id, dateOfBirth: '2017-06-07' });
        expect(await storedDateOfBirth(child.user.id)).toBe('2017-06-07');
        // The child is now under 13 with an active link: a child, still allowed in.
        const access = await request(app).get('/api/onboarding/getAccess').set('Authorization', `Bearer ${child.token}`);
        expect(access.body).toMatchObject({ isUnder13: true, canAccessContent: true, contentAudience: 'child' });
    });

    it('invalid: a guardian without a link, or whose link was ended, is refused with 403', async () => {
        const child = await accountWithToken('learner');
        const stranger = await accountWithToken('guardian');
        const former = await accountWithToken('guardian');
        await saveSetup(child.token, '2001-02-03');
        await pool.query(
            `INSERT INTO parent_child_links (guardian_id, learner_id, unlinked_at) VALUES ($1, $2, now())`,
            [former.user.id, child.user.id]);

        expect((await guardianSets(stranger.token, child.user.id, { dateOfBirth: '2017-06-07' })).status).toBe(403);
        expect((await guardianSets(former.token, child.user.id, { dateOfBirth: '2017-06-07' })).status).toBe(403);
        expect(await storedDateOfBirth(child.user.id)).toBe('2001-02-03');
    });

    it('invalid: learners cannot use the guardian route, even for themselves', async () => {
        const learner = await accountWithToken('learner');
        await saveSetup(learner.token, '2001-02-03');

        const response = await guardianSets(learner.token, learner.user.id, { dateOfBirth: '2017-06-07' });

        expect(response.status).toBe(403);
        expect(await storedDateOfBirth(learner.user.id)).toBe('2001-02-03');
    });

    it('invalid: a bad date or child id is refused with 400, a child without setup with 404', async () => {
        const child = await accountWithToken('learner');
        const guardian = await accountWithToken('guardian');
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`,
            [guardian.user.id, child.user.id]);

        expect((await guardianSets(guardian.token, child.user.id, { dateOfBirth: '2999-01-01' })).status).toBe(400);
        expect((await guardianSets(guardian.token, 'abc', { dateOfBirth: '2017-06-07' })).status).toBe(400);
        expect((await guardianSets(guardian.token, child.user.id, { dateOfBirth: '2017-06-07' })).status).toBe(404);
    });
});
