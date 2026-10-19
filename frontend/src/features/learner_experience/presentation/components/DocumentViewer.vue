<script setup lang="ts">

import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ContentBlockTypes, QUESTION_BLOCK_TYPES, type $AudioBlockValue, type $ContentBlock } from '@/features/shared/models/contentType'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { useMicRecorder } from '@/features/learner_experience/functions/useMicRecorder'
import { useSavedRecording } from '@/features/learner_experience/functions/useSavedRecording'
import BlockRenderer from './BlockRenderer.vue'
import PageNav from './PageNav.vue'
import RecordingBar from './RecordingBar.vue'

//pages is $ContentRecord.content: one array of blocks per page. authorName comes
//from the catalogue row, which a learner arriving by deep link may not have.
//initialPage is the 0-based page to open at, e.g. where the learner left off.
//A learner answers questions on the test screen, so reading leaves them out;
//the builder's preview passes showQuestions so an author can check them.
//recordingContentId (the reader passes it) keeps the learner's read-aloud
//recording on their account for that content, when the content has an example
//reading to compare it with; otherwise the recording lasts until they leave.
const props = withDefaults(defineProps<{
    title: string;
    pages: $ContentBlock[][];
    authorName?: string | null;
    initialPage?: number;
    showQuestions?: boolean;
    recordingContentId?: number | null;
}>(), { authorName: null, initialPage: 0, showQuestions: false, recordingContentId: null })

//Tells the reader every time the learner turns to another page (0-based).
const emit = defineEmits<{ (event: 'page-change', page: number): void }>()

const { t } = useI18n()

//Opens at the requested page when it exists, otherwise at the first.
function startingPage(): number {
    const page = props.initialPage
    return Number.isInteger(page) && page >= 0 && page < props.pages.length ? page : 0
}

const currentPageIndex = ref(startingPage())

watch(currentPageIndex, (page) => emit('page-change', page))

const totalPages = computed(() => props.pages.length)
const pageBlocks = computed(() => props.pages[currentPageIndex.value] ?? [])
const currentBlocks = computed(() => props.showQuestions
    ? pageBlocks.value
    : pageBlocks.value.filter((block) => !QUESTION_BLOCK_TYPES.includes(block.itemType)))
//A page of questions only reads as empty, so it says where its questions went.
const onlyQuestions = computed(() => currentBlocks.value.length === 0 && pageBlocks.value.length > 0)

const direction = ref<'next' | 'prev'>('next')
const transitionName = computed(() => `page-${direction.value}`)

function goNext(): void {
    if (currentPageIndex.value < totalPages.value - 1) {
        direction.value = 'next'
        currentPageIndex.value++
    }
}

function goPrev(): void {
    if (currentPageIndex.value > 0) {
        direction.value = 'prev'
        currentPageIndex.value--
    }
}

//Arrow keys belong to a focused player or field (seeking, moving the caret).
const KEEPS_ARROWS = ['AUDIO', 'VIDEO', 'INPUT', 'TEXTAREA', 'SELECT']

function handleKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null
    if (target && (KEEPS_ARROWS.includes(target.tagName) || target.isContentEditable)) return
    if (event.key === 'ArrowRight') goNext()
    if (event.key === 'ArrowLeft') goPrev()
}

//The example the learner practises against: the content's first Audio block
//with a file, wherever it is, so it can be played from any page.
const exampleUrl = computed<string | null>(() => {
    for (const page of props.pages) {
        for (const block of page) {
            if (block.itemType !== ContentBlockTypes.audio) continue
            const fileUrl = (block.value as $AudioBlockValue).fileUrl
            if (fileUrl) return MediaDataSource.resolveUrl(fileUrl)
        }
    }
    return null
})

//Held here, above the keyed BlockRenderer, so the practice panel and a
//recording in progress both survive page turns.
const mic = useMicRecorder()
//Saved to the account only when there is an example to compare against; with
//no example (or in the builder's preview, which has no content id) a recording
//is a temporary take that lasts until the learner leaves the page. Decided once:
//a reader's content does not change while it is open.
const savedRecording = useSavedRecording(exampleUrl.value ? props.recordingContentId : null, mic)

</script>

<template>
  <div class="document-viewer" tabindex="0" @keydown="handleKeydown">
    <header v-if="title || authorName" class="document-viewer__meta">
      <h1 v-if="title" class="document-viewer__title">{{ title }}</h1>
      <p v-if="authorName" class="document-viewer__author">{{ t('learner.byAuthor', { name: authorName }) }}</p>
    </header>

    <!-- On every page: the learner can practise whichever page they are on. -->
    <RecordingBar
      :is-recording="mic.isRecording.value"
      :has-recording="mic.hasRecording.value"
      :recorded-url="mic.recordedUrl.value"
      :error="mic.error.value"
      :save-status="savedRecording.status.value"
      :example-url="exampleUrl"
      @start="mic.start"
      @stop="mic.stop"
      @delete="savedRecording.remove"
    />

    <!-- mode="out-in" keeps one page in the normal flow at a time, so the height
         is whatever the browser computes: no measuring, nothing to overlap. -->
    <Transition :name="transitionName" mode="out-in">
      <p v-if="onlyQuestions" :key="`questions-${currentPageIndex}`" class="document-viewer__questions-note">{{ t('learner.reader.questionsInTest') }}</p>
      <BlockRenderer v-else :key="currentPageIndex" :blocks="currentBlocks" />
    </Transition>

    <PageNav
      :current="currentPageIndex + 1"
      :total="totalPages"
      @prev="goPrev"
      @next="goNext"
    />
  </div>
</template>

<style scoped>
.document-viewer {
  outline: none;
}
.document-viewer__meta {
  margin-bottom: var(--space-5);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--rule);
}
.document-viewer__title {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 600;
  margin: 0 0 var(--space-1);
  line-height: 1.2;
}
.document-viewer__author {
  font-size: var(--text-sm);
  color: var(--ink-2);
  margin: 0;
}

.page-next-enter-active,
.page-next-leave-active,
.page-prev-enter-active,
.page-prev-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.page-next-leave-to { transform: translateX(-16px); opacity: 0; }
.page-next-enter-from { transform: translateX(16px); opacity: 0; }
.page-prev-leave-to { transform: translateX(16px); opacity: 0; }
.page-prev-enter-from { transform: translateX(-16px); opacity: 0; }

@media (max-width: 640px) {
  .document-viewer__title {
    font-size: var(--text-2xl);
  }
}

.document-viewer__questions-note {
  margin: 0;
  padding: var(--space-5) 0;
  color: var(--ink-3);
  font-style: italic;
  text-align: center;
}
</style>
