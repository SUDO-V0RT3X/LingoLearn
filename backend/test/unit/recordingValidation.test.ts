// Unit tests for the saved-recording file rules: which browser recordings are
// accepted, and the sweep that removes files no recording row points at.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    RECORDING_ERRORS,
    declaredFormat,
    recordingsDirectory,
    sniffRecordingFormat,
    sweepOrphanRecordings,
    validateRecording,
} from '../../src/routes/api/routes.api/recordingRoutes/functions/recordingFiles.js';

const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
const OGG = Buffer.from('OggS\0\x02 opus');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypiso5')]);

const file = (mimetype: string, buffer: Buffer) => ({ mimetype, buffer, size: buffer.length });

describe('declaredFormat', () => {
    it('nominal: accepts what Chrome, Firefox and Safari record, codecs and case aside', () => {
        expect(declaredFormat('audio/webm;codecs=opus')).toBe('audio/webm');
        expect(declaredFormat('Audio/WebM')).toBe('audio/webm');
        expect(declaredFormat('audio/ogg; codecs=opus')).toBe('audio/ogg');
        expect(declaredFormat('audio/mp4')).toBe('audio/mp4');
        expect(declaredFormat('audio/x-m4a')).toBe('audio/mp4');
    });

    it('invalid: anything else is not a recording', () => {
        expect(declaredFormat('audio/mpeg')).toBeNull();
        expect(declaredFormat('video/webm')).toBeNull();
        expect(declaredFormat('text/html')).toBeNull();
        expect(declaredFormat('')).toBeNull();
    });
});

describe('sniffRecordingFormat', () => {
    it('recognises each container by its first bytes', () => {
        expect(sniffRecordingFormat(WEBM)).toBe('audio/webm');
        expect(sniffRecordingFormat(OGG)).toBe('audio/ogg');
        expect(sniffRecordingFormat(MP4)).toBe('audio/mp4');
    });

    it('boundary: too short or unknown bytes are no format', () => {
        expect(sniffRecordingFormat(Buffer.from([0x1a, 0x45]))).toBeNull();
        expect(sniffRecordingFormat(Buffer.from('ID3\x03'))).toBeNull();
        expect(sniffRecordingFormat(Buffer.alloc(0))).toBeNull();
    });
});

describe('validateRecording', () => {
    it('nominal: a recording whose type and bytes agree', () => {
        expect(validateRecording(file('audio/webm;codecs=opus', WEBM))).toEqual({ ok: true, format: 'audio/webm' });
        expect(validateRecording(file('audio/mp4', MP4))).toEqual({ ok: true, format: 'audio/mp4' });
    });

    it('invalid: missing or empty, the wrong type, or bytes that disagree with the type', () => {
        expect(validateRecording(undefined)).toEqual({ ok: false, error: RECORDING_ERRORS.missing });
        expect(validateRecording(file('audio/webm', Buffer.alloc(0)))).toEqual({ ok: false, error: RECORDING_ERRORS.missing });
        expect(validateRecording(file('audio/mpeg', WEBM))).toEqual({ ok: false, error: RECORDING_ERRORS.type });
        expect(validateRecording(file('audio/ogg', WEBM))).toEqual({ ok: false, error: RECORDING_ERRORS.content });
        expect(validateRecording(file('audio/webm', Buffer.from('<html>')))).toEqual({ ok: false, error: RECORDING_ERRORS.content });
    });
});

describe('sweepOrphanRecordings', () => {
    const made: string[] = [];
    afterEach(async () => {
        for (const name of made) await fs.promises.rm(path.join(recordingsDirectory(), name), { force: true });
        made.length = 0;
    });

    async function plant(name: string, ageMs: number) {
        const full = path.join(recordingsDirectory(), name);
        await fs.promises.writeFile(full, WEBM);
        const when = new Date(Date.now() - ageMs);
        await fs.promises.utimes(full, when, when);
        made.push(name);
        return full;
    }

    it('removes old files no row points at, and keeps known and fresh ones', async () => {
        const known = await plant('sweep-test-known', 2 * 3600_000);
        const orphan = await plant('sweep-test-orphan', 2 * 3600_000);
        const fresh = await plant('sweep-test-fresh', 1000);

        // Other files in the folder (other tests, other learners) are counted as known.
        const others = (await fs.promises.readdir(recordingsDirectory())).filter((name) => !name.startsWith('sweep-test-'));
        const removed = await sweepOrphanRecordings(new Set(['sweep-test-known', ...others]));

        expect(removed).toBe(1);
        expect(fs.existsSync(known)).toBe(true);
        expect(fs.existsSync(orphan)).toBe(false);
        expect(fs.existsSync(fresh)).toBe(true);
    });
});
