import { describe, it, expect } from 'vitest'
import {
    validateUploadedAudio,
    ALLOWED_MIME_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_SIZE_BYTES,
} from '../../src/routes/api/routes.api/mediaRoutes/functions/validateAudio.js'

function makeMockMulterFile(
    originalname: string,
    mimetype: string,
    size: number = 100_000
): Express.Multer.File {
    return {
        fieldname: 'file',
        originalname,
        encoding: '7bit',
        mimetype,
        size,
        destination: '',
        filename: originalname,
        path: '',
        buffer: Buffer.alloc(Math.min(size, 1024)),
        stream: null as any,
    }
}

describe('validateUploadedAudio (backend)', () => {
    it('nominal: accepts a valid MP3 under 5 MB', () => {
        const file = makeMockMulterFile('lesson_audio.mp3', 'audio/mpeg', 1_000_000)
        expect(validateUploadedAudio(file)).toBeNull()
    })

    it('nominal: accepts a valid WAV file', () => {
        const file = makeMockMulterFile('sample.wav', 'audio/wav', 2_000_000)
        expect(validateUploadedAudio(file)).toBeNull()
    })

    it('nominal: accepts alternate audio/x-wav MIME type', () => {
        const file = makeMockMulterFile('clip.wav', 'audio/x-wav', 500_000)
        expect(validateUploadedAudio(file)).toBeNull()
    })

    it('invalid input: rejects an executable file pretending to be audio', () => {
        const file = makeMockMulterFile('malware.exe', 'application/octet-stream', 500_000)
        const result = validateUploadedAudio(file)
        expect(result).not.toBeNull()
        expect(result).toContain('Unsupported file type')
    })

    it('invalid input: rejects file with forbidden double extension (e.g. .mp3.php)', () => {
        const file = makeMockMulterFile('audio.mp3.php', 'audio/mpeg', 100_000)
        const result = validateUploadedAudio(file)
        expect(result).not.toBeNull()
        expect(result).toContain('does not end with an allowed extension')
    })

    it('boundary: accepts file exactly at 5 MB limit', () => {
        const file = makeMockMulterFile('max_clip.mp3', 'audio/mpeg', MAX_SIZE_BYTES)
        expect(validateUploadedAudio(file)).toBeNull()
    })

    it('boundary: rejects file 1 byte over 5 MB limit', () => {
        const file = makeMockMulterFile('overflow.mp3', 'audio/mpeg', MAX_SIZE_BYTES + 1)
        const result = validateUploadedAudio(file)
        expect(result).not.toBeNull()
        expect(result).toContain('maximum allowed size is 5 MB')
    })

    it('constants: ensures limits match specifications', () => {
        expect(MAX_SIZE_BYTES).toBe(5 * 1024 * 1024)
        expect(ALLOWED_MIME_TYPES).toContain('audio/mpeg')
        expect(ALLOWED_MIME_TYPES).toContain('audio/wav')
        expect(ALLOWED_EXTENSIONS).toContain('.mp3')
        expect(ALLOWED_EXTENSIONS).toContain('.wav')
    })
})
