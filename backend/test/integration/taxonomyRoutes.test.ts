// TAXONOMY integration tests — the real Express app over the real database.
// The SQL runs for real here: levels and tags come from 400_taxonomy.sql, and
// content tags are linked against a content row created for the test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

let authorToken = '';
let adminToken = '';
let learnerToken = '';
let contentId = 0;
const createdTagNames: string[] = [];

const authed = (token: string) => ({
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${token}`),
    put: (path: string) => request(app).put(path).set('Authorization', `Bearer ${token}`),
    delete: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${token}`),
});

beforeAll(async () => {
    const author = await accountWithToken('author');
    authorToken = author.token;
    adminToken = (await accountWithToken('administrator')).token;
    learnerToken = (await accountWithToken('learner')).token;

    const { rows } = await pool.query(
        `INSERT INTO content (author_id, content) VALUES ($1, '[[]]'::jsonb) RETURNING id`,
        [author.user.id],
    );
    contentId = rows[0].id;
});

afterAll(async () => {
    await pool.query(`DELETE FROM content_tags WHERE content_id = $1`, [contentId]);
    await pool.query(`DELETE FROM content WHERE id = $1`, [contentId]);
    await pool.query(`DELETE FROM tags WHERE name = ANY($1::text[])`, [createdTagNames]);
    await deleteTestAccounts();
});

