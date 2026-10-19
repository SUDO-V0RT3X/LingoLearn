// Unit tests for the image upload checks: declared type, extension, size and
// the file's first bytes must all agree.
import { describe, it, expect } from 'vitest';
import { MAX_IMAGE_BYTES, sniffImageFormat, validateUploadedImage }
    from '../../src/routes/api/routes.api/mediaRoutes/functions/validateImage.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = Buffer.from('GIF89a....');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

const file = (originalname: string, mimetype: string, buffer: Buffer, size = buffer.length) =>
    ({ originalname, mimetype, buffer, size });

describe('sniffImageFormat', () => {
    it('nominal: recognises each allowed format by its first bytes', () => {
        expect(sniffImageFormat(PNG)).toBe('png');
        expect(sniffImageFormat(JPEG)).toBe('jpeg');
        expect(sniffImageFormat(GIF)).toBe('gif');
        expect(sniffImageFormat(WEBP)).toBe('webp');
    });

    it('boundary: a truncated header or a RIFF that is not WebP matches nothing', () => {
        expect(sniffImageFormat(PNG.subarray(0, 7))).toBeNull();
        expect(sniffImageFormat(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull();
        expect(sniffImageFormat(Buffer.alloc(0))).toBeNull();
    });
});

describe('validateUploadedImage', () => {
    it('nominal: accepts each format with a matching type and extension', () => {
        expect(validateUploadedImage(file('a.png', 'image/png', PNG))).toEqual({ ok: true, format: 'png' });
        expect(validateUploadedImage(file('a.jpeg', 'image/jpeg', JPEG))).toEqual({ ok: true, format: 'jpeg' });
        expect(validateUploadedImage(file('A.JPG', 'image/jpeg', JPEG))).toEqual({ ok: true, format: 'jpeg' });
        expect(validateUploadedImage(file('a.gif', 'image/gif', GIF))).toEqual({ ok: true, format: 'gif' });
        expect(validateUploadedImage(file('a.webp', 'image/webp', WEBP))).toEqual({ ok: true, format: 'webp' });
    });

    it('boundary: exactly 5 MB passes, one byte more does not', () => {
        expect(validateUploadedImage(file('a.png', 'image/png', PNG, MAX_IMAGE_BYTES)).ok).toBe(true);
        const over = validateUploadedImage(file('a.png', 'image/png', PNG, MAX_IMAGE_BYTES + 1));
        expect(over.ok).toBe(false);
        expect(!over.ok && over.error).toMatch(/5 MB/);
    });

    it('invalid input: a type that is not an allowed image', () => {
        const svg = validateUploadedImage(file('a.svg', 'image/svg+xml', Buffer.from('<svg/>')));
        expect(!svg.ok && svg.error).toMatch(/Unsupported file type/);
    });

    it('invalid input: a double or missing extension', () => {
        expect(validateUploadedImage(file('a.png.html', 'image/png', PNG)).ok).toBe(false);
        expect(validateUploadedImage(file('png', 'image/png', PNG)).ok).toBe(false);
    });

    it('invalid input: bytes that disagree with the type or the name', () => {
        expect(validateUploadedImage(file('a.png', 'image/png', Buffer.from('<html></html>'))).ok).toBe(false);
        expect(validateUploadedImage(file('a.png', 'image/png', JPEG)).ok).toBe(false);
        expect(validateUploadedImage(file('a.gif', 'image/png', PNG)).ok).toBe(false);
        expect(validateUploadedImage(file('a.png', 'image/gif', PNG)).ok).toBe(false);
    });
});
