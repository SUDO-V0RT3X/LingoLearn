// CONTENT integration tests — the real Express app over the real database
// (docker locally). Every row a test creates is deleted afterwards.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { AccountMethods } from '../../src/routes/api/routes.api/authRoutes/methods/accountMethods.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';
import { SessionMethods } from '../../src/routes/api/routes.api/authRoutes/methods/sessionMethods.js';

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';
const app = createApp();

// Content routes sit behind the auth gate, so every call here is signed in as
// an author created for this run.
let token = '';
let authorId = 0;
const api = {
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${token}`),
    put: (path: string) => request(app).put(path).set('Authorization', `Bearer ${token}`),
    delete: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${token}`),
};

beforeAll(async () => {
    const author = await AccountMethods.createAccount({
        role: 'author',
        firstName: 'Ana',
        lastName: 'Author',
        email: `content.author.${Date.now().toString(36)}@example.test`,
        username: null,
        password: 'password123',
    });
    authorId = author.id;
    token = await SessionMethods.createSession(author);
});

const text = (title: string, body: string) => ({ itemType: 'Text', value: { title, text: body } });
const readyContent = [[text('Greetings', 'Hola'), text('Farewells', 'Adios')]];
const submission = {
    content: readyContent,
    title: 'Saying hello',
    language: 'english',
    childFriendly: true,
    level: 2,
    chosenTags: ['greetings'],
};

// Finishes a learner's setup with this date of birth, which is what the
// onboarding slice's gate reads to decide whether and what they may read.
async function finishSetup(userId: number, dateOfBirth: string) {
    await pool.query(
        `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
         VALUES ($1, 'english', $2::date, 'english', 15)`,
        [userId, dateOfBirth]);
}

// Places a learner at a level, as placement or a level-up challenge would.
// Content above it is listed as locked and refused when opened.
async function placeAt(userId: number, level: number) {
    await pool.query(
        `INSERT INTO learner_levels (user_id, level_number) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET level_number = EXCLUDED.level_number`,
        [userId, level]);
}

const createdIds: number[] = [];
async function createDraft(content: unknown = [[]]) {
    const res = await api.post('/api/content/createContent').send({ content });
    if (typeof res.body.contentId === 'number') createdIds.push(res.body.contentId);
    return res;
}

afterAll(async () => {
    await pool.query(`DELETE FROM content WHERE id = ANY($1::int[])`, [createdIds]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [authorId]);
    await deleteTestAccounts();
});

