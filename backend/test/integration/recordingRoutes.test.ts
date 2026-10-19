// RECORDINGS integration tests — a learner's saved read-aloud recording over the
// real Express app, database and uploads/recordings folder. Every row and file a
// test creates is deleted afterwards.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import { recordingPath, recordingsDirectory } from '../../src/routes/api/routes.api/recordingRoutes/functions/recordingFiles.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';
import { deleteTestContent, insertContent, learnerAt } from '../helpers/learnerContent.js';

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';
const app = createApp();

//What each browser's recorder writes first, padded so the file is not empty.
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm voice one')]);
const WEBM_TWO = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm voice two, longer')]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4A safari voice')]);

let authorId = 0;
const learnerIds: number[] = [];

beforeAll(async () => {
    authorId = (await accountWithToken('author')).user.id;
});

afterAll(async () => {
    // Rows go with the content and accounts; their files are removed here.
    const { rows } = await pool.query<{ file_name: string }>(
        `SELECT file_name FROM learner_recordings WHERE learner_id = ANY($1::int[])`, [learnerIds]);
    for (const row of rows) await fs.promises.rm(recordingPath(row.file_name), { force: true });
    await deleteTestContent();
    await deleteTestAccounts();
});

async function learner(level = 1, kind: 'adult' | 'child' = 'adult') {
    const account = await learnerAt(level, kind);
    learnerIds.push(account.user.id);
    return account;
}

const put = (token: string, contentId: number | string, body: Buffer, type: string, filename = 'recording.webm') =>
    request(app).put(`/api/recordings/${contentId}`).set('Authorization', `Bearer ${token}`)
        .attach('file', body, { filename, contentType: type });
const get = (token: string, contentId: number | string) =>
    request(app).get(`/api/recordings/${contentId}`).set('Authorization', `Bearer ${token}`)
        .buffer(true).parse((res, done) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => done(null, Buffer.concat(chunks)));
        });
const del = (token: string, contentId: number | string) =>
    request(app).delete(`/api/recordings/${contentId}`).set('Authorization', `Bearer ${token}`);

/** The file name the database holds for a learner's recording, or null. */
async function storedFile(learnerId: number, contentId: number): Promise<string | null> {
    const { rows } = await pool.query<{ file_name: string }>(
        `SELECT file_name FROM learner_recordings WHERE learner_id = $1 AND content_id = $2`, [learnerId, contentId]);
    return rows[0]?.file_name ?? null;
}

