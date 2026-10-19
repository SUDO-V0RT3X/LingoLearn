// A learner's saved read-aloud recordings on disk: which files are accepted, and
// where they are kept. They live in uploads/recordings/, beside the authors'
// audio but never served at /uploads (app.ts refuses that folder, and the files
// have no media extension either): a recording is the learner's own voice, so
// only GET /api/recordings/:contentId hands it back, and only to its owner.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { UPLOADS_ROOT } from '../../mediaRoutes/functions/mediaStorage.js';

/** The folder under uploads that holds recordings; app.ts never serves it. */
export const RECORDINGS_FOLDER = 'recordings';

/** The most a recording may weigh: minutes of speech in any browser's format. */
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;

/** The formats a browser's MediaRecorder produces: WebM (Chrome, Edge, Firefox), Ogg (older Firefox), MP4 (Safari). */
export type RecordingFormat = 'audio/webm' | 'audio/ogg' | 'audio/mp4';

/**
 * Every declared type accepted, by the format it names. A browser adds codecs
 * ("audio/webm;codecs=opus"), which are dropped before the lookup; Safari's MP4
 * audio also travels as m4a.
 */
const DECLARED_FORMAT: Record<string, RecordingFormat> = {
    'audio/webm': 'audio/webm',
    'audio/ogg': 'audio/ogg',
    'audio/mp4': 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/x-m4a': 'audio/mp4',
};

export const RECORDING_ERRORS = {
    missing: 'No recording received.',
    type: 'A recording must be WebM, Ogg or MP4 audio.',
    content: 'The recording is not the audio type it claims to be.',
} as const;

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
    return buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** The format the file's first bytes show, or null when they match none. */
export function sniffRecordingFormat(buffer: Buffer): RecordingFormat | null {
    if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm';  // EBML header
    if (startsWith(buffer, ascii('OggS'))) return 'audio/ogg';
    if (startsWith(buffer, ascii('ftyp'), 4)) return 'audio/mp4';           // ISO base media box
    return null;
}

/** The format a declared type names (codecs dropped), or null when it is not accepted. */
export function declaredFormat(mimetype: string): RecordingFormat | null {
    const bare = mimetype.split(';')[0].trim().toLowerCase();
    return DECLARED_FORMAT[bare] ?? null;
}

export type RecordingCheck = { ok: true; format: RecordingFormat } | { ok: false; error: string };

/**
 * Checks one uploaded recording: it must be there, be one of the recorder's
 * types, and its first bytes must agree with that type. Size is multer's check.
 */
export function validateRecording(file: Pick<Express.Multer.File, 'mimetype' | 'size' | 'buffer'> | undefined): RecordingCheck {
    if (!file || file.size === 0) return { ok: false, error: RECORDING_ERRORS.missing };

    const declared = declaredFormat(file.mimetype);
    if (!declared) return { ok: false, error: RECORDING_ERRORS.type };

    if (sniffRecordingFormat(file.buffer) !== declared) return { ok: false, error: RECORDING_ERRORS.content };

    return { ok: true, format: declared };
}

/** uploads/recordings, created when first needed. */
export function recordingsDirectory(): string {
    const directory = path.join(UPLOADS_ROOT, RECORDINGS_FOLDER);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
}

/** Where a stored recording is. The name is always one this file generated. */
export function recordingPath(fileName: string): string {
    return path.join(recordingsDirectory(), path.basename(fileName));
}

/** Writes one checked recording under a generated name, with no extension, and returns that name. */
export async function writeRecording(buffer: Buffer): Promise<string> {
    const fileName = randomUUID();
    await fs.promises.writeFile(recordingPath(fileName), buffer);
    return fileName;
}

/** Removes a stored recording; one already gone is not an error. */
export async function removeRecording(fileName: string): Promise<void> {
    await fs.promises.rm(recordingPath(fileName), { force: true });
}

/**
 * Removes recordings no row points at any more: a learner's account or the
 * content was deleted (the row cascades, the file does not), or the server
 * stopped between writing a file and saving its row. Files younger than
 * minAgeMs are left alone, since an upload in flight writes the file first.
 * Returns how many were removed.
 */
export async function sweepOrphanRecordings(knownFileNames: Set<string>, minAgeMs = 60 * 60 * 1000, now = Date.now()): Promise<number> {
    const directory = recordingsDirectory();
    let removed = 0;
    for (const name of await fs.promises.readdir(directory)) {
        if (knownFileNames.has(name)) continue;
        const stat = await fs.promises.stat(path.join(directory, name)).catch(() => null);
        if (!stat?.isFile() || now - stat.mtimeMs < minAgeMs) continue;
        await fs.promises.rm(path.join(directory, name), { force: true });
        removed += 1;
    }
    return removed;
}
