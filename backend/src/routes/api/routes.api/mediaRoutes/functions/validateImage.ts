// Server-side image validation for the upload endpoint. An image is accepted
// only when its declared type, its file extension and its first bytes all name
// the same format, so a renamed script or page can never be stored as a picture.

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The declared types accepted, and the format each one names. */
export const IMAGE_MIME_TYPES: Readonly<Record<string, ImageFormat>> = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/webp': 'webp',
    'image/gif': 'gif',
};

/** The extensions accepted, and the format each one names. */
export const IMAGE_EXTENSIONS: Readonly<Record<string, ImageFormat>> = {
    '.png': 'png',
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.webp': 'webp',
    '.gif': 'gif',
};

/** The extension a stored image of each format gets. */
export const STORED_EXTENSION: Readonly<Record<ImageFormat, string>> = {
    png: '.png',
    jpeg: '.jpg',
    webp: '.webp',
    gif: '.gif',
};

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
    return buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** The format the file's first bytes show, or null when they match none. */
export function sniffImageFormat(buffer: Buffer): ImageFormat | null {
    if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
    if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
    if (startsWith(buffer, ascii('GIF87a')) || startsWith(buffer, ascii('GIF89a'))) return 'gif';
    if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8)) return 'webp';
    return null;
}

function extensionOf(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export type ImageCheck = { ok: true; format: ImageFormat } | { ok: false; error: string };

/** Checks one multer file: type, extension, size and content must agree. */
export function validateUploadedImage(file: Pick<Express.Multer.File, 'originalname' | 'mimetype' | 'size' | 'buffer'>): ImageCheck {
    const declared = IMAGE_MIME_TYPES[file.mimetype];
    if (!declared) {
        return { ok: false, error: `Unsupported file type "${file.mimetype}". Allowed: PNG, JPEG, WebP, GIF.` };
    }

    const named = IMAGE_EXTENSIONS[extensionOf(file.originalname)];
    if (!named) {
        return { ok: false, error: `Filename "${file.originalname}" does not end with an allowed extension (.png, .jpg, .jpeg, .webp, .gif).` };
    }

    if (file.size <= 0) {
        return { ok: false, error: 'File cannot be empty.' };
    }

    if (file.size > MAX_IMAGE_BYTES) {
        return { ok: false, error: `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The maximum allowed size is 5 MB.` };
    }

    const actual = sniffImageFormat(file.buffer);
    if (!actual || actual !== declared || actual !== named) {
        return { ok: false, error: 'The file content is not the image type its name and type claim.' };
    }

    return { ok: true, format: actual };
}
