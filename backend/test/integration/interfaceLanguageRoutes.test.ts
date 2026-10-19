// The header's language switch: every account keeps its interface language
// (PUT /api/auth/interface-language), and the older learner-only route still
// saves it on the setup row. A learner of English always reads English menus.
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import type { PublicUser } from '../../src/routes/api/routes.api/authRoutes/types/authType.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

function saveSetup(token: string, targetLanguage = 'zulu', interfaceLanguage = 'english') {
    return request(app)
        .put('/api/onboarding/saveSettings')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetLanguage, dateOfBirth: '2001-02-03', interfaceLanguage, dailyGoal: 15 });
}

function readSetup(token: string) {
    return request(app).get('/api/onboarding/getSettings').set('Authorization', `Bearer ${token}`);
}

function saveLanguage(token: string, interfaceLanguage: unknown) {
    return request(app)
        .put('/api/onboarding/saveInterfaceLanguage')
        .set('Authorization', `Bearer ${token}`)
        .send({ interfaceLanguage });
}

function saveAccountLanguage(token: string | null, interfaceLanguage: unknown) {
    const req = request(app).put('/api/auth/interface-language');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ interfaceLanguage });
}

//Signs in again with the helper's password, as on another device.
function signIn(user: PublicUser) {
    return request(app)
        .post('/api/auth/login')
        .send({ identifier: user.username ?? user.email, password: 'password123' });
}

function sessionCheck(token: string) {
    return request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
}

afterAll(async () => {
    await deleteTestAccounts();
});

describe('PUT /api/onboarding/saveInterfaceLanguage', () => {
    it('nominal: saves the language, and setup reads it back', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token)).status).toBe(200);

        const saved = await saveLanguage(learner.token, 'zulu');

        expect(saved.status).toBe(200);
        expect(saved.body).toEqual({ interfaceLanguage: 'zulu' });
        const settings = await request(app).get('/api/onboarding/getSettings').set('Authorization', `Bearer ${learner.token}`);
        expect(settings.body.interface_language).toBe('zulu');
    });

    it('boundary: a learner without setup gets 404', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveLanguage(learner.token, 'english')).status).toBe(404);
    });

    it('invalid: an unsupported language is 400, and staff are refused', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token)).status).toBe(200);
        expect((await saveLanguage(learner.token, 'tshivenda')).status).toBe(400);
        expect((await saveLanguage(learner.token, 7)).status).toBe(400);

        const author = await accountWithToken('author');
        expect((await saveLanguage(author.token, 'zulu')).status).toBe(403);
    });
});

describe('PUT /api/auth/interface-language', () => {
    it('nominal: a guardian saves isiZulu, and gets it back at the next sign-in and session check', async () => {
        const guardian = await accountWithToken('guardian');
        expect(guardian.user.interfaceLanguage).toBeNull();

        const saved = await saveAccountLanguage(guardian.token, 'zulu');

        expect(saved.status).toBe(200);
        expect(saved.body).toEqual({ interfaceLanguage: 'zulu' });
        const login = await signIn(guardian.user);
        expect(login.status).toBe(200);
        expect(login.body.user.interfaceLanguage).toBe('zulu');
        expect((await sessionCheck(login.body.token)).body.user.interfaceLanguage).toBe('zulu');
    });

    it('nominal: staff keep their choice too, and can change it back', async () => {
        const moderator = await accountWithToken('moderator');
        expect((await saveAccountLanguage(moderator.token, 'zulu')).status).toBe(200);
        expect((await saveAccountLanguage(moderator.token, 'english')).status).toBe(200);

        expect((await sessionCheck(moderator.token)).body.user.interfaceLanguage).toBe('english');
    });

    it('nominal: a learner\'s setup row is kept in step, and setup saves the account\'s language too', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token)).status).toBe(200);

        expect((await saveAccountLanguage(learner.token, 'zulu')).status).toBe(200);

        const settings = await request(app).get('/api/onboarding/getSettings').set('Authorization', `Bearer ${learner.token}`);
        expect(settings.body.interface_language).toBe('zulu');
        //Setup saves English again, and the account follows it.
        expect((await saveSetup(learner.token)).status).toBe(200);
        expect((await sessionCheck(learner.token)).body.user.interfaceLanguage).toBe('english');
        //The older learner-only route updates the account as well.
        expect((await saveLanguage(learner.token, 'zulu')).status).toBe(200);
        expect((await sessionCheck(learner.token)).body.user.interfaceLanguage).toBe('zulu');
    });

    it('boundary: a learner who has not finished setup still saves it on the account', async () => {
        const learner = await accountWithToken('learner');

        expect((await saveAccountLanguage(learner.token, 'zulu')).status).toBe(200);

        expect((await sessionCheck(learner.token)).body.user.interfaceLanguage).toBe('zulu');
        const { rows } = await pool.query(`SELECT 1 FROM learner_settings WHERE user_id = $1`, [learner.user.id]);
        expect(rows).toHaveLength(0);
    });

    it('invalid: anything but english or zulu is 400 and changes nothing', async () => {
        const guardian = await accountWithToken('guardian');
        expect((await saveAccountLanguage(guardian.token, 'zulu')).status).toBe(200);

        for (const value of ['tshivenda', 'Zulu', '', 7, null]) {
            const refused = await saveAccountLanguage(guardian.token, value);
            expect(refused.status).toBe(400);
            expect(refused.body.error).toBe("interfaceLanguage must be 'english' or 'zulu'");
        }
        expect((await sessionCheck(guardian.token)).body.user.interfaceLanguage).toBe('zulu');
    });

    it('invalid: without a session it is 401', async () => {
        expect((await saveAccountLanguage(null, 'zulu')).status).toBe(401);
        expect((await saveAccountLanguage('not-a-token', 'zulu')).status).toBe(401);
    });
});

