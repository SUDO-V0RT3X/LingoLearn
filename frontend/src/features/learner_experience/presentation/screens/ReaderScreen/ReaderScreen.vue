<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { learnerExperienceStore } from '@/features/learner_experience/presentation/state/learnerExperienceStore'
import { themeStore } from '@/features/shared/state/themeStore'
import { authStore } from '@/features/auth_feature/state/authStore'
import { friendlyError, levelLabel } from '@/features/learner_experience/functions/learnerCopy'
import DocumentViewer from '@/features/learner_experience/presentation/components/DocumentViewer.vue'
import WallpaperPicker from '@/features/learner_experience/presentation/components/WallpaperPicker.vue'

const store = learnerExperienceStore()
const theme = themeStore()
const auth = authStore()
const route = useRoute()
const { t } = useI18n()
const { openContent, contentError, resumePage, progressSaveError, wallpaper } = storeToRefs(store)

//True until both the content and the saved page have arrived, so the viewer
//opens straight at the right page instead of jumping there.
const isOpening = ref(true)
//The page on screen (0-based), as the viewer reports it.
const currentPage = ref(0)
const showWallpaperPicker = ref(false)

const hasTest = computed(() => openContent.value?.kind === 'quiz')

//What went wrong opening the content, which decides the heading and the way out:
//  notFound     no such content: nothing to retry
//  aboveLevel   above the learner's level: My learning shows how to get there
//  unavailable  not something a learner can read (a draft, pending, rejected)
//  blocked      refused for now (setup, a grown-up's link)
//  failed       the network or the server: worth trying again
type ReaderErrorKind = 'notFound' | 'aboveLevel' | 'unavailable' | 'blocked' | 'failed'
const errorKind = computed<ReaderErrorKind>(() => {
    const error = contentError.value
    if (error == null) return 'failed'
    const message = error.message ?? ''
    if (error.statusCode === 404) return 'notFound'
    if (error.statusCode === 403) {
        if (/above your level/i.test(message)) return 'aboveLevel'
        if (/another author|not available/i.test(message)) return 'unavailable'
        return 'blocked'
    }
    return 'failed'
})
const errorTitle = computed(() => {
    switch (errorKind.value) {
        case 'notFound': return t('learner.reader.notFoundTitle')
        case 'unavailable': return t('learner.reader.notAvailableTitle')
        case 'aboveLevel':
        case 'blocked': return t('learner.reader.cantOpenYet')
        default: return t('learner.reader.didntOpen')
    }
})
//The wallpaper only matters while there is something to read on it.
const canPickWallpaper = computed(() => !isOpening.value && contentError.value == null && openContent.value != null)

function routeContentId(): number {
    return Number(route.params.contentId)
}

const isLastPage = computed(() =>
    openContent.value != null && currentPage.value >= openContent.value.content.length - 1)

//Opens the content at the learner's saved page, and records that they opened
//it, so it shows up under "Continue reading".
async function open(): Promise<void> {
    isOpening.value = true
    store.loadWallpaperFor(auth.currentUser?.id ?? null, theme.isChild)
    const contentId = routeContentId()
    await store.openForReading(contentId)
    currentPage.value = resumePage.value
    isOpening.value = false
    if (openContent.value != null) {
        void store.saveReadingProgress(contentId, resumePage.value, openContent.value.content.length)
    }
}

//Saves every page turn. A failed save is mentioned, never in the way.
function onPageChange(page: number): void {
    currentPage.value = page
    if (openContent.value == null) return
    void store.saveReadingProgress(openContent.value.contentId, page, openContent.value.content.length)
}

function pickWallpaper(css: string): void {
    store.setWallpaper(css, auth.currentUser?.id ?? null, theme.isChild)
    showWallpaperPicker.value = false
}

//The child theme can arrive a moment after the page: pick the matching set then.
watch(() => theme.isChild, (isChild) => store.loadWallpaperFor(auth.currentUser?.id ?? null, isChild))

onMounted(open)

//Moving between two pieces of content reuses this screen, so the id is watched.
watch(() => route.params.contentId, open)

//The viewer is remounted per content, which also ends any recording in progress.
onUnmounted(() => store.clearOpenContent())

</script>

