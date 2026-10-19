// MEDIA integration tests — the real Express app writing to backend/uploads.
// Uploading is an author action behind the auth gate, so every call signs in.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { mediaDirectory } from '../../src/routes/api/routes.api/mediaRoutes/functions/mediaStorage.js';
import { accountWithToken, deleteTestAccounts } from '../helpers/accounts.js';

const app = createApp();

let authorToken = '';
let otherAuthorToken = '';
let adminToken = '';
let learnerToken = '';
const writtenFiles: string[] = [];

//The first bytes of each format, padded so the file is not empty.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

/** Uploads one clip as the given author and remembers it (and its sidecar) for cleanup. */
async function uploadClip(token: string, title: string) {
    const res = await authed(token).post('/api/media/uploadAudio')
        .field('title', title)
        .attach('file', Buffer.from('FAKE MP3 AUDIO STREAM DATA'), { filename: 'clip.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(201);
    const file = path.join(mediaDirectory('audio'), res.body.filename);
    writtenFiles.push(file, `${file}.meta.json`);
    return res.body as { filename: string; fileUrl: string };
}

const authed = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
});

beforeAll(async () => {
    authorToken = (await accountWithToken('author')).token;
    otherAuthorToken = (await accountWithToken('author')).token;
    adminToken = (await accountWithToken('administrator')).token;
    learnerToken = (await accountWithToken('learner')).token;
});

afterAll(async () => {
    for (const file of writtenFiles) await fs.promises.rm(file, { force: true });
    await deleteTestAccounts();
});

