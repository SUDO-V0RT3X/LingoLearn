import { describe, it, expect } from 'vitest'
import {
  validateAudio,
  validateAudioSync,
  MAX_AUDIO_SIZE_BYTES,
  MAX_AUDIO_DURATION_SECONDS,
  ALLOWED_AUDIO_MIME_TYPES,
  ALLOWED_AUDIO_EXTENSIONS,
} from '../validateAudio'

function makeFile(
  name: string,
  type: string,
  sizeBytes: number = 100_000,
): File {
  const content = new Uint8Array(sizeBytes)
  return new File([content], name, { type })
}


describe('validateAudio', () => {


  it('nominal: accepts a valid MP3 under 5 MB', async () => {
    const file = makeFile('clip.mp3', 'audio/mpeg', 1_000_000)
    expect(await validateAudio(file)).toBeNull()
  })

  it('nominal: accepts a valid WAV under 5 MB', async () => {
    const file = makeFile('clip.wav', 'audio/wav', 2_000_000)
    expect(await validateAudio(file)).toBeNull()
  })

  it('nominal: accepts a valid OGG under 5 MB', async () => {
    const file = makeFile('clip.ogg', 'audio/ogg', 500_000)
    expect(await validateAudio(file)).toBeNull()
  })

  it('nominal: accepts x-wav MIME type (alternate WAV MIME)', async () => {
    const file = makeFile('clip.wav', 'audio/x-wav', 500_000)
    expect(await validateAudio(file)).toBeNull()
  })


  it('invalid input: rejects a PDF pretending to be audio', async () => {
    const file = makeFile('clip.pdf', 'application/pdf', 100_000)
    const result = await validateAudio(file)
    expect(result).not.toBeNull()
    expect(result).toContain('Unsupported format')
  })

  it('invalid input: rejects an mp4 file (only audio formats like mp3/wav/ogg/webm allowed)', async () => {
    const file = makeFile('clip.mp4', 'video/mp4', 100_000)
    const result = await validateAudio(file)
    expect(result).not.toBeNull()
    expect(result).toContain('Unsupported format')
  })

  it('invalid input: rejects an empty MIME type string', async () => {
    const file = makeFile('clip.mp3', '', 100_000)
    const result = await validateAudio(file)
    expect(result).not.toBeNull()
  })


  it('invalid input: rejects a double-extension filename (evil.php.mp3 would fail ext check — note: ext is .mp3 so passes; evil.mp3.php fails)', async () => {

    const file = makeFile('evil.mp3.php', 'audio/mpeg', 100_000)
    const result = await validateAudio(file)
    expect(result).not.toBeNull()
    expect(result).toContain('allowed extension')
  })

  it('invalid input: rejects a file with no extension', async () => {
    const file = makeFile('audiofile', 'audio/mpeg', 100_000)
    const result = await validateAudio(file)
    expect(result).not.toBeNull()
  })


  it('boundary: exactly 5 MB is accepted', async () => {
    const file = makeFile('clip.mp3', 'audio/mpeg', MAX_AUDIO_SIZE_BYTES)
    expect(await validateAudio(file)).toBeNull()
  })

  it('boundary: 1 byte over 5 MB is rejected', async () => {
    const file = makeFile('clip.mp3', 'audio/mpeg', MAX_AUDIO_SIZE_BYTES + 1)
    const result = await validateAudio(file)
    expect(result).not.toBeNull()
    expect(result).toContain('MB')
  })

})


describe('validateAudioSync', () => {

  it('nominal: returns null for a valid MP3', () => {
    const file = makeFile('track.mp3', 'audio/mpeg', 1_000_000)
    expect(validateAudioSync(file)).toBeNull()
  })

  it('invalid input: rejects wrong MIME type', () => {
    const file = makeFile('img.jpg', 'image/jpeg', 100_000)
    expect(validateAudioSync(file)).not.toBeNull()
  })

  it('boundary: exactly 5 MB passes', () => {
    const file = makeFile('clip.mp3', 'audio/mpeg', MAX_AUDIO_SIZE_BYTES)
    expect(validateAudioSync(file)).toBeNull()
  })

  it('boundary: 1 byte over 5 MB fails', () => {
    const file = makeFile('clip.mp3', 'audio/mpeg', MAX_AUDIO_SIZE_BYTES + 1)
    expect(validateAudioSync(file)).not.toBeNull()
  })

})


describe('exported constants', () => {
  it('MAX_AUDIO_SIZE_BYTES is 5 MB', () => {
    expect(MAX_AUDIO_SIZE_BYTES).toBe(5 * 1024 * 1024)
  })

  it('MAX_AUDIO_DURATION_SECONDS is 60', () => {
    expect(MAX_AUDIO_DURATION_SECONDS).toBe(60)
  })

  it('ALLOWED_AUDIO_MIME_TYPES includes mp3 and wav', () => {
    expect(ALLOWED_AUDIO_MIME_TYPES).toContain('audio/mpeg')
    expect(ALLOWED_AUDIO_MIME_TYPES).toContain('audio/wav')
  })

  it('ALLOWED_AUDIO_EXTENSIONS includes .mp3 and .wav', () => {
    expect(ALLOWED_AUDIO_EXTENSIONS).toContain('.mp3')
    expect(ALLOWED_AUDIO_EXTENSIONS).toContain('.wav')
  })
})