describe('content routes', () => {
    it('createContent assigns an integer content id and starts as a draft', async () => {
        const res = await createDraft();
        expect(res.status).toBe(201);
        expect(Number.isInteger(res.body.contentId)).toBe(true);
        expect(res.body).toMatchObject({ status: 'draft', level: null, chosenTags: [], kind: 'story', content: [[]] });
    });

    it('getContent reads back exactly what was saved', async () => {
        const id = (await createDraft(readyContent)).body.contentId;
        const res = await api.get(`/api/content/getContent/${id}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ contentId: id, status: 'draft', kind: 'story' });
        expect(res.body.content).toEqual(readyContent);
    });

    it('content holding a question block is a quiz', async () => {
        const question = { itemType: 'Multiple Choice',
                           value: { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'], correctOption: 0 } };
        const res = await createDraft([[text('Greetings', 'Hola')], [question]]);
        expect(res.status).toBe(201);
        expect(res.body.kind).toBe('quiz');
    });

    it('getContent: an unknown id is 404, a non-integer id is 400', async () => {
        expect((await api.get('/api/content/getContent/2147483647')).status).toBe(404);
        expect((await api.get('/api/content/getContent/nope')).status).toBe(400);
    });

    it('invalid input: malformed content and unknown block types are 400', async () => {
        const post = (body: unknown) => api.post('/api/content/createContent').send(body as object);
        expect((await post({})).status).toBe(400);
        expect((await post({ content: 'nope' })).status).toBe(400);
        expect((await post({ content: [[{ itemType: 'Carousel', value: {} }]] })).status).toBe(400);
        expect((await post({ content: [[{ itemType: 'Text' }]] })).status).toBe(400);
    });

    it('image and audio blocks with placeholder links are saved, read back and submitted', async () => {
        const image = { itemType: 'Image', value: { title: 'A phone box', fileUrl: '/uploads/images/placeholder.png', altText: 'A red phone box' } };
        const clip = { itemType: 'Audio', value: { title: 'Answering', fileUrl: 'placeholder.mp3', transcript: 'Hallo?' } };
        const created = await createDraft([[text('Greetings', 'Hola'), image, clip]]);
        expect(created.status).toBe(201);
        const id = created.body.contentId;
        expect((await api.get(`/api/content/getContent/${id}`)).body.content[0]).toEqual([text('Greetings', 'Hola'), image, clip]);
        const res = await api.post(`/api/content/submitContent/${id}`)
            .send({ ...submission, content: [[text('Greetings', 'Hola'), image, clip]] });
        expect(res.status).toBe(200);
        expect(res.body.kind).toBe('story');
    });

    it('editContent saves the new content on the same id', async () => {
        const id = (await createDraft()).body.contentId;
        const res = await api.put(`/api/content/editContent/${id}`).send({ content: readyContent });
        expect(res.status).toBe(200);
        expect(res.body.contentId).toBe(id);
        expect(res.body.content[0][0].value.title).toBe('Greetings');
    });

    it('editContent for an unknown id is 404', async () => {
        const res = await api.put('/api/content/editContent/2147483647').send({ content: readyContent });
        expect(res.status).toBe(404);
    });

    it('nominal: submitContent sets pending and stores level and tags', async () => {
        const id = (await createDraft()).body.contentId;
        const res = await api.post(`/api/content/submitContent/${id}`)
            .send({ ...submission, chosenTags: ['food', 'greetings'] });
        expect(res.status).toBe(200);
        // Tags come back in the order they were sent in; the first is the theme.
        expect(res.body).toMatchObject({
            contentId: id, status: 'pending', level: 2, title: 'Saying hello', language: 'english',
            childFriendly: true, chosenTags: ['food', 'greetings'], kind: 'story',
        });
        const { rows } = await pool.query(`SELECT submitted_at FROM content WHERE id = $1`, [id]);
        expect(rows[0].submitted_at).not.toBeNull();
    });

    it('the server derives kind itself and ignores one sent by the client', async () => {
        const id = (await createDraft()).body.contentId;
        const res = await api.post(`/api/content/submitContent/${id}`).send({ ...submission, kind: 'quiz' });
        expect(res.body.kind).toBe('story');
    });

    it('permission: a submitted draft cannot be edited or submitted again (409)', async () => {
        const id = (await createDraft()).body.contentId;
        await api.post(`/api/content/submitContent/${id}`).send(submission);
        expect((await api.put(`/api/content/editContent/${id}`).send({ content: readyContent })).status).toBe(409);
        expect((await api.post(`/api/content/submitContent/${id}`).send(submission)).status).toBe(409);
    });

    describe('a request body the server cannot take', () => {
        it('a body over 1 MB is refused with 413 and says why, rather than crashing', async () => {
            const huge = [[text('Greetings', 'a'.repeat(1_100_000))]];
            const res = await api.post('/api/content/createContent').send({ content: huge });
            expect(res.status).toBe(413);
            expect(res.body.error).toMatch(/too large/);
        });

        it('a body that is not JSON is refused with 400, rather than crashing', async () => {
            const res = await api.post('/api/content/createContent')
                .set('Content-Type', 'application/json').send('{"content": [[');
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/could not be read/);
        });

        it('content past a limit is refused with 400 on save as well as on submit', async () => {
            const tooManyPages = Array.from({ length: 31 }, () => [text('a', 'b')]);
            const res = await api.post('/api/content/createContent').send({ content: tooManyPages });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/at most 30 pages/);
        });
    });

    describe('version counts submissions', () => {
        it('a new draft is version 0, and saving it does not change that', async () => {
            const id = (await createDraft()).body.contentId;
            expect((await api.get(`/api/content/getContent/${id}`)).body.version).toBe(0);
            const saved = await api.put(`/api/content/editContent/${id}`).send({ content: readyContent });
            expect(saved.body.version).toBe(0);
        });

        it('the first submission is version 1', async () => {
            const id = (await createDraft()).body.contentId;
            const res = await api.post(`/api/content/submitContent/${id}`).send(submission);
            expect(res.status).toBe(200);
            expect(res.body.version).toBe(1);
        });

        it('content sent back after a rejection arrives as version 2', async () => {
            const id = (await createDraft()).body.contentId;
            await api.post(`/api/content/submitContent/${id}`).send(submission);
            await pool.query(`UPDATE content SET status = 'rejected' WHERE id = $1`, [id]);

            // Editing reopens it as a draft; the number waits for the next submission.
            const reopened = await api.put(`/api/content/editContent/${id}`).send({ content: readyContent });
            expect(reopened.body).toMatchObject({ status: 'draft', version: 1 });

            const resubmitted = await api.post(`/api/content/submitContent/${id}`).send(submission);
            expect(resubmitted.body).toMatchObject({ status: 'pending', version: 2 });
        });

        it('a refused submission does not count', async () => {
            const id = (await createDraft()).body.contentId;
            expect((await api.post(`/api/content/submitContent/${id}`).send({ ...submission, title: '' })).status).toBe(400);
            expect((await api.get(`/api/content/getContent/${id}`)).body.version).toBe(0);
        });

        it('lists carry the version too', async () => {
            const id = (await createDraft()).body.contentId;
            await api.post(`/api/content/submitContent/${id}`).send(submission);
            const mine = (await api.get('/api/content/getMyContent')).body as Array<{ contentId: number; version: number }>;
            expect(mine.find(row => row.contentId === id)?.version).toBe(1);
        });
    });

    it('nominal: deleteContent removes a draft, so it can no longer be read', async () => {
        const id = (await createDraft(readyContent)).body.contentId;
        const res = await api.delete(`/api/content/deleteContent/${id}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'content deleted successfully' });
        expect((await api.get(`/api/content/getContent/${id}`)).status).toBe(404);
    });

    it('deleteContent: a second delete, or an unknown id, is 404; a non-integer id is 400', async () => {
        const id = (await createDraft()).body.contentId;
        await api.delete(`/api/content/deleteContent/${id}`);
        expect((await api.delete(`/api/content/deleteContent/${id}`)).status).toBe(404);
        expect((await api.delete('/api/content/deleteContent/2147483647')).status).toBe(404);
        expect((await api.delete('/api/content/deleteContent/nope')).status).toBe(400);
    });

    it('permission: submitted content cannot be deleted (409) and keeps its tags', async () => {
        const id = (await createDraft()).body.contentId;
        await api.post(`/api/content/submitContent/${id}`).send(submission);
        expect((await api.delete(`/api/content/deleteContent/${id}`)).status).toBe(409);
        const res = await api.get(`/api/content/getContent/${id}`);
        expect(res.body).toMatchObject({ status: 'pending', chosenTags: ['greetings'] });
    });

    it('a submit refused for a bad tag leaves the draft untouched', async () => {
        const id = (await createDraft()).body.contentId;
        await api.post(`/api/content/submitContent/${id}`).send({ ...submission, chosenTags: ['my own tag'] });
        const res = await api.get(`/api/content/getContent/${id}`);
        expect(res.body).toMatchObject({ status: 'draft', level: null, chosenTags: [], content: [[]] });
    });

    describe('submission checks run on the server too (400)', () => {
        const submitWith = async (body: object) => {
            const id = (await createDraft()).body.contentId;
            return api.post(`/api/content/submitContent/${id}`).send({ ...submission, ...body });
        };

        it('boundary: level 0 and 7 are refused, 1 and 6 accepted', async () => {
            expect((await submitWith({ level: 0 })).status).toBe(400);
            expect((await submitWith({ level: 7 })).status).toBe(400);
            expect((await submitWith({ level: 1 })).status).toBe(200);
            expect((await submitWith({ level: 6 })).status).toBe(200);
        });

        it('invalid input: a tag outside the fixed set, or a duplicate', async () => {
            expect((await submitWith({ chosenTags: ['my own tag'] })).status).toBe(400);
            expect((await submitWith({ chosenTags: ['travel', 'travel'] })).status).toBe(400);
        });

        it('invalid input: more than 10 tags per content', async () => {
            const elevenTags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
            const res = await submitWith({ chosenTags: elevenTags });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('cannot have more than 10 tags');
        });

        it('invalid input: an empty page, an untyped block, or a blank text block', async () => {
            expect((await submitWith({ content: [[text('a', 'b')], []] })).body.error).toMatch(/every page/);
            expect((await submitWith({ content: [[{ itemType: 'Pending Selection', value: {} }]] })).body.error).toMatch(/needs a type/);
            expect((await submitWith({ content: [[text('   ', 'body')]] })).body.error).toMatch(/title and text/);
        });

        it('invalid input: an audio clip without a transcript', async () => {
            const clip = { itemType: 'Audio', value: { title: 'clip', fileUrl: 'placeholder.mp3', transcript: '' } };
            expect((await submitWith({ content: [[clip]] })).body.error).toMatch(/transcript/);
        });

        it('invalid input: a multiple choice block with no question or unusable answers', async () => {
            const choice = (value: object) => ({ itemType: 'Multiple Choice', value });
            const full = { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'], correctOption: 0 };
            expect((await submitWith({ content: [[choice(full)]] })).status).toBe(200);
            expect((await submitWith({ content: [[choice({ ...full, question: '  ' })]] })).body.error).toMatch(/needs a question/);
            expect((await submitWith({ content: [[choice({ ...full, options: ['Sawubona', ''] })]] })).body.error)
                .toMatch(/at least two answers/);
            expect((await submitWith({ content: [[choice({ ...full, options: ['Sawubona', 'sawubona'] })]] })).body.error)
                .toMatch(/same answer twice/);
            expect((await submitWith({ content: [[choice({ ...full, correctOption: 5 })]] })).body.error)
                .toMatch(/marked as the right one/);
        });

        it('invalid input: a sentence with no gap, two gaps, or nothing accepted', async () => {
            const gap = (value: object) => ({ itemType: 'Fill in the Blank', value });
            const full = { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'] };
            expect((await submitWith({ content: [[gap(full)]] })).status).toBe(200);
            expect((await submitWith({ content: [[gap({ ...full, sentence: 'You say nothing.' })]] })).body.error)
                .toMatch(/exactly one \[\]/);
            expect((await submitWith({ content: [[gap({ ...full, sentence: 'You say [] and [].' })]] })).body.error)
                .toMatch(/exactly one \[\]/);
            expect((await submitWith({ content: [[gap({ ...full, accepted: ['  '] })]] })).body.error)
                .toMatch(/a spelling it accepts/);
        });

        it('invalid input: a listening question with no clip, no transcript, or one answer', async () => {
            const listen = (value: object) => ({ itemType: 'Listen and Choose', value });
            const full = { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?',
                           options: ['Who is that?', 'Where are you?'], correctOption: 0 };
            expect((await submitWith({ content: [[listen(full)]] })).status).toBe(200);
            expect((await submitWith({ content: [[listen({ ...full, fileUrl: '' })]] })).body.error).toMatch(/needs a file/);
            expect((await submitWith({ content: [[listen({ ...full, transcript: ' ' })]] })).body.error).toMatch(/needs a transcript/);
            expect((await submitWith({ content: [[listen({ ...full, options: ['Who is that?'] })]] })).body.error)
                .toMatch(/at least two answers/);
        });

        it('invalid input: media with no file, an image with no alt text, or no title', async () => {
            const image = (value: object) => ({ itemType: 'Image', value });
            expect((await submitWith({ content: [[image({ title: 'c', fileUrl: '', altText: 'a' })]] })).body.error).toMatch(/file/);
            expect((await submitWith({ content: [[image({ title: 'c', fileUrl: '/uploads/images/a.png', altText: '' })]] })).body.error).toMatch(/alt text/);
            expect((await submitWith({ content: [[image({ title: 'c', fileUrl: 'https://example.com/a.png', altText: 'a' })]] })).body.error)
                .toMatch(/uploaded here/);
            expect((await submitWith({ title: '   ' })).body.error).toMatch(/title/);
            expect((await submitWith({ language: 'french' })).body.error).toMatch(/language/);
        });
    });
});

describe('who may read and write content', () => {
    it('refuses a learner every write, and lets an author write', async () => {
        const learner = await accountWithToken('learner');
        const asLearner = (path: string) => request(app).post(path).set('Authorization', `Bearer ${learner.token}`);
        expect((await asLearner('/api/content/createContent').send({ content: [[]] })).status).toBe(403);
        expect((await request(app).post('/api/content/createContent').send({ content: [[]] })).status).toBe(401);
    });

    it('keeps one author out of another author\'s draft', async () => {
        const id = (await createDraft(readyContent)).body.contentId;
        const other = await accountWithToken('author');
        const asOther = (method: 'get' | 'put' | 'delete', path: string) =>
            request(app)[method](path).set('Authorization', `Bearer ${other.token}`);

        expect((await asOther('get', `/api/content/getContent/${id}`)).status).toBe(403);
        expect((await asOther('put', `/api/content/editContent/${id}`).send({ content: readyContent })).status).toBe(403);
        expect((await asOther('delete', `/api/content/deleteContent/${id}`)).status).toBe(403);
    });

    it('lists an author their own content only', async () => {
        const mine = (await createDraft(readyContent)).body.contentId;
        const other = await accountWithToken('author');
        const theirs = await request(app).post('/api/content/createContent')
            .set('Authorization', `Bearer ${other.token}`).send({ content: [[]] });
        createdIds.push(theirs.body.contentId);

        const res = await api.get('/api/content/getMyContent');
        expect(res.status).toBe(200);
        const ids = res.body.map((row: { contentId: number }) => row.contentId);
        expect(ids).toContain(mine);
        expect(ids).not.toContain(theirs.body.contentId);
        expect(res.body[0]).toHaveProperty('authorName');
        expect(res.body[0]).not.toHaveProperty('content');
    });

    it('shows a moderator the pending queue, and refuses an author that list', async () => {
        const id = (await createDraft()).body.contentId;
        await api.post(`/api/content/submitContent/${id}`).send(submission);

        const moderator = await accountWithToken('moderator');
        const queue = await request(app).get('/api/content/getPendingContent')
            .set('Authorization', `Bearer ${moderator.token}`);
        expect(queue.status).toBe(200);
        expect(queue.body.map((row: { contentId: number }) => row.contentId)).toContain(id);

        expect((await api.get('/api/content/getPendingContent')).status).toBe(403);

        // A moderator may open submitted content, but not somebody's draft.
        expect((await request(app).get(`/api/content/getContent/${id}`)
            .set('Authorization', `Bearer ${moderator.token}`)).status).toBe(200);
        const draftId = (await createDraft()).body.contentId;
        expect((await request(app).get(`/api/content/getContent/${draftId}`)
            .set('Authorization', `Bearer ${moderator.token}`)).status).toBe(403);
    });

    it('lists approved content to a learner, filtered by level, language and the child gate', async () => {
        const approved = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${approved}`).send({ ...submission, level: 3 });
        await pool.query(`UPDATE content SET status = 'approved' WHERE id = $1`, [approved]);

        const learner = await accountWithToken('learner');
        // The onboarding slice decides whether a learner may read at all, so the
        // learner has to have finished setup first. This one is an adult.
        await pool.query(
            `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
             VALUES ($1, 'english', DATE '1998-04-02', 'english', 20)`,
            [learner.user.id]);
        const ask = (query: string) => request(app).get(`/api/content/getApprovedContent${query}`)
            .set('Authorization', `Bearer ${learner.token}`);
        const idsOf = (body: Array<{ contentId: number }>) => body.map(row => row.contentId);

        expect(idsOf((await ask('')).body)).toContain(approved);
        expect(idsOf((await ask('?level=3')).body)).toContain(approved);
        expect(idsOf((await ask('?level=5')).body)).not.toContain(approved);
        expect(idsOf((await ask('?language=english')).body)).toContain(approved);
        expect(idsOf((await ask('?language=zulu')).body)).not.toContain(approved);
        expect(idsOf((await ask('?childFriendlyOnly=true')).body)).toContain(approved);
        expect((await ask('?language=french')).status).toBe(400);

        // A learner may read approved content at their level, once placed there.
        await placeAt(learner.user.id, 3);
        expect((await request(app).get(`/api/content/getContent/${approved}`)
            .set('Authorization', `Bearer ${learner.token}`)).status).toBe(200);
    });

    it('lists content above the learner\'s level as locked, and refuses to open it (403)', async () => {
        const levelTwo = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${levelTwo}`).send({ ...submission, level: 2 });
        const levelFour = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${levelFour}`).send({ ...submission, level: 4 });
        await pool.query(`UPDATE content SET status = 'approved' WHERE id = ANY($1::int[])`, [[levelTwo, levelFour]]);

        const learner = await accountWithToken('learner');
        await finishSetup(learner.user.id, '1998-04-02');
        await placeAt(learner.user.id, 2);
        const list = await request(app).get('/api/content/getApprovedContent')
            .set('Authorization', `Bearer ${learner.token}`);
        const lockOf = (id: number) => list.body.find((row: { contentId: number }) => row.contentId === id)?.locked;
        // Boundary: content at the learner's own level is open, one above is locked.
        expect(lockOf(levelTwo)).toBe(false);
        expect(lockOf(levelFour)).toBe(true);

        const open = (id: number) => request(app).get(`/api/content/getContent/${id}`)
            .set('Authorization', `Bearer ${learner.token}`);
        expect((await open(levelTwo)).status).toBe(200);
        const refused = await open(levelFour);
        expect(refused.status).toBe(403);
        expect(refused.body.error).toBe('this content is above your level');

        // Staff are never locked out, and see nothing locked.
        const staffList = await api.get('/api/content/getApprovedContent');
        expect(staffList.body.every((row: { locked: boolean }) => row.locked === false)).toBe(true);
        expect((await api.get(`/api/content/getContent/${levelFour}`)).status).toBe(200);
    });

    it('never sends the answers to a learner, but does to the author and a moderator', async () => {
        const question = { itemType: 'Multiple Choice',
                           value: { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'], correctOption: 0 } };
        const gap = { itemType: 'Fill in the Blank',
                      value: { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'] } };
        const pages = [[question, gap]];
        const approved = (await createDraft(pages)).body.contentId;
        await api.post(`/api/content/submitContent/${approved}`).send({ ...submission, content: pages });
        await pool.query(`UPDATE content SET status = 'approved' WHERE id = $1`, [approved]);

        const readAs = (token: string) => request(app).get(`/api/content/getContent/${approved}`)
            .set('Authorization', `Bearer ${token}`);

        // Searched as text, so an answer field anywhere in the response fails the test.
        const learner = await accountWithToken('learner');
        await finishSetup(learner.user.id, '1998-04-02');
        await placeAt(learner.user.id, 2);
        const learnerView = await readAs(learner.token);
        expect(learnerView.status).toBe(200);
        expect(JSON.stringify(learnerView.body)).not.toMatch(/correctOption|accepted/);
        expect(learnerView.body.content[0][0].value).toEqual({ title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'] });

        // The author and a moderator still get the whole thing.
        expect((await readAs(token)).body.content).toEqual(pages);
        const moderator = await accountWithToken('moderator');
        expect((await readAs(moderator.token)).body.content).toEqual(pages);
    });

    it('opening content by its id goes through the same gate as the list', async () => {
        const adultOnly = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${adultOnly}`).send({ ...submission, childFriendly: false });
        const forChildren = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${forChildren}`).send({ ...submission, childFriendly: true });
        await pool.query(`UPDATE content SET status = 'approved' WHERE id = ANY($1::int[])`, [[adultOnly, forChildren]]);
        const open = (token: string, id: number) => request(app).get(`/api/content/getContent/${id}`)
            .set('Authorization', `Bearer ${token}`);

        // Setup not finished: refused, as the list is.
        const fresh = await accountWithToken('learner');
        expect((await open(fresh.token, forChildren)).status).toBe(403);

        // Under 13 with nobody linked: refused.
        const child = await accountWithToken('learner');
        const nineYearsAgo = new Date(Date.now() - 9 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        await finishSetup(child.user.id, nineYearsAgo);
        await placeAt(child.user.id, 2);
        expect((await open(child.token, forChildren)).status).toBe(403);

        // Linked to a guardian: child-friendly content opens, the rest does not.
        const guardian = await accountWithToken('guardian');
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`,
            [guardian.user.id, child.user.id]);
        expect((await open(child.token, forChildren)).status).toBe(200);
        const refused = await open(child.token, adultOnly);
        expect(refused.status).toBe(403);
        expect(refused.body.error).toMatch(/child-friendly/);

        // An ended link no longer counts: the child is refused again.
        await pool.query(`UPDATE parent_child_links SET unlinked_at = now() WHERE guardian_id = $1 AND learner_id = $2`,
            [guardian.user.id, child.user.id]);
        expect((await open(child.token, forChildren)).status).toBe(403);

        // An adult learner opens either.
        const adult = await accountWithToken('learner');
        await finishSetup(adult.user.id, '1998-04-02');
        await placeAt(adult.user.id, 2);
        expect((await open(adult.token, adultOnly)).status).toBe(200);
        expect((await open(adult.token, forChildren)).status).toBe(200);
    });

    it('the gate is for learners only: a guardian, the author and a moderator are not asked for setup', async () => {
        const id = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${id}`).send({ ...submission, childFriendly: false });
        await pool.query(`UPDATE content SET status = 'approved' WHERE id = $1`, [id]);
        const open = (token: string) => request(app).get(`/api/content/getContent/${id}`)
            .set('Authorization', `Bearer ${token}`);

        expect((await open((await accountWithToken('guardian')).token)).status).toBe(200);
        expect((await open(token)).status).toBe(200);
        expect((await open((await accountWithToken('moderator')).token)).status).toBe(200);
    });

    it('refuses the learner list until setup is done, and gates an under-13 learner', async () => {
        const approved = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${approved}`).send({ ...submission, childFriendly: false });
        await pool.query(`UPDATE content SET status = 'approved' WHERE id = $1`, [approved]);

        // No settings row yet: setup has not been completed.
        const fresh = await accountWithToken('learner');
        const askAs = (token: string) => request(app).get('/api/content/getApprovedContent')
            .set('Authorization', `Bearer ${token}`);
        expect((await askAs(fresh.token)).status).toBe(403);

        // Under 13 and nobody linked: still refused.
        const child = await accountWithToken('learner');
        await pool.query(
            `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
             VALUES ($1, 'english', CURRENT_DATE - INTERVAL '9 years', 'english', 15)`,
            [child.user.id]);
        expect((await askAs(child.token)).status).toBe(403);

        // With a guardian linked they may read, but only child-friendly content,
        // whatever the request asks for.
        const guardian = await accountWithToken('guardian');
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`,
            [guardian.user.id, child.user.id]);
        const allowed = await askAs(child.token);
        expect(allowed.status).toBe(200);
        expect(allowed.body.every((row: { childFriendly: boolean }) => row.childFriendly)).toBe(true);
        expect(allowed.body.map((row: { contentId: number }) => row.contentId)).not.toContain(approved);
    });

    it('reopens rejected content as a draft when its author edits it', async () => {
        const id = (await createDraft(readyContent)).body.contentId;
        await api.post(`/api/content/submitContent/${id}`).send(submission);
        await pool.query(`UPDATE content SET status = 'rejected' WHERE id = $1`, [id]);

        const res = await api.put(`/api/content/editContent/${id}`).send({ content: readyContent });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('draft');
    });
});