describe('a learner of English reads English menus', () => {
    it('nominal: setup stores English for a learner of English, on the setup row and the account', async () => {
        const learner = await accountWithToken('learner');

        const saved = await saveSetup(learner.token, 'english', 'zulu');

        expect(saved.status).toBe(200);
        expect(saved.body.interface_language).toBe('english');
        expect((await readSetup(learner.token)).body.interface_language).toBe('english');
        expect((await sessionCheck(learner.token)).body.user.interfaceLanguage).toBe('english');
    });

    it('invalid: isiZulu menus are refused (400) on both routes, and nothing changes', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token, 'english', 'english')).status).toBe(200);

        const account = await saveAccountLanguage(learner.token, 'zulu');
        expect(account.status).toBe(400);
        expect(account.body.error).toBe('learners of English see the app in English');
        const older = await saveLanguage(learner.token, 'zulu');
        expect(older.status).toBe(400);
        expect(older.body.error).toBe('learners of English see the app in English');

        expect((await readSetup(learner.token)).body.interface_language).toBe('english');
        expect((await sessionCheck(learner.token)).body.user.interfaceLanguage).toBe('english');
        //English itself is always fine.
        expect((await saveAccountLanguage(learner.token, 'english')).status).toBe(200);
        expect((await saveLanguage(learner.token, 'english')).status).toBe(200);
    });

    it('boundary: switching to learn isiZulu lets the learner choose isiZulu menus again', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token, 'english', 'english')).status).toBe(200);

        expect((await saveSetup(learner.token, 'zulu', 'zulu')).status).toBe(200);
        expect((await readSetup(learner.token)).body.interface_language).toBe('zulu');

        //Back to English: the menus go back to English too.
        expect((await saveSetup(learner.token, 'english', 'zulu')).status).toBe(200);
        expect((await readSetup(learner.token)).body.interface_language).toBe('english');
        expect((await sessionCheck(learner.token)).body.user.interfaceLanguage).toBe('english');
    });

    it('boundary: an older row holding isiZulu for a learner of English reads back as English', async () => {
        const learner = await accountWithToken('learner');
        expect((await saveSetup(learner.token, 'english', 'english')).status).toBe(200);
        await pool.query(`UPDATE learner_settings SET interface_language = 'zulu' WHERE user_id = $1`, [learner.user.id]);

        expect((await readSetup(learner.token)).body.interface_language).toBe('english');
    });

    it('boundary: guardians and staff are not affected by the rule', async () => {
        const guardian = await accountWithToken('guardian');
        const author = await accountWithToken('author');

        expect((await saveAccountLanguage(guardian.token, 'zulu')).status).toBe(200);
        expect((await saveAccountLanguage(author.token, 'zulu')).status).toBe(200);
    });
});
