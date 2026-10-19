// MODERATION integration tests — the real Express app over the real database.
// The queue and the review screen read the content slice's own rows, so these
// tests submit content as an author and then decide on it as a moderator.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

let authorToken = '';
let moderatorToken = '';
let authorName = '';
const createdIds: number[] = [];

const authed = (token: string) => ({
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${token}`),
});

const text = (title: string, body: string) => ({ itemType: 'Text', value: { title, text: body } });

/** Creates a draft and submits it, so it is waiting in the queue. */
async function submitContent(title: string) {
    const created = await authed(authorToken).post('/api/content/createContent').send({ content: [[]] });
    const contentId = created.body.contentId;
    createdIds.push(contentId);

    await authed(authorToken).post(`/api/content/submitContent/${contentId}`).send({
        content: [[text('Greetings', 'Sawubona')]],
        title,
        language: 'zulu',
        childFriendly: true,
        level: 2,
        chosenTags: ['greetings'],
    });

    return contentId;
}

beforeAll(async () => {
    const author = await accountWithToken('author');
    authorToken = author.token;
    authorName = author.user.name;
    moderatorToken = (await accountWithToken('moderator')).token;
});

afterAll(async () => {
    await pool.query(`DELETE FROM content_reviews WHERE content_id = ANY($1::int[])`, [createdIds]);
    await pool.query(`DELETE FROM content WHERE id = ANY($1::int[])`, [createdIds]);
    await deleteTestAccounts();
});

describe('review queue', () => {
    it('lists submitted content with its real author, level and audience', async () => {
        const contentId = await submitContent('Market day');

        const res = await authed(moderatorToken).get('/api/reviewQueue/getReviewQueue');
        expect(res.status).toBe(200);

        const row = res.body.find((item: { id: number }) => item.id === contentId);
        expect(row).toMatchObject({
            title: 'Market day',
            author: authorName,
            contentType: 'Lesson',
            level: 2,
            audience: 'Child-friendly',
            language: 'zulu',
        });
        expect(row.submittedAt).not.toBeNull();
    });

    it('is sorted with the longest wait first', async () => {
        const res = await authed(moderatorToken).get('/api/reviewQueue/getReviewQueue');
        const waits = res.body.map((row: { submittedAt: string }) => new Date(row.submittedAt).getTime());
        expect(waits).toEqual([...waits].sort((a, b) => a - b));
    });

    it('is refused without a session, and to an author', async () => {
        expect((await request(app).get('/api/reviewQueue/getReviewQueue')).status).toBe(401);
        expect((await authed(authorToken).get('/api/reviewQueue/getReviewQueue')).status).toBe(403);
    });
});

describe('review detail and decisions', () => {
    it('shows the pages the author actually wrote', async () => {
        const contentId = await submitContent('Counting to ten');

        const res = await authed(moderatorToken).get(`/api/reviewDetail/getReviewDetail/${contentId}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: contentId, title: 'Counting to ten', status: 'pending', language: 'zulu' });
        expect(res.body.content[0][0]).toMatchObject({ itemType: 'Text' });
        expect(res.body.chosenTags).toEqual(['greetings']);
        expect(res.body.decisions).toEqual([]);
    });

    it('approving records the decision and publishes the content', async () => {
        const contentId = await submitContent('Days of the week');

        const res = await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`)
            .send({ decision: 'approved' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('approved');
        expect(res.body.decisions[0]).toMatchObject({ decision: 'approved', reason: '' });

        const { rows } = await pool.query(`SELECT status FROM content WHERE id = $1`, [contentId]);
        expect(rows[0].status).toBe('approved');
    });

    it('rejecting needs a reason, and sends the content back to its author', async () => {
        const contentId = await submitContent('Half-finished lesson');

        const noReason = await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`)
            .send({ decision: 'rejected' });
        expect(noReason.status).toBe(400);

        const rejected = await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`)
            .send({ decision: 'rejected', reason: 'The second page has no audio yet.' });
        expect(rejected.status).toBe(200);
        expect(rejected.body.status).toBe('rejected');
        expect(rejected.body.decisions[0]).toMatchObject({
            decision: 'rejected',
            reason: 'The second page has no audio yet.',
        });

        // The author can now edit it again, which reopens it as a draft.
        const reopened = await request(app).put(`/api/content/editContent/${contentId}`)
            .set('Authorization', `Bearer ${authorToken}`)
            .send({ content: [[text('Greetings', 'Sawubona')]] });
        expect(reopened.body.status).toBe('draft');
    });

    it('content its author reopened still shows its review history, read-only', async () => {
        const contentId = await submitContent('Reopened lesson');
        await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`)
            .send({ decision: 'rejected', reason: 'Add a picture to page one.' });
        await request(app).put(`/api/content/editContent/${contentId}`)
            .set('Authorization', `Bearer ${authorToken}`)
            .send({ content: [[text('Greetings', 'Sawubona')]] });

        const res = await authed(moderatorToken).get(`/api/reviewDetail/getReviewDetail/${contentId}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: contentId, status: 'draft', version: 1 });
        expect(res.body.decisions).toHaveLength(1);
        expect(res.body.decisions[0]).toMatchObject({ decision: 'rejected', reason: 'Add a picture to page one.' });

        // Read-only: nothing can be decided until the author submits it again.
        expect((await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`)
            .send({ decision: 'approved' })).status).toBe(409);
    });

    it('shows question blocks to a moderator with their answers', async () => {
        const created = await authed(authorToken).post('/api/content/createContent').send({ content: [[]] });
        const contentId = created.body.contentId;
        createdIds.push(contentId);
        const question = {
            itemType: 'Multiple Choice',
            value: { title: '', question: 'Hello?', options: ['Sawubona', 'Hamba'], correctOption: 0 },
        };
        const gap = { itemType: 'Fill in the Blank', value: { title: '', sentence: 'Ngi[] kahle', accepted: ['philile'] } };
        const submitted = await authed(authorToken).post(`/api/content/submitContent/${contentId}`).send({
            content: [[question, gap]], title: 'Greeting quiz', language: 'zulu', childFriendly: false, level: 1, chosenTags: [],
        });
        expect(submitted.status).toBe(200);

        const res = await authed(moderatorToken).get(`/api/reviewDetail/getReviewDetail/${contentId}`);
        expect(res.body).toMatchObject({ contentType: 'Test', audience: 'General', version: 1 });
        expect(res.body.content[0][0].value.correctOption).toBe(0);
        expect(res.body.content[0][1].value.accepted).toEqual(['philile']);
    });

    it('refuses an unknown decision, a second decision, and a draft', async () => {
        const contentId = await submitContent('Decided once');
        await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`).send({ decision: 'approved' });

        expect((await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`)
            .send({ decision: 'approved' })).status).toBe(409);
        expect((await authed(moderatorToken).post(`/api/reviewDetail/decideContent/${contentId}`)
            .send({ decision: 'maybe' })).status).toBe(400);

        const draft = await authed(authorToken).post('/api/content/createContent').send({ content: [[]] });
        createdIds.push(draft.body.contentId);
        expect((await authed(moderatorToken).get(`/api/reviewDetail/getReviewDetail/${draft.body.contentId}`)).status).toBe(409);
    });

    it('refuses an unknown id, a non-integer id, and an author', async () => {
        expect((await authed(moderatorToken).get('/api/reviewDetail/getReviewDetail/2147483647')).status).toBe(404);
        expect((await authed(moderatorToken).get('/api/reviewDetail/getReviewDetail/nope')).status).toBe(400);
        expect((await authed(authorToken).get('/api/reviewDetail/getReviewDetail/1')).status).toBe(403);
    });
});
