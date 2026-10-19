// READING integration tests — saved reading progress over the real Express app
// and database (docker locally). Every row a test creates is deleted afterwards.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';
import { deleteTestContent, insertContent, learnerAt } from '../helpers/learnerContent.js';

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

const save = (token: string, contentId: number | string, body: object) =>
    request(app).put(`/api/reading/saveProgress/${contentId}`).set('Authorization', `Bearer ${token}`).send(body);
const read = (token: string, contentId: number | string) =>
    request(app).get(`/api/reading/getProgress/${contentId}`).set('Authorization', `Bearer ${token}`);

describe('reading progress', () => {
    it('nominal: starts at page 0, then resumes at the page last saved', async () => {
        const contentId = await insertContent(authorId);   // three pages
        const learner = await learnerAt(1);

        expect((await read(learner.token, contentId)).body).toEqual({ page: 0, totalPages: 3 });
        const saved = await save(learner.token, contentId, { page: 1, totalPages: 3 });
        expect(saved.status).toBe(200);
        expect(saved.body).toEqual({ page: 1, totalPages: 3 });
        expect((await read(learner.token, contentId)).body.page).toBe(1);

        // Saving again overwrites; going back a page is remembered too.
        await save(learner.token, contentId, { page: 0 });
        expect((await read(learner.token, contentId)).body.page).toBe(0);
    });

    it('keeps each learner\'s place separate', async () => {
        const contentId = await insertContent(authorId);
        const one = await learnerAt(1);
        const other = await learnerAt(1);

        await save(one.token, contentId, { page: 2 });
        expect((await read(other.token, contentId)).body.page).toBe(0);
    });

    it('boundary: the last page is accepted, one past it and a negative page are 400', async () => {
        const contentId = await insertContent(authorId);
        const learner = await learnerAt(1);

        expect((await save(learner.token, contentId, { page: 2 })).status).toBe(200);
        expect((await save(learner.token, contentId, { page: 3 })).status).toBe(400);
        expect((await save(learner.token, contentId, { page: -1 })).status).toBe(400);
    });

    it('invalid input: a missing page, a page count that does not match, or a non-integer id are 400', async () => {
        const contentId = await insertContent(authorId);
        const learner = await learnerAt(1);

        expect((await save(learner.token, contentId, {})).status).toBe(400);
        expect((await save(learner.token, contentId, { page: '1' })).status).toBe(400);
        expect((await save(learner.token, contentId, { page: 0, totalPages: 9 })).status).toBe(400);
        expect((await save(learner.token, 'nope', { page: 0 })).status).toBe(400);
        expect((await read(learner.token, 'nope')).status).toBe(400);
    });

    it('permission: locked, child-unfriendly, draft and unknown content are refused', async () => {
        const aboveLevel = await insertContent(authorId, { level: 4 });
        const adultOnly = await insertContent(authorId, { childFriendly: false });
        const draft = await insertContent(authorId, { status: 'draft' });
        const learner = await learnerAt(2);
        const child = await learnerAt(2, 'child');

        expect((await save(learner.token, aboveLevel, { page: 0 })).status).toBe(403);
        expect((await read(learner.token, aboveLevel)).status).toBe(403);
        expect((await save(child.token, adultOnly, { page: 0 })).status).toBe(403);
        expect((await save(learner.token, draft, { page: 0 })).status).toBe(404);
        expect((await read(learner.token, 2147483647)).status).toBe(404);

        const author = await accountWithToken('author');
        expect((await read(author.token, adultOnly)).status).toBe(403);
    });

    it('My Learning offers part-read content to continue, and drops it once the last page is reached', async () => {
        const contentId = await insertContent(authorId, { title: 'Halfway there' });
        const learner = await learnerAt(1);
        const continueReading = async () => (await request(app).get('/api/testAttempts/myLearning')
            .set('Authorization', `Bearer ${learner.token}`)).body.continueReading;

        await save(learner.token, contentId, { page: 1 });
        expect(await continueReading()).toEqual([
            expect.objectContaining({ contentId, title: 'Halfway there', page: 1, totalPages: 3 }),
        ]);

        await save(learner.token, contentId, { page: 2 });
        expect(await continueReading()).toEqual([]);
    });
});
