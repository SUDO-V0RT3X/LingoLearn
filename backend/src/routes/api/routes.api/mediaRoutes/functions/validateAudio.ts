// Server-side audio file validation for the upload endpoint.
// Mirrors the frontend validation rules so we reject invalid files before saving to disk.

// Allowed audio MIME types
export const ALLOWED_MIME_TYPES: readonly string[] = [
    'audio/mpeg',   // .mp3
    'audio/wav',    // .wav
    'audio/ogg',    // .ogg
    'audio/webm',   // .webm
    'audio/x-wav',  // alternate wav mime
    'audio/mp4',    // .m4a
    'audio/x-m4a',  // .m4a
    'audio/m4a',    // .m4a
]

// Allowed file extensions
export const ALLOWED_EXTENSIONS: readonly string[] = [
    '.mp3', '.wav', '.ogg', '.webm', '.m4a',
]

// 5 MB max size
export const MAX_SIZE_BYTES = 5 * 1024 * 1024

// Returns lowercase extension with leading dot, e.g. ".mp3"
function getExtension(filename: string): string {
    const dot = filename.lastIndexOf('.')
    return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

// Validates the uploaded multer file object.
// Returns null if valid, or an error string if invalid.
export function validateUploadedAudio(file: Express.Multer.File): string | null {
    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return `Unsupported file type "${file.mimetype}". Allowed: MP3, WAV, OGG, WebM.`
    }

    // Check file extension to guard against double extensions (e.g. evil.mp3.php)
    const ext = getExtension(file.originalname)
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return `Filename "${file.originalname}" does not end with an allowed extension (.mp3, .wav, .ogg, .webm).`
    }

    // Check file size
    if (file.size <= 0) {
        return 'File cannot be empty.'
    }
    if (file.size > MAX_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
        return `File is ${sizeMb} MB. The maximum allowed size is 5 MB.`
    }

    return null
}
