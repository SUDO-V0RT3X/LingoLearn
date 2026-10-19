// Pinia store for the audio library screen: the author's own clips, and the
// form that uploads a new one. There is no delete: approved content may still
// point at a clip, and nothing tracks that yet.

import { defineStore } from 'pinia'
import type { UploadResponse, AudioFileInfo } from '@/features/media_feature/models/AssetType'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { validateAudio, validateAudioSync } from '@/features/media_feature/functions/validateAudio'
import { localizeMediaMessage } from '@/features/media_feature/functions/localizeMediaMessage'

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export const audioUploadStore = defineStore('audioUploadStore', {
  state: () => ({
    // Form fields
    selectedFile:    null as File | null,
    label:           '' as string,
    transcript:      '' as string,

    // Upload state
    validationError: null as string | null,
    uploadStatus:    'idle' as UploadStatus,
    uploadError:     null as string | null,

    // Upload result returned by the backend (contains fileUrl)
    lastUpload:      null as UploadResponse | null,

    // Library listing
    library:          [] as AudioFileInfo[],
    // True until the first load answers, so the screen shows a spinner, not "no clips".
    isLoadingLibrary: true as boolean,
    libraryError:     null as string | null,
  }),

  getters: {
    // True when form is valid and ready to submit
    canSubmit(state): boolean {
      return (
        state.selectedFile !== null &&
        state.validationError === null &&
        state.uploadStatus !== 'uploading'
      )
    },

    // Formatted file size string (e.g. "214 KB" or "2.4 MB")
    fileSizeLabel(state): string {
      if (!state.selectedFile) return ''
      const b = state.selectedFile.size
      if (b < 1024)        return `${b} B`
      if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
      return `${(b / (1024 * 1024)).toFixed(1)} MB`
    },
  },

  actions: {
    // Handles file selection with sync check first, then async duration check
    async onFileSelected(file: File | null) {
      this.selectedFile    = file
      this.validationError = null
      this.uploadStatus    = 'idle'
      this.uploadError     = null
      this.lastUpload      = null

      if (!file) return

      // Immediate format and size check
      const syncError = validateAudioSync(file)
      if (syncError) {
        this.validationError = syncError
        this.selectedFile = null
        return
      }

      // Check duration using Web Audio API
      const fullError = await validateAudio(file)
      if (fullError) {
        this.validationError = fullError
        this.selectedFile = null
      }
    },

    // Uploads selected file to the backend
    async upload() {
      const file = this.selectedFile
      if (!file || this.validationError || this.uploadStatus === 'uploading') return

      this.uploadStatus = 'uploading'
      this.uploadError  = null

      const result = await MediaDataSource.uploadAudio(
        file,
        this.label.trim(),
        this.transcript.trim()
      )

      if (result.error) {
        this.uploadStatus = 'error'
        this.uploadError  = localizeMediaMessage(result.error.message)
      } else {
        this.uploadStatus = 'success'
        this.lastUpload   = result.data

        // Prepend new file to the library
        if (result.data) {
          this.library.unshift({
            filename: result.data.filename,
            fileUrl: result.data.fileUrl,
            sizeBytes: file.size,
            uploadedAt: new Date().toISOString(),
            title: result.data.title,
            transcript: result.data.transcript,
          })
        }

        // Reset input fields
        this.selectedFile = null
        this.label        = ''
        this.transcript   = ''
      }
    },

    // Loads the list of existing audio files from backend
    async loadLibrary() {
      this.isLoadingLibrary = true
      this.libraryError     = null

      const result = await MediaDataSource.listAudio()

      if (result.error) {
        this.libraryError = localizeMediaMessage(result.error.message)
      } else {
        this.library = result.data ?? []
      }
      this.isLoadingLibrary = false
    },

    // Resets the upload form
    reset() {
      this.selectedFile    = null
      this.label           = ''
      this.transcript      = ''
      this.validationError = null
      this.uploadStatus    = 'idle'
      this.uploadError     = null
    },
  },
})