describe('media routes', () => {
    it('accepts an audio upload and returns a relative url under /uploads', async () => {
        const res = await authed(authorToken).post('/api/media/uploadAudio')
            .field('title', 'Test clip')
            .attach('file', Buffer.from('FAKE MP3 AUDIO STREAM DATA'), {
                filename: 'test sample.mp3',
                contentType: 'audio/mpeg',
            });

        expect(res.status).toBe(201);
        expect(res.body.title).toBe('Test clip');
        expect(res.body.fileUrl).toMatch(/^\/uploads\/audio\/[0-9a-f-]{36}\.mp3$/);
        expect(res.body.filename).not.toContain('test sample');
        const stored = path.join(mediaDirectory('audio'), res.body.filename);
        writtenFiles.push(stored, `${stored}.meta.json`);

        const served = await request(app).get(res.body.fileUrl);
        expect(served.status).toBe(200);
        expect(served.headers['content-type']).toContain('audio/mpeg');

        const list = await authed(authorToken).get('/api/media/listAudio');
        expect(list.body.some((file: { filename: string }) => file.filename === res.body.filename)).toBe(true);
    });


    it('rejects a file that is not audio', async () => {
        const res = await authed(authorToken).post('/api/media/uploadAudio')
            .attach('file', Buffer.from('not an audio file'), {
                filename: 'document.pdf',
                contentType: 'application/pdf',
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Unsupported file type');
    });

    it('rejects an upload with no file', async () => {
        const res = await authed(authorToken).post('/api/media/uploadAudio');
        expect(res.status).toBe(400);
    });

    it('answers 413 for a file over the 5 MB limit', async () => {
        const res = await authed(authorToken).post('/api/media/uploadAudio')
            .attach('file', Buffer.alloc(6 * 1024 * 1024, 1), {
                filename: 'huge.mp3',
                contentType: 'audio/mpeg',
            });

        expect(res.status).toBe(413);
    });

    it('lets only authors and administrators upload', async () => {
        const res = await authed(learnerToken).post('/api/media/uploadAudio')
            .attach('file', Buffer.from('FAKE MP3'), { filename: 'clip.mp3', contentType: 'audio/mpeg' });
        expect(res.status).toBe(403);

        expect((await request(app).get('/api/media/listAudio')).status).toBe(401);
    });

    it('has no delete route: approved content may still point at the file', async () => {
        const res = await request(app).delete('/api/media/deleteAudio/anything.mp3')
            .set('Authorization', `Bearer ${authorToken}`);
        expect(res.status).toBe(404);
    });

    it('lists only the caller\'s own clips; an administrator sees every clip', async () => {
        const mine = await uploadClip(authorToken, 'Mine');
        const theirs = await uploadClip(otherAuthorToken, 'Theirs');

        const names = async (token: string) =>
            ((await authed(token).get('/api/media/listAudio')).body as Array<{ filename: string }>).map((f) => f.filename);

        const forAuthor = await names(authorToken);
        expect(forAuthor).toContain(mine.filename);
        expect(forAuthor).not.toContain(theirs.filename);

        const forOther = await names(otherAuthorToken);
        expect(forOther).toEqual([theirs.filename]);

        const forAdmin = await names(adminToken);
        expect(forAdmin).toEqual(expect.arrayContaining([mine.filename, theirs.filename]));
    });

    it('records the uploader in the sidecar, and never serves the sidecar', async () => {
        const clip = await uploadClip(authorToken, 'Sidecar');
        const sidecar = JSON.parse(await fs.promises.readFile(
            path.join(mediaDirectory('audio'), `${clip.filename}.meta.json`), 'utf-8'));
        expect(Number.isInteger(sidecar.uploaderId)).toBe(true);

        expect((await request(app).get(clip.fileUrl)).status).toBe(200);
        expect((await request(app).get(`${clip.fileUrl}.meta.json`)).status).toBe(404);
        // An upper-case or percent-encoded spelling names the same file on disk.
        expect((await request(app).get(`${clip.fileUrl}.META.JSON`)).status).toBe(404);
        expect((await request(app).get(`${clip.fileUrl}.meta%2Ejson`)).status).toBe(404);
        expect((await request(app).get('/uploads/audio/')).status).toBe(404);
    });
});

describe('image uploads', () => {
    it('nominal: stores a PNG under a generated name and serves it back', async () => {
        const res = await authed(authorToken).post('/api/media/uploadImage')
            .attach('file', PNG, { filename: 'my hut.png', contentType: 'image/png' });

        expect(res.status).toBe(201);
        expect(res.body.fileUrl).toMatch(/^\/uploads\/images\/[0-9a-f-]{36}\.png$/);
        writtenFiles.push(path.join(mediaDirectory('images'), path.basename(res.body.fileUrl)));

        const served = await request(app).get(res.body.fileUrl);
        expect(served.status).toBe(200);
        expect(served.headers['content-type']).toContain('image/png');
    });

    it('nominal: a .jpeg is stored as .jpg', async () => {
        const res = await authed(adminToken).post('/api/media/uploadImage')
            .attach('file', JPEG, { filename: 'photo.JPEG', contentType: 'image/jpeg' });
        expect(res.status).toBe(201);
        expect(res.body.fileUrl).toMatch(/\.jpg$/);
        writtenFiles.push(path.join(mediaDirectory('images'), path.basename(res.body.fileUrl)));
    });

    it('invalid input: text dressed up as a PNG is refused', async () => {
        const res = await authed(authorToken).post('/api/media/uploadImage')
            .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/not the image type/);
    });

    it('invalid input: a type that is not an image, or a name that disagrees with the bytes', async () => {
        const svg = await authed(authorToken).post('/api/media/uploadImage')
            .attach('file', Buffer.from('<svg/>'), { filename: 'a.svg', contentType: 'image/svg+xml' });
        expect(svg.status).toBe(400);

        const renamed = await authed(authorToken).post('/api/media/uploadImage')
            .attach('file', PNG, { filename: 'a.gif', contentType: 'image/png' });
        expect(renamed.status).toBe(400);
    });

    it('boundary: no file is 400 and a file over 5 MB is 413', async () => {
        expect((await authed(authorToken).post('/api/media/uploadImage')).status).toBe(400);

        const huge = await authed(authorToken).post('/api/media/uploadImage')
            .attach('file', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), { filename: 'big.png', contentType: 'image/png' });
        expect(huge.status).toBe(413);
    });

    it('lets only authors and administrators upload images', async () => {
        const res = await authed(learnerToken).post('/api/media/uploadImage')
            .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
        expect(res.status).toBe(403);
        expect((await request(app).post('/api/media/uploadImage')).status).toBe(401);
    });
});
