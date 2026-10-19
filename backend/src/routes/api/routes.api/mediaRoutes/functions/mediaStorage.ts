// Where uploaded audio and images are written, and how they are named.
// Files are stored under backend/uploads/<kind>/ and served read-only at
// /uploads/<kind>/<file>. Names are generated, never taken from the upload: an
// attacker-chosen name could escape the folder or overwrite another file.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The folder app.ts serves at /uploads. */
export const UPLOADS_ROOT = path.resolve(here, '../../../../../../uploads');

export type MediaKind = 'audio' | 'images';

export function mediaDirectory(kind: MediaKind = 'audio'): string {
    const directory = path.join(UPLOADS_ROOT, kind);
    fs.mkdirSync(directory, { recursive: true });
    return directory;
}

/** Lowercase extension with its dot, e.g. ".mp3". Empty when there is none. */
export function extensionOf(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export interface AudioMetadata {
    title?: string;
    transcript?: string;
}

export interface AudioUpload {
    filename: string;
    fileUrl: string;
    sizeBytes: number;
    uploadedAt: string;
    title: string;
    transcript: string;
}

/**
 * Writes one uploaded clip under a generated name and returns the relative
 * URL to store in a content block. It is relative on purpose: an absolute URL
 * built from the request's Host header would be wrong for every other reader.
 * Title, transcript and the uploader's id go in a sidecar .meta.json file,
 * which app.ts never serves.
 */
export async function storeUpload(
    originalName: string,
    buffer: Buffer,
    meta: AudioMetadata,
    uploaderId: number,
): Promise<{ filename: string; fileUrl: string; title: string; transcript: string }> {
    const filename = `${randomUUID()}${extensionOf(originalName)}`;
    const directory = mediaDirectory('audio');
    await fs.promises.writeFile(path.join(directory, filename), buffer);

    const title = meta.title ?? '';
    const transcript = meta.transcript ?? '';

    await fs.promises.writeFile(path.join(directory, `${filename}.meta.json`), JSON.stringify({
        filename,
        originalName,
        title,
        transcript,
        uploaderId,
        uploadedAt: new Date().toISOString(),
    }, null, 2));

    return { filename, fileUrl: `/uploads/audio/${filename}`, title, transcript };
}

/**
 * Lists uploaded clips, newest first. With an uploader id, only that user's
 * clips; with null (an administrator), every clip. A clip whose sidecar is
 * missing or unreadable has no known uploader, so only administrators see it.
 */
export async function listUploads(uploaderId: number | null): Promise<AudioUpload[]> {
    const directory = mediaDirectory('audio');
    const names = (await fs.promises.readdir(directory))
        .filter((name) => !name.startsWith('.') && !name.endsWith('.meta.json'));

    const files = await Promise.all(names.map(async (filename) => {
        const stat = await fs.promises.stat(path.join(directory, filename)).catch(() => null);
        let meta: Record<string, unknown> = {};
        try {
            meta = JSON.parse(await fs.promises.readFile(path.join(directory, `${filename}.meta.json`), 'utf-8'));
        } catch {
            // No sidecar, or not JSON: no title, transcript or known uploader.
        }

        return {
            owner: Number.isInteger(meta.uploaderId) ? (meta.uploaderId as number) : null,
            file: {
                filename,
                fileUrl: `/uploads/audio/${filename}`,
                sizeBytes: stat?.size ?? 0,
                uploadedAt: (stat?.mtime ?? new Date(0)).toISOString(),
                title: String(meta.title ?? ''),
                transcript: String(meta.transcript ?? ''),
            },
        };
    }));

    return files
        .filter(({ owner }) => uploaderId === null || owner === uploaderId)
        .map(({ file }) => file)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Writes one checked image under a generated name; returns its relative URL. */
export async function storeImage(buffer: Buffer, extension: string): Promise<{ filename: string; fileUrl: string }> {
    const filename = `${randomUUID()}${extension}`;
    await fs.promises.writeFile(path.join(mediaDirectory('images'), filename), buffer);
    return { filename, fileUrl: `/uploads/images/${filename}` };
}
