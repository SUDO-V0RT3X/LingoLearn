// The backend validates every upload, client-side also must validate before sending to back... Both sides use the same rules!
// Rules:
// File must be present (not null/undefined).
// MIME type must be one of the allowed audio types.
// No double extensions (e.g. "test.php.mp3").
//File size must not exceed 5 MB.
// Duration must not exceed 60 seconds — checked via the Web Audio API.
//
// Use with: const error = await validateAudio(file)   // null = OK, string = error msg

import type { AudioValidationResult } from '../models/AssetType'
import { mediaT } from './localizeMediaMessage'

// Messages are built when a check fails, so they follow the interface language.
const t = mediaT
const EXTENSIONS_TEXT = '.mp3, .wav, .ogg, .webm'

// implemented in the validaiton: 

export const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024  // 5 MB

export const MAX_AUDIO_DURATION_SECONDS = 60

export const ALLOWED_AUDIO_MIME_TYPES: readonly string[] = [
  'audio/mpeg',    // .mp3
  'audio/wav',     // .wav
  'audio/ogg',     // .ogg
  'audio/webm',    // .webm audio
  'audio/x-wav',   // alternate WAV MIME some browsers report
  'audio/mp4',     // .m4a
  'audio/x-m4a',   // .m4a
  'audio/m4a',     // .m4a
]

export const ALLOWED_AUDIO_EXTENSIONS: readonly string[] = [
  '.mp3', '.wav', '.ogg', '.webm', '.m4a',
]

//helper 
function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return ''
  return filename.slice(dot).toLowerCase()
}

async function getAudioDuration(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
  
    if (typeof AudioContext === 'undefined') return null
    const ctx = new AudioContext()
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    await ctx.close()
    return buffer.duration
  } catch {
    return null
  }
}

//main func
export async function validateAudio(file: File): Promise<AudioValidationResult> {
  // 1: file must exist
  if (!file || file.size <= 0) return t('media.files.noAudio')

  // 2: MIME type
  if (!ALLOWED_AUDIO_MIME_TYPES.includes(file.type)) {
    return t('media.files.audioFormat', { type: file.type })
  }

  // 3: extension check (double-extension guard)
  const ext = getExtension(file.name)
  if (!ALLOWED_AUDIO_EXTENSIONS.includes(ext)) {
    return t('media.files.extension', { name: file.name, extensions: EXTENSIONS_TEXT })
  }

  // 4: file size 
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return t('media.files.size', { size: sizeMb })
  }

  //5: duration 
  const duration = await getAudioDuration(file)
  if (duration !== null && duration > MAX_AUDIO_DURATION_SECONDS) {
    const secs = Math.round(duration)
    return t('media.files.duration', { secs })
  }

  // All checks passed.
  return null
}

export function validateAudioSync(file: File): AudioValidationResult {
  if (!file || file.size <= 0) return t('media.files.noAudio')
  if (!ALLOWED_AUDIO_MIME_TYPES.includes(file.type)) {
    return t('media.files.audioFormat', { type: file.type })
  }
  const ext = getExtension(file.name)
  if (!ALLOWED_AUDIO_EXTENSIONS.includes(ext)) {
    return t('media.files.extension', { name: file.name, extensions: EXTENSIONS_TEXT })
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return t('media.files.size', { size: sizeMb })
  }
  return null
}

