<script setup lang="ts">
import { MAX_TRANSCRIPT_LENGTH } from '@/core/limits'
// The author's audio library: every clip they have uploaded, with a player,
// title and transcript, and a form to upload a new one. Clips uploaded inside
// the content builder land here too. There is no delete: approved content may
// still point at a clip.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { audioUploadStore } from '@/features/media_feature/state/audioUploadStore'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { ALLOWED_AUDIO_MIME_TYPES } from '@/features/media_feature/functions/validateAudio'
import { formatRelativeTime } from '@/features/media_feature/functions/formatRelativeTime'

const store = audioUploadStore()
const { t } = useI18n()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDraggingOver = ref(false)
const accept = ALLOWED_AUDIO_MIME_TYPES.join(',')

// Uploads are stored as relative paths, so the player needs the API origin.
const playable = (fileUrl: string) => MediaDataSource.resolveUrl(fileUrl || '')

// A local preview of the chosen file, released when it is replaced or gone.
// Some environments have no object URLs; the form then simply has no preview.
const canPreview = typeof URL.createObjectURL === 'function'
const previewUrl = ref('')
function releasePreview() {
  if (previewUrl.value && canPreview) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}
watch(() => store.selectedFile, (file) => {
  releasePreview()
  if (file && canPreview) previewUrl.value = URL.createObjectURL(file)
})
onBeforeUnmount(releasePreview)

const clipCount = computed(() => store.library.length)

onMounted(() => {
  store.reset()
  store.loadLibrary()
})

function openFilePicker() {
  fileInputRef.value?.click()
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  store.onFileSelected(input.files?.[0] ?? null)
  input.value = ''
}

function onDrop(event: DragEvent) {
  isDraggingOver.value = false
  store.onFileSelected(event.dataTransfer?.files?.[0] ?? null)
}