<template>
  <div class="reader" :style="{ background: wallpaper }">
    <main class="ui-page ui-page--narrow reader__page">
      <div class="reader__toolbar">
        <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--ghost reader__back">&lsaquo; {{ t('learner.reader.backToExplore') }}</RouterLink>
        <button v-if="canPickWallpaper" type="button" class="ui-btn ui-btn--ghost ui-btn--sm reader__wallpaper" data-testid="wallpaper-button" @click="showWallpaperPicker = true">{{ t('learner.reader.background') }}</button>
      </div>

      <div v-if="isOpening" class="ui-card reader__state" role="status">
        <span class="ui-spinner" aria-hidden="true" />
        <span>{{ theme.isChild ? t('learner.reader.openingChild') : t('learner.reader.opening') }}</span>
      </div>

      <div v-else-if="contentError || !openContent" class="ui-card ui-empty" data-testid="reader-error">
        <h1 class="ui-empty__title">{{ errorTitle }}</h1>
        <p>{{ friendlyError(contentError) || t('learner.reader.pleaseTryAgain') }}</p>
        <div class="ui-row reader__actions">
          <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">{{ t('learner.reader.backToExplore') }}</RouterLink>
          <RouterLink v-if="errorKind === 'aboveLevel'" :to="{ name: 'myLearning' }" class="ui-btn">{{ t('learner.reader.seeMyLevel') }}</RouterLink>
          <button v-else-if="errorKind === 'failed'" type="button" class="ui-btn" @click="open">{{ t('common.states.retry') }}</button>
        </div>
      </div>

      <template v-else>
        <article class="ui-card reader__paper">
          <p class="ui-eyebrow">{{ levelLabel(openContent.level) }}<template v-if="hasTest"> · {{ t('learner.reader.hasTest') }}</template></p>
          <DocumentViewer
            :key="openContent.contentId"
            :title="openContent.title"
            :author-name="store.openContentAuthorName"
            :pages="openContent.content"
            :initial-page="resumePage"
            :recording-content-id="openContent.contentId"
            @page-change="onPageChange"
          />
        </article>

        <p v-if="progressSaveError" class="reader__save-note" role="status">
          {{ t('learner.reader.saveFailed') }}
        </p>

        <section v-if="isLastPage" class="ui-card reader__end" :class="{ 'reader__end--test': hasTest }" data-testid="reader-end">
          <template v-if="hasTest">
            <div>
              <h2 class="ui-section-title">{{ theme.isChild ? t('learner.reader.endTestTitleChild') : t('learner.reader.endTestTitle') }}</h2>
              <p class="reader__end-text">
                {{ theme.isChild ? t('learner.reader.endTestTextChild') : t('learner.reader.endTestText') }}
              </p>
            </div>
            <RouterLink
              :to="{ name: 'test', params: { contentId: String(openContent.contentId) } }"
              class="ui-btn ui-btn--primary ui-btn--lg"
              data-testid="take-test"
            >{{ theme.isChild ? t('learner.reader.startQuiz') : t('learner.reader.takeTest') }}</RouterLink>
          </template>
          <template v-else>
            <div>
              <h2 class="ui-section-title">{{ theme.isChild ? t('learner.reader.endTitleChild') : t('learner.reader.endTitle') }}</h2>
              <p class="reader__end-text">{{ t('learner.reader.endText') }}</p>
            </div>
            <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">{{ t('learner.reader.backToExplore') }}</RouterLink>
          </template>
        </section>
      </template>
    </main>

    <WallpaperPicker
      v-if="showWallpaperPicker"
      :is-child="theme.isChild"
      :current="wallpaper"
      @select="pickWallpaper"
      @close="showWallpaperPicker = false"
    />
  </div>
</template>

<style scoped>
.reader {
  min-height: calc(100vh - var(--header-height));
}
.reader__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.reader__back,
.reader__wallpaper {
  background: var(--surface);
  border-color: var(--rule);
}
.reader__state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}
.reader__actions {
  justify-content: center;
  margin-top: var(--space-4);
}
.reader__paper {
  padding: var(--space-6);
  box-shadow: var(--shadow-2);
}
.reader__save-note {
  margin: var(--space-3) 0 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--text-xs);
  color: var(--warning);
}
.reader__end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: var(--space-4);
}
.reader__end--test {
  border: 2px solid var(--accent);
  background: var(--accent-soft);
}
.reader__end .ui-section-title {
  margin-bottom: var(--space-1);
}
.reader__end-text {
  margin: 0;
  color: var(--ink-2);
}

@media (max-width: 640px) {
  .reader__paper {
    padding: var(--space-4);
  }
}
</style>