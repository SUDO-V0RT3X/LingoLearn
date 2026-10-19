// The browser-side check on an image before it is uploaded for an Image block.
// The same rules as the server's (backend mediaRoutes/functions/validateImage.ts),
// which also reads the file's first bytes; this one keeps an unusable file
// from being sent at all.
//
// Use with: const problem = validateImage(file)   // null = OK, string = error message

import { mediaT } from './localizeMediaMessage'

// Messages are built when a check fails, so they follow the interface language.
const t = mediaT

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

export const ALLOWED_IMAGE_EXTENSIONS: readonly string[] = [
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
]

/** What the file picker offers, so the author only sees usable files. */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(',')

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

export function validateImage(file: File | null | undefined): string | null {
  if (!file || file.size <= 0) return t('media.files.noImage')

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return t('media.files.imageFormat', { type: file.type || t('media.files.unknownType') })
  }

  if (!ALLOWED_IMAGE_EXTENSIONS.includes(getExtension(file.name))) {
    return t('media.files.extension', { name: file.name, extensions: '.png, .jpg, .jpeg, .webp, .gif' })
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return t('media.files.size', { size: (file.size / (1024 * 1024)).toFixed(1) })
  }

  return null
}