function sizeLabel(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <main class="ui-page library-page">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ t('media.dashboard.eyebrow') }}</p>
        <h1 class="ui-title">{{ t('common.nav.audioLibrary') }}</h1>
        <p class="ui-subtitle">{{ t('media.audio.subtitle') }}</p>
      </div>
    </header>

    <div class="library-layout">
      <!-- Upload a new clip -->
      <section class="ui-card upload" aria-labelledby="upload-heading" data-testid="upload-card">
        <h2 id="upload-heading" class="ui-section-title">{{ t('media.audio.uploadHeading') }}</h2>

        <input
          ref="fileInputRef"
          type="file"
          :accept="accept"
          class="ui-sr-only"
          tabindex="-1"
          aria-hidden="true"
          data-testid="file-input"
          @change="onInputChange"
        />

        <div
          v-if="!store.selectedFile"
          class="dropzone"
          :class="{ 'dropzone--active': isDraggingOver }"
          data-testid="dropzone"
          role="button"
          tabindex="0"
          :aria-label="t('media.audio.dropzone')"
          @click="openFilePicker"
          @keydown.enter.prevent="openFilePicker"
          @keydown.space.prevent="openFilePicker"
          @dragover.prevent="isDraggingOver = true"
          @dragleave="isDraggingOver = false"
          @drop.prevent="onDrop"
        >
          <span class="dropzone__icon" aria-hidden="true">♪</span>
          <span class="dropzone__text">{{ t('media.audio.dropzone') }}</span>
          <span class="ui-hint">{{ t('media.audio.limits') }}</span>
        </div>

        <div v-if="store.validationError" class="ui-alert ui-alert--error" role="alert" data-testid="validation-error">
          {{ store.validationError }}
        </div>

        <form v-if="store.selectedFile" class="ui-stack" @submit.prevent="store.upload()">
          <div class="chosen">
            <audio v-if="previewUrl" :src="previewUrl" controls class="player" data-testid="audio-player"></audio>
            <div class="chosen__meta">
              <span class="chosen__name" data-testid="filename">{{ store.selectedFile.name }}</span>
              <span class="ui-hint">{{ store.fileSizeLabel }}</span>
              <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-testid="replace-btn" @click="openFilePicker">
                {{ t('media.audio.replace') }}
              </button>
            </div>
          </div>

          <div class="ui-field">
            <label class="ui-label" for="audio-label">{{ t('media.audio.titleLabel') }}</label>
            <input
              id="audio-label"
              v-model="store.label"
              type="text"
              class="ui-input"
              :placeholder="t('media.audio.titlePlaceholder')"
              maxlength="120"
              data-testid="label-input"
            />
          </div>

          <div class="ui-field">
            <label class="ui-label" for="audio-transcript">{{ t('media.audio.transcriptLabel') }}</label>
            <textarea
              id="audio-transcript"
              v-model="store.transcript"
              class="ui-textarea"
              :maxlength="MAX_TRANSCRIPT_LENGTH"
              rows="3"
              :placeholder="t('media.audio.transcriptPlaceholder')"
              data-testid="transcript-input"
            ></textarea>
            <span class="ui-hint">{{ t('media.audio.transcriptHint') }}</span>
          </div>

          <div v-if="store.uploadStatus === 'error' && store.uploadError" class="ui-alert ui-alert--error" role="alert" data-testid="upload-error">
            {{ store.uploadError }}
          </div>

          <div class="ui-row upload__actions">
            <button type="button" class="ui-btn ui-btn--ghost" data-testid="cancel-btn" @click="store.reset()">
              {{ t('common.states.cancel') }}
            </button>
            <button
              type="submit"
              class="ui-btn ui-btn--primary"
              :disabled="!store.canSubmit"
              :aria-busy="store.uploadStatus === 'uploading'"
              data-testid="save-btn"
            >
              {{ store.uploadStatus === 'uploading' ? t('media.audio.uploading') : t('media.audio.saveClip') }}
            </button>
          </div>
        </form>

        <div
          v-if="store.uploadStatus === 'success' && store.lastUpload && !store.selectedFile"
          class="ui-alert ui-alert--success"
          role="status"
          data-testid="success-banner"
        >
          {{ t('media.audio.saved', { title: store.lastUpload.title || store.lastUpload.filename }) }}
        </div>
      </section>

      <!-- The author's clips -->
      <section class="clips" aria-labelledby="clips-heading" data-testid="library-panel">
        <div class="clips__head">
          <h2 id="clips-heading" class="ui-section-title">{{ t('media.audio.clipsHeading') }}</h2>
          <span v-if="!store.isLoadingLibrary && !store.libraryError" class="ui-badge ui-badge--brand">
            {{ t('media.audio.clipCount', clipCount) }}
          </span>
        </div>

        <div v-if="store.isLoadingLibrary" class="ui-card ui-card--flat state" role="status" data-testid="library-loading">
          <span class="ui-spinner" aria-hidden="true"></span>
          <span>{{ t('media.audio.loading') }}</span>
        </div>

        <div v-else-if="store.libraryError" class="ui-alert ui-alert--error state--error" role="alert" data-testid="library-error">
          <span>{{ t('media.audio.loadError', { error: store.libraryError }) }}</span>
          <button type="button" class="ui-btn ui-btn--sm" @click="store.loadLibrary()">{{ t('common.states.retry') }}</button>
        </div>

        <div v-else-if="store.library.length === 0" class="ui-card ui-card--flat ui-empty" data-testid="library-empty">
          <p class="ui-empty__title">{{ t('media.audio.emptyTitle') }}</p>
          <p>{{ t('media.audio.emptyBody') }}</p>
        </div>

        <ul v-else class="clips__list">
          <li v-for="item in store.library" :key="item.filename" class="ui-card clip" data-testid="library-item">
            <div class="clip__head">
              <h3 :class="['clip__title', { 'clip__title--empty': !item.title }]" data-testid="library-item-title">
                {{ item.title || t('media.audio.untitled') }}
              </h3>
              <span class="ui-hint clip__meta">
                <template v-if="item.uploadedAt">{{ formatRelativeTime(item.uploadedAt) }}</template>
                <template v-if="item.uploadedAt && item.sizeBytes"> · </template>
                <template v-if="item.sizeBytes">{{ sizeLabel(item.sizeBytes) }}</template>
              </span>
            </div>
            <audio :src="playable(item.fileUrl)" controls preload="none" class="player"></audio>
            <p v-if="item.transcript" class="clip__transcript" data-testid="library-item-transcript">
              {{ item.transcript }}
            </p>
            <p v-else class="clip__transcript clip__transcript--empty">{{ t('media.audio.noTranscript') }}</p>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.library-layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) 1fr;
  gap: var(--space-5);
  align-items: start;
}

.upload {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  position: sticky;
  top: calc(var(--header-height) + var(--space-4));
}

.upload .ui-section-title {
  margin: 0;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  border: 2px dashed var(--rule-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--ink-2);
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.dropzone:hover,
.dropzone--active {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.dropzone__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--primary);
  font-size: var(--text-xl);
}

.dropzone__text {
  font-weight: 600;
  color: var(--ink);
}

.chosen {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.chosen__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.chosen__name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload__actions {
  justify-content: flex-end;
}

.player {
  width: 100%;
  height: 40px;
}

.clips__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.clips__head .ui-section-title {
  margin: 0;
}

.state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.state--error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.clips__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.clip {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.clip__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.clip__title {
  margin: 0;
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.clip__title--empty {
  font-style: italic;
  color: var(--ink-3);
}

.clip__transcript {
  margin: 0;
  padding-left: var(--space-3);
  border-left: 3px solid var(--accent);
  color: var(--ink-2);
  font-size: var(--text-sm);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.clip__transcript--empty {
  border-left-color: var(--rule-strong);
  font-style: italic;
  color: var(--ink-3);
}

@media (max-width: 820px) {
  .library-layout {
    grid-template-columns: 1fr;
  }

  .upload {
    position: static;
  }
}
</style>
