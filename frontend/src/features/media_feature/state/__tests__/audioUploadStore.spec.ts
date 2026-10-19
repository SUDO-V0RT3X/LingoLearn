import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { audioUploadStore } from '../audioUploadStore'
import { MAX_AUDIO_SIZE_BYTES } from '@/features/media_feature/functions/validateAudio'

// Helper: build a fake File of any size and MIME type.
function makeFile(name: string, type: string, size = 100_000): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('audioUploadStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with no file selected and status idle', () => {
    const store = audioUploadStore()
    expect(store.selectedFile).toBeNull()
    expect(store.uploadStatus).toBe('idle')
    expect(store.validationError).toBeNull()
    expect(store.uploadError).toBeNull()
    expect(store.label).toBe('')
    expect(store.transcript).toBe('')
    expect(store.library).toEqual([])
  })

  it('canSubmit is false when no file is selected', () => {
    const store = audioUploadStore()
    expect(store.canSubmit).toBe(false)
  })

  it('canSubmit is true after a valid file is selected', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('clip.mp3', 'audio/mpeg'))
    expect(store.canSubmit).toBe(true)
  })

  it('canSubmit is false when there is a validation error', async () => {
    const store = audioUploadStore()
    // Force a bad file that fails sync validation
    await store.onFileSelected(makeFile('img.jpg', 'image/jpeg'))
    expect(store.canSubmit).toBe(false)
  })

  it('onFileSelected: accepts a valid MP3', async () => {
    const store = audioUploadStore()
    const file = makeFile('clip.mp3', 'audio/mpeg', 1_000_000)
    await store.onFileSelected(file)
    expect(store.selectedFile).toBe(file)
    expect(store.validationError).toBeNull()
  })

  it('onFileSelected: rejects an image file (wrong MIME)', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('photo.jpg', 'image/jpeg'))
    // File is cleared and an error is set
    expect(store.selectedFile).toBeNull()
    expect(store.validationError).not.toBeNull()
    expect(store.validationError).toContain('Unsupported format')
  })

  it('onFileSelected: rejects a file over 5 MB', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('huge.mp3', 'audio/mpeg', MAX_AUDIO_SIZE_BYTES + 1))
    expect(store.selectedFile).toBeNull()
    expect(store.validationError).toContain('MB')
  })

  it('onFileSelected: rejects a bad extension (.php at the end)', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('evil.mp3.php', 'audio/mpeg'))
    expect(store.selectedFile).toBeNull()
    expect(store.validationError).toContain('allowed extension')
  })

  it('onFileSelected: clears previous error when called with null', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('photo.jpg', 'image/jpeg')) // sets error
    await store.onFileSelected(null)                                 // clears it
    expect(store.validationError).toBeNull()
    expect(store.selectedFile).toBeNull()
  })

  it('onFileSelected: clears the previous lastUpload when a new file is chosen', async () => {
    const store = audioUploadStore()
    // Manually set lastUpload to simulate a successful upload
    store.lastUpload = { fileUrl: '/uploads/audio/k.mp3', filename: 'k.mp3', title: 'k' }
    await store.onFileSelected(makeFile('new.mp3', 'audio/mpeg'))
    expect(store.lastUpload).toBeNull()
  })

  it('fileSizeLabel returns empty string when no file is selected', () => {
    const store = audioUploadStore()
    expect(store.fileSizeLabel).toBe('')
  })

  it('fileSizeLabel returns a KB string for a ~200 KB file', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('clip.mp3', 'audio/mpeg', 214_000))
    expect(store.fileSizeLabel).toContain('KB')
  })

  it('fileSizeLabel returns an MB string for a large file', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('clip.mp3', 'audio/mpeg', 2_500_000))
    expect(store.fileSizeLabel).toContain('MB')
  })

  it('reset() clears file, label, transcript, and status', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('clip.mp3', 'audio/mpeg'))
    store.label = 'My clip'
    store.transcript = 'Hello world'
    store.reset()
    expect(store.selectedFile).toBeNull()
    expect(store.label).toBe('')
    expect(store.transcript).toBe('')
    expect(store.uploadStatus).toBe('idle')
  })

  it('reset() does NOT clear the library', async () => {
    const store = audioUploadStore()
    store.library = [{ filename: 'a.mp3', fileUrl: 'http://localhost:4000/public/audio/a.mp3', sizeBytes: 100 }]
    store.reset()
    expect(store.library.length).toBe(1)
  })

  it('upload() sets status to error when the backend is unavailable', async () => {
    const store = audioUploadStore()
    await store.onFileSelected(makeFile('clip.mp3', 'audio/mpeg'))
    // The backend is not running, so Axios will throw a network error.

    await store.upload()
    expect(store.uploadStatus).toBe('error')
    expect(store.uploadError).not.toBeNull()
  })

  it('upload() does nothing if canSubmit is false', async () => {
    const store = audioUploadStore()
    // No file selected — canSubmit is false
    await store.upload()
    expect(store.uploadStatus).toBe('idle')
  })
})