describe('taxonomy routes', () => {
    it('lists the six seeded levels in order', async () => {
        const res = await authed(authorToken).get('/api/taxonomy/getLevels');
        expect(res.status).toBe(200);
        expect(res.body.map((level: { level_number: number }) => level.level_number)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('lists tags, and narrows them to one type', async () => {
        const all = await authed(authorToken).get('/api/taxonomy/getTags');
        expect(all.status).toBe(200);
        expect(all.body.length).toBeGreaterThan(10);

        const themes = await authed(authorToken).get('/api/taxonomy/getTags?type=theme');
        expect(themes.body.every((tag: { tag_type: string }) => tag.tag_type === 'theme')).toBe(true);
        expect(themes.body.map((tag: { name: string }) => tag.name)).toContain('greetings');
    });

    it('rejects an unknown tag type filter', async () => {
        const res = await authed(authorToken).get('/api/taxonomy/getTags?type=invalid');
        expect(res.status).toBe(400);
    });

    it('lets an administrator add a tag, and refuses everyone else', async () => {
        const name = `theme-${Date.now().toString(36)}`;
        createdTagNames.push(name);

        const refused = await authed(authorToken).post('/api/taxonomy/createTag')
            .send({ name, tag_type: 'theme' });
        expect(refused.status).toBe(403);

        const created = await authed(adminToken).post('/api/taxonomy/createTag')
            .send({ name, tag_type: 'theme', description: 'Added by a test' });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ name, tag_type: 'theme' });

        const duplicate = await authed(adminToken).post('/api/taxonomy/createTag')
            .send({ name, tag_type: 'theme' });
        expect(duplicate.status).toBe(409);
    });

    it('rejects an invalid tag body', async () => {
        const res = await authed(adminToken).post('/api/taxonomy/createTag').send({ name: 'x', tag_type: 'colour' });
        expect(res.status).toBe(400);
    });

    it('reads the tags on a piece of content', async () => {
        const [first, second] = (await authed(authorToken).get('/api/taxonomy/getTags?type=theme')).body as Array<{ id: number }>;
        await pool.query(`INSERT INTO content_tags (content_id, tag_id) VALUES ($1, $2), ($1, $3)`, [contentId, first.id, second.id]);

        const read = await authed(authorToken).get(`/api/taxonomy/getContentTags/${contentId}`);
        expect(read.status).toBe(200);
        expect(read.body.map((row: { tag_id: number }) => row.tag_id).sort()).toEqual([first.id, second.id].sort());

        await pool.query(`DELETE FROM content_tags WHERE content_id = $1`, [contentId]);
    });

    it('has no route that retags content directly: tags are set only by submitting it', async () => {
        expect((await authed(authorToken).post(`/api/taxonomy/setContentTags/${contentId}`).send({ tag_ids: [] })).status).toBe(404);
        expect((await authed(authorToken).post(`/api/taxonomy/addContentTag/${contentId}`).send({ tag_id: 1 })).status).toBe(404);
        expect((await authed(authorToken).delete(`/api/taxonomy/removeContentTag/${contentId}/1`)).status).toBe(404);
    });

    it('rejects a content id that is not a positive integer', async () => {
        expect((await authed(authorToken).get('/api/taxonomy/getContentTags/nope')).status).toBe(400);
    });

    it('lets a learner read the vocabulary but not change it', async () => {
        expect((await authed(learnerToken).get('/api/taxonomy/getTags')).status).toBe(200);
        const res = await authed(learnerToken).post('/api/taxonomy/createTag').send({ name: 'nope', tag_type: 'theme' });
        expect(res.status).toBe(403);
    });

    it('lets an administrator fetch tags with usage metrics, and refuses non-admins', async () => {
        const refused = await authed(authorToken).get('/api/taxonomy/getTagsWithUsage');
        expect(refused.status).toBe(403);

        const res = await authed(adminToken).get('/api/taxonomy/getTagsWithUsage');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0]).toHaveProperty('usage_count');

        const themes = await authed(adminToken).get('/api/taxonomy/getTagsWithUsage?type=theme');
        expect(themes.status).toBe(200);
        expect(themes.body.every((t: { tag_type: string }) => t.tag_type === 'theme')).toBe(true);
    });

    it('lets an administrator update an existing tag, and rejects duplicate names or non-admin access', async () => {
        const tagName = `upd-${Date.now().toString(36)}`;
        createdTagNames.push(tagName);
        const created = await authed(adminToken).post('/api/taxonomy/createTag')
            .send({ name: tagName, tag_type: 'theme', description: 'Original description' });
        expect(created.status).toBe(201);
        const tagId = created.body.id;

        // Non-admin receives 403
        const refused = await authed(authorToken).put(`/api/taxonomy/updateTag/${tagId}`)
            .send({ description: 'Hacked description' });
        expect(refused.status).toBe(403);

        // Admin updates successfully
        const updated = await authed(adminToken).put(`/api/taxonomy/updateTag/${tagId}`)
            .send({ description: 'Updated description', tag_type: 'theme' });
        expect(updated.status).toBe(200);
        expect(updated.body.description).toBe('Updated description');

        // Rejects non-existent tag
        const notFound = await authed(adminToken).put('/api/taxonomy/updateTag/999999')
            .send({ name: 'does-not-exist' });
        expect(notFound.status).toBe(404);
    });

    it('enforces delete safety: deletes unassigned tag but blocks deletion when assigned to content (Table IV Test 15)', async () => {
        // Create an unassigned tag and delete it
        const unassignedName = `del-safe-${Date.now().toString(36)}`;
        createdTagNames.push(unassignedName);
        const unassigned = await authed(adminToken).post('/api/taxonomy/createTag')
            .send({ name: unassignedName, tag_type: 'theme' });
        expect(unassigned.status).toBe(201);

        // Non-admin cannot delete
        const refused = await authed(authorToken).delete(`/api/taxonomy/deleteTag/${unassigned.body.id}`);
        expect(refused.status).toBe(403);

        // Admin successfully deletes unassigned tag
        const deleted = await authed(adminToken).delete(`/api/taxonomy/deleteTag/${unassigned.body.id}`);
        expect(deleted.status).toBe(200);
        expect(deleted.body.message).toContain('deleted successfully');

        // Create a tag and assign it to content
        const assignedName = `del-blocked-${Date.now().toString(36)}`;
        createdTagNames.push(assignedName);
        const assigned = await authed(adminToken).post('/api/taxonomy/createTag')
            .send({ name: assignedName, tag_type: 'theme' });
        expect(assigned.status).toBe(201);
        const assignedTagId = assigned.body.id;

        await pool.query(`INSERT INTO content_tags (content_id, tag_id) VALUES ($1, $2)`, [contentId, assignedTagId]);

        // TABLE IV TEST 15: Deleting an in-use tag is blocked with 409
        const blocked = await authed(adminToken).delete(`/api/taxonomy/deleteTag/${assignedTagId}`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.error).toBe('Cannot delete tag because it is currently assigned to content');

        // Cleanup: remove content tag link so afterAll can clean up
        await pool.query(`DELETE FROM content_tags WHERE content_id = $1 AND tag_id = $2`, [contentId, assignedTagId]);
    });

    it('refuses to change the type of a tag in use, and allows it on an unused one', async () => {
        const name = `retype-${Date.now().toString(36)}`;
        createdTagNames.push(name);
        const tag = (await authed(adminToken).post('/api/taxonomy/createTag').send({ name, tag_type: 'theme' })).body;

        // nominal: unused, so its type may change
        const unused = await authed(adminToken).put(`/api/taxonomy/updateTag/${tag.id}`).send({ tag_type: 'test' });
        expect(unused.status).toBe(200);
        expect(unused.body.tag_type).toBe('test');

        await pool.query(`INSERT INTO content_tags (content_id, tag_id) VALUES ($1, $2)`, [contentId, tag.id]);

        // invalid: in use, so a different type is refused and nothing changes
        const refused = await authed(adminToken).put(`/api/taxonomy/updateTag/${tag.id}`).send({ tag_type: 'theme' });
        expect(refused.status).toBe(409);
        expect(refused.body.error).toMatch(/assigned to content/);

        // boundary: in use, but the same type (or no type) is still a normal edit
        const same = await authed(adminToken).put(`/api/taxonomy/updateTag/${tag.id}`)
            .send({ tag_type: 'test', description: 'Still a test tag' });
        expect(same.status).toBe(200);
        expect(same.body.description).toBe('Still a test tag');

        await pool.query(`DELETE FROM content_tags WHERE content_id = $1 AND tag_id = $2`, [contentId, tag.id]);
    });

    it('updates level rules and applies new pass mark immediately (Table IV Test 14)', async () => {
        // Non-admin receives 403
        const refused = await authed(authorToken).put('/api/taxonomy/updateLevel/3')
            .send({ pass_mark: 75 });
        expect(refused.status).toBe(403);

        // Validation rejects out-of-range pass_mark
        const invalidPass = await authed(adminToken).put('/api/taxonomy/updateLevel/3')
            .send({ pass_mark: 40 });
        expect(invalidPass.status).toBe(400);

        // Validation rejects invalid level number
        const invalidLevel = await authed(adminToken).put('/api/taxonomy/updateLevel/9')
            .send({ pass_mark: 75 });
        expect(invalidLevel.status).toBe(400);

        // TABLE IV TEST 14: Change level 3 pass mark from 70% to 75%
        const updated = await authed(adminToken).put('/api/taxonomy/updateLevel/3')
            .send({ pass_mark: 75 });
        expect(updated.status).toBe(200);
        expect(updated.body.level_number).toBe(3);
        expect(updated.body.pass_mark).toBe(75);

        // Verify the new 75% pass mark is immediately reflected on GET /getLevels
        const levelsRes = await authed(authorToken).get('/api/taxonomy/getLevels');
        expect(levelsRes.status).toBe(200);
        const level3 = levelsRes.body.find((l: { level_number: number }) => l.level_number === 3);
        expect(level3).toBeDefined();
        expect(level3.pass_mark).toBe(75);

        // Cleanup: restore level 3 pass mark back to default 70%
        const restored = await authed(adminToken).put('/api/taxonomy/updateLevel/3')
            .send({ pass_mark: 70 });
        expect(restored.status).toBe(200);
        expect(restored.body.pass_mark).toBe(70);
    });

    it('needs a session token like every other route behind the gate', async () => {
        expect((await request(app).get('/api/taxonomy/getTags')).status).toBe(401);
    });
});
