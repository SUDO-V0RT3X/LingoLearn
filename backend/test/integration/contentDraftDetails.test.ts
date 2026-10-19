// CONTENT DRAFT DETAILS integration tests — a draft keeps the level and tags an
// author picked on the submit screen, so going back to the builder and saving
// loses nothing. The real Express app over the real database (docker locally).
// Every row a test creates is deleted afterwards.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

let token = '';
const api = {
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${token}`),
    put: (path: string) => request(app).put(path).set('Authorization', `Bearer ${token}`),
};

beforeAll(async () => {
    token = (await accountWithToken('author')).token;
});

const text = (title: string, body: string) => ({ itemType: 'Text', value: { title, text: body } });
const readyContent = [[text('Greetings', 'Hola')]];
const submission = {
    content: readyContent, title: 'Saying hello', language: 'english', childFriendly: false,
    level: 2, chosenTags: ['greetings', 'family'],
};

const createdIds: number[] = [];
async function createDraft(body: object = {}) {
    const res = await api.post('/api/content/createContent').send({ content: [[]], ...body });
    if (typeof res.body.contentId === 'number') createdIds.push(res.body.contentId);
    return res;
}
const edit = (id: number, body: object) => api.put(`/api/content/editContent/${id}`).send({ content: [[]], ...body });
const read = async (id: number) => (await api.get(`/api/content/getContent/${id}`)).body;

afterAll(async () => {
    await pool.query(`DELETE FROM content WHERE id = ANY($1::int[])`, [createdIds]);
    await deleteTestAccounts();
});

describe('a draft keeps its level and tags', () => {
    it('nominal: createContent stores a level and tags sent with the first save', async () => {
        const res = await createDraft({ level: 3, chosenTags: ['food', 'travel'] });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: 'draft', level: 3, chosenTags: ['food', 'travel'] });
        expect(await read(res.body.contentId)).toMatchObject({ level: 3, chosenTags: ['food', 'travel'] });
    });

    it('nominal: editContent stores a level and tags, and getContent reads them back', async () => {
        const id = (await createDraft()).body.contentId;
        const res = await edit(id, { level: 5, chosenTags: ['greetings', 'family'] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ level: 5, chosenTags: ['greetings', 'family'] });
        expect(await read(id)).toMatchObject({ level: 5, chosenTags: ['greetings', 'family'] });
    });

    it('a save that leaves the level and tags out keeps them', async () => {
        const id = (await createDraft({ level: 2, chosenTags: ['animals'] })).body.contentId;
        const res = await edit(id, { content: readyContent, title: 'Kept' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ title: 'Kept', level: 2, chosenTags: ['animals'] });
    });

    it('null clears the level and an empty list clears the tags', async () => {
        const id = (await createDraft({ level: 4, chosenTags: ['school', 'numbers'] })).body.contentId;
        const res = await edit(id, { level: null, chosenTags: [] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ level: null, chosenTags: [] });
    });

    it('a tag list sent again replaces the old one rather than adding to it', async () => {
        const id = (await createDraft({ chosenTags: ['food', 'travel'] })).body.contentId;
        const res = await edit(id, { chosenTags: ['weather'] });
        expect(res.body.chosenTags).toEqual(['weather']);
    });

    it('rejected content reopens as a draft that keeps its level and tags, or takes new ones', async () => {
        const id = (await createDraft()).body.contentId;
        await api.post(`/api/content/submitContent/${id}`).send(submission);
        await pool.query(`UPDATE content SET status = 'rejected' WHERE id = $1`, [id]);
        const kept = await edit(id, { content: readyContent });
        expect(kept.body).toMatchObject({ status: 'draft', level: 2, chosenTags: ['greetings', 'family'] });
        const changed = await edit(id, { content: readyContent, level: null, chosenTags: ['family'] });
        expect(changed.body).toMatchObject({ status: 'draft', level: null, chosenTags: ['family'] });
    });
});

describe('the tags keep the order the author gave them', () => {
    //The builder reads the first tag as the theme, so a reload must not reorder them.
    it('a draft reads its tags back in the order they were saved, not by name', async () => {
        const id = (await createDraft({ chosenTags: ['weather', 'animals', 'travel'] })).body.contentId;
        expect((await read(id)).chosenTags).toEqual(['weather', 'animals', 'travel']);
        await edit(id, { chosenTags: ['travel', 'weather'] });
        expect((await read(id)).chosenTags).toEqual(['travel', 'weather']);
    });

    it('submitting keeps the order too, in the record and in the author\'s list', async () => {
        const id = (await createDraft()).body.contentId;
        const res = await api.post(`/api/content/submitContent/${id}`)
            .send({ ...submission, chosenTags: ['vocabulary', 'animals'] });
        expect(res.status).toBe(200);
        expect(res.body.chosenTags).toEqual(['vocabulary', 'animals']);
        expect((await read(id)).chosenTags).toEqual(['vocabulary', 'animals']);
        const mine = (await api.get('/api/content/getMyContent')).body as { contentId: number; chosenTags: string[] }[];
        expect(mine.find(row => row.contentId === id)?.chosenTags).toEqual(['vocabulary', 'animals']);
    });
});

describe('draft details the server refuses (400)', () => {
    it('invalid input: a tag outside the fixed set, on create and on edit', async () => {
        const created = await createDraft({ chosenTags: ['my own tag'] });
        expect(created.status).toBe(400);
        expect(created.body.error).toBe('chosenTags must be distinct tags from the fixed set');

        const id = (await createDraft({ chosenTags: ['food'] })).body.contentId;
        const edited = await edit(id, { content: readyContent, level: 6, chosenTags: ['food', 'my own tag'] });
        expect(edited.status).toBe(400);
        expect(edited.body.error).toBe('chosenTags must be distinct tags from the fixed set');
        //Refused as a whole: nothing else in that save was kept either.
        expect(await read(id)).toMatchObject({ level: null, chosenTags: ['food'], content: [[]] });
    });

    it('invalid input: a test tag is not a theme an author may choose', async () => {
        expect((await createDraft({ chosenTags: ['quiz'] })).status).toBe(400);
    });

    it('invalid input: a duplicate tag, a tag that is not text, or tags that are not a list', async () => {
        for (const chosenTags of [['travel', 'travel'], [3], 'travel', null]) {
            const res = await createDraft({ chosenTags });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('chosenTags must be distinct tags from the fixed set');
        }
    });

    it('invalid input: more than 10 tags', async () => {
        const res = await createDraft({ chosenTags: Array.from({ length: 11 }, (_, i) => `tag-${i}`) });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('a single piece of content cannot have more than 10 tags');
    });

    it('boundary: level 0, 7, 2.5 and "3" are refused; 1, 6 and null accepted', async () => {
        for (const level of [0, 7, 2.5, '3']) {
            const res = await createDraft({ level });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('level must be a whole number from 1 to 6');
        }
        for (const level of [1, 6, null]) {
            expect((await createDraft({ level })).status).toBe(201);
        }
    });
});