describe('saved recordings', () => {
    it('nominal: none at first, then saved, fetched back as the same audio, and still there next time', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();

        expect((await get(me.token, contentId)).status).toBe(404);

        const saved = await put(me.token, contentId, WEBM, 'audio/webm;codecs=opus');
        expect(saved.status).toBe(200);
        expect(saved.body).toEqual({ contentId, mimeType: 'audio/webm', sizeBytes: WEBM.length, updatedAt: expect.any(String) });

        const fetched = await get(me.token, contentId);
        expect(fetched.status).toBe(200);
        expect(fetched.headers['content-type']).toContain('audio/webm');
        expect(fetched.headers['cache-control']).toContain('no-store');
        expect(Buffer.compare(fetched.body as Buffer, WEBM)).toBe(0);
    });

    it('recording again replaces the old one, and its file is removed', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();

        await put(me.token, contentId, WEBM, 'audio/webm');
        const first = (await storedFile(me.user.id, contentId))!;
        expect(fs.existsSync(recordingPath(first))).toBe(true);

        const replaced = await put(me.token, contentId, MP4, 'audio/mp4', 'recording.m4a');
        expect(replaced.status).toBe(200);
        expect(replaced.body.mimeType).toBe('audio/mp4');

        const fetched = await get(me.token, contentId);
        expect(fetched.headers['content-type']).toContain('audio/mp4');
        expect(Buffer.compare(fetched.body as Buffer, MP4)).toBe(0);
        expect(fs.existsSync(recordingPath(first))).toBe(false);

        const { rows } = await pool.query(`SELECT 1 FROM learner_recordings WHERE learner_id = $1`, [me.user.id]);
        expect(rows).toHaveLength(1);
    });

    it('delete removes the row and the file; deleting again is 404', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();
        await put(me.token, contentId, WEBM, 'audio/webm');
        const file = (await storedFile(me.user.id, contentId))!;

        expect((await del(me.token, contentId)).status).toBe(204);
        expect(await storedFile(me.user.id, contentId)).toBeNull();
        expect(fs.existsSync(recordingPath(file))).toBe(false);
        expect((await get(me.token, contentId)).status).toBe(404);
        expect((await del(me.token, contentId)).status).toBe(404);
    });

    it('keeps each learner\'s recording separate: another learner never gets mine, and cannot delete it', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();
        const other = await learner();
        await put(me.token, contentId, WEBM, 'audio/webm');

        expect((await get(other.token, contentId)).status).toBe(404);
        expect((await del(other.token, contentId)).status).toBe(404);

        await put(other.token, contentId, WEBM_TWO, 'audio/webm');
        expect(Buffer.compare((await get(me.token, contentId)).body as Buffer, WEBM)).toBe(0);
        expect(Buffer.compare((await get(other.token, contentId)).body as Buffer, WEBM_TWO)).toBe(0);
    });

    it('keeps one recording per content, not one per learner', async () => {
        const first = await insertContent(authorId);
        const second = await insertContent(authorId);
        const me = await learner();

        await put(me.token, first, WEBM, 'audio/webm');
        expect((await get(me.token, second)).status).toBe(404);
        await put(me.token, second, WEBM_TWO, 'audio/webm');
        expect(Buffer.compare((await get(me.token, first)).body as Buffer, WEBM)).toBe(0);
    });

    it('the file is never served at /uploads, however the path is spelled', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();
        await put(me.token, contentId, WEBM, 'audio/webm');
        const file = (await storedFile(me.user.id, contentId))!;

        expect((await request(app).get(`/uploads/recordings/${file}`)).status).toBe(404);
        expect((await request(app).get(`/uploads/recordings/${file}.webm`)).status).toBe(404);
        expect((await request(app).get(`/uploads/audio/../recordings/${file}`)).status).toBe(404);
        expect((await request(app).get(`/uploads/audio/..%2Frecordings%2F${file}`)).status).toBe(404);
        expect((await request(app).get(`/uploads/RECORDINGS/${file}`)).status).toBe(404);
        // Even a file with a media extension in that folder is refused.
        const planted = `${recordingsDirectory()}/planted.webm`;
        await fs.promises.writeFile(planted, WEBM);
        try {
            expect((await request(app).get('/uploads/recordings/planted.webm')).status).toBe(404);
        } finally {
            await fs.promises.rm(planted, { force: true });
        }
    });

    it('invalid input: no file, a type that is not a recording, or bytes that do not match the type are 400', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();

        const none = await request(app).put(`/api/recordings/${contentId}`).set('Authorization', `Bearer ${me.token}`);
        expect(none.status).toBe(400);

        const mp3 = await put(me.token, contentId, Buffer.from('ID3 fake mp3'), 'audio/mpeg', 'a.mp3');
        expect(mp3.status).toBe(400);
        expect(mp3.body.error).toBe('A recording must be WebM, Ogg or MP4 audio.');

        const html = await put(me.token, contentId, Buffer.from('<script>alert(1)</script>'), 'audio/webm');
        expect(html.status).toBe(400);
        expect(html.body.error).toBe('The recording is not the audio type it claims to be.');

        expect((await put(me.token, contentId, Buffer.alloc(0), 'audio/webm')).status).toBe(400);
        expect((await put(me.token, 'nope', WEBM, 'audio/webm')).status).toBe(400);
        expect((await get(me.token, 0)).status).toBe(400);
        expect((await get(me.token, 99999999999)).status).toBe(400);
        expect(await storedFile(me.user.id, contentId)).toBeNull();
    });

    it('boundary: a recording over 5 MB is 413 and nothing is kept', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();
        const huge = Buffer.concat([WEBM, Buffer.alloc(5 * 1024 * 1024)]);

        const res = await put(me.token, contentId, huge, 'audio/webm');
        expect(res.status).toBe(413);
        expect(await storedFile(me.user.id, contentId)).toBeNull();
    });

    it('permission: signed out is 401, and staff and guardians are 403', async () => {
        const contentId = await insertContent(authorId);
        expect((await request(app).get(`/api/recordings/${contentId}`)).status).toBe(401);
        expect((await request(app).put(`/api/recordings/${contentId}`)).status).toBe(401);
        expect((await request(app).delete(`/api/recordings/${contentId}`)).status).toBe(401);

        const author = await accountWithToken('author');
        const guardian = await accountWithToken('guardian');
        expect((await put(author.token, contentId, WEBM, 'audio/webm')).status).toBe(403);
        expect((await get(guardian.token, contentId)).status).toBe(403);
    });

    it('permission: only content the learner may open — locked, adult-only for a child, draft and unknown are refused', async () => {
        const aboveLevel = await insertContent(authorId, { level: 4 });
        const adultOnly = await insertContent(authorId, { childFriendly: false });
        const draft = await insertContent(authorId, { status: 'draft' });
        const me = await learner(2);
        const child = await learner(2, 'child');

        expect((await put(me.token, aboveLevel, WEBM, 'audio/webm')).status).toBe(403);
        expect((await get(me.token, aboveLevel)).status).toBe(403);
        expect((await put(child.token, adultOnly, WEBM, 'audio/webm')).status).toBe(403);
        expect((await put(me.token, draft, WEBM, 'audio/webm')).status).toBe(404);
        expect((await get(me.token, 2147483647)).status).toBe(404);

        // A child may save one on child-friendly content.
        const forChildren = await insertContent(authorId);
        expect((await put(child.token, forChildren, WEBM, 'audio/webm')).status).toBe(200);
    });

    it('a learner can still delete their recording after the content is taken down', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();
        await put(me.token, contentId, WEBM, 'audio/webm');
        await pool.query(`UPDATE content SET status = 'draft' WHERE id = $1`, [contentId]);

        expect((await get(me.token, contentId)).status).toBe(404);
        expect((await del(me.token, contentId)).status).toBe(204);
    });

    it('cascade: deleting the content deletes the recording row', async () => {
        const contentId = await insertContent(authorId);
        const me = await learner();
        await put(me.token, contentId, WEBM, 'audio/webm');
        const file = (await storedFile(me.user.id, contentId))!;

        await pool.query(`DELETE FROM content WHERE id = $1`, [contentId]);
        expect(await storedFile(me.user.id, contentId)).toBeNull();
        await fs.promises.rm(recordingPath(file), { force: true });
    });
});
