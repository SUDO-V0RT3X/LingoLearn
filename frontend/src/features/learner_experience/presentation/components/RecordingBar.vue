<script setup lang="ts">

import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { themeStore } from '@/features/shared/state/themeStore'
import type { RecordingSaveStatus } from '@/features/learner_experience/functions/useSavedRecording'
import ComparisonBar from './ComparisonBar.vue'

//The read-aloud practice panel, as a short list of steps.
//  With an example (the content's first Audio block):
//    1 Listen to the example  2 Read aloud and record  3 Listen to your recording  4 Compare
//  Without one:
//    1 Read aloud and record  2 Listen to your recording  3 Try again if you want to improve
//Every step stays usable; the next one to do is highlighted and done ones are ticked.
//exampleUrl is the example's playable URL, null when there is none. recordedUrl
//is the learner's clip (a Blob URL). saveStatus is where it stands with their
//account; null when it is not kept there (no example, or the builder's preview),
//so it is said to last until they leave the page.
const props = withDefaults(defineProps<{
    isRecording: boolean;
    hasRecording: boolean;
    recordedUrl?: string | null;
    error: string | null;
    saveStatus?: RecordingSaveStatus | null;
    exampleUrl?: string | null;
}>(), { recordedUrl: null, saveStatus: null, exampleUrl: null })

const emit = defineEmits<{ (event: 'start'): void; (event: 'stop'): void; (event: 'delete'): void }>()

const { t } = useI18n()
const theme = themeStore()
const bodyId = useId()

type StepKey = 'listenExample' | 'record' | 'listenMine' | 'compare' | 'tryAgain'
type Clip = 'example' | 'mine'

const hasExample = computed(() => !!props.exampleUrl)
const canPlayMine = computed(() => props.hasRecording && !!props.recordedUrl)
const steps = computed<StepKey[]>(() => hasExample.value
    ? ['listenExample', 'record', 'listenMine', 'compare']
    : ['record', 'listenMine', 'tryAgain'])

//What the learner has done this visit, for ticking steps off.
const heard = ref<Record<Clip, boolean>>({ example: false, mine: false })
const compared = ref<Record<Clip, boolean>>({ example: false, mine: false })

const done = computed<Record<StepKey, boolean>>(() => ({
    listenExample: heard.value.example,
    record: props.hasRecording,
    listenMine: canPlayMine.value && heard.value.mine,
    compare: canPlayMine.value && compared.value.example && compared.value.mine,
    tryAgain: false,
}))

//The step to do next: recording while the mic is on, else the first one not
//done after the furthest one done, so it moves forward (a learner who records
//without listening to the example first is pointed on to their recording).
const currentStep = computed<StepKey | null>(() => {
    if (props.isRecording) return 'record'
    const order = steps.value
    let furthest = -1
    order.forEach((step, index) => { if (done.value[step]) furthest = index })
    return order.slice(furthest + 1).find((step) => !done.value[step]) ?? null
})

const isBusy = computed(() => props.saveStatus === 'saving' || props.saveStatus === 'deleting')

//The panel can be folded away to read; it opens again when a recording finishes.
const expanded = ref(true)

// ---- playback: the panel's two players, one playing at a time

//Set by function refs: a plain ref inside the v-for over steps would collect an array.
const exampleAudio = ref<HTMLAudioElement | null>(null)
const mineAudio = ref<HTMLAudioElement | null>(null)
const mineStep = ref<HTMLElement | null>(null)
const setExampleAudio = (el: unknown) => { exampleAudio.value = (el as HTMLAudioElement | null) ?? null }
const setMineAudio = (el: unknown) => { mineAudio.value = (el as HTMLAudioElement | null) ?? null }
const setMineStep = (el: unknown) => { mineStep.value = (el as HTMLElement | null) ?? null }
const playing = ref<Clip | null>(null)

const player = (clip: Clip) => clip === 'example' ? exampleAudio.value : mineAudio.value

function onPlay(clip: Clip): void {
    playing.value = clip
    heard.value = { ...heard.value, [clip]: true }
    const other = player(clip === 'example' ? 'mine' : 'example')
    if (other && !other.paused) other.pause()
}

function onPause(clip: Clip): void {
    if (playing.value === clip) playing.value = null
}

//play() returns a promise that rejects if the browser refuses; nothing to tell the learner.
function safePlay(audio: HTMLAudioElement): void {
    try {
        const started = audio.play() as Promise<void> | undefined
        started?.catch?.(() => {})
    } catch {
        //An unsupported media element (tests, very old browsers) just stays paused.
    }
}

function pauseAll(): void {
    for (const audio of [exampleAudio.value, mineAudio.value]) {
        if (audio && !audio.paused) audio.pause()
    }
}

//The compare buttons: play that clip from the start, or pause it if it is playing.
function toggle(clip: Clip): void {
    compared.value = { ...compared.value, [clip]: true }
    const audio = player(clip)
    if (!audio) return
    if (playing.value === clip) {
        audio.pause()
        return
    }
    audio.currentTime = 0
    safePlay(audio)
}

// ---- recording

function startRecording(): void {
    //The example must not end up in the learner's recording.
    pauseAll()
    emit('start')
}

//Seconds since recording started, shown next to Stop.
const elapsed = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null

function stopTicker(): void {
    if (ticker) clearInterval(ticker)
    ticker = null
}

watch(() => props.isRecording, (recording) => {
    stopTicker()
    if (recording) {
        elapsed.value = 0
        ticker = setInterval(() => { elapsed.value += 1 }, 1000)
    }
}, { immediate: true })

onBeforeUnmount(stopTicker)

const elapsedText = computed(() => {
    const minutes = Math.floor(elapsed.value / 60)
    const seconds = String(elapsed.value % 60).padStart(2, '0')
    return `${minutes}:${seconds}`
})

// ---- a finished recording "pops up": the panel opens, scrolls to the learner's
// player and puts focus on it, ready to press play. A recording loaded from the
// account on opening is not announced like this; only one the learner just made.

const justRecorded = ref(false)
let awaitingTake = false
let highlightTimer: ReturnType<typeof setTimeout> | null = null

async function revealRecording(): Promise<void> {
    expanded.value = true
    justRecorded.value = true
    if (highlightTimer) clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => { justRecorded.value = false }, 2500)
    await nextTick()
    const reduceMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    mineStep.value?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' })
    mineAudio.value?.focus?.({ preventScroll: true })
}

onBeforeUnmount(() => { if (highlightTimer) clearTimeout(highlightTimer) })

//The browser hands over the clip a moment after Stop, so wait for its URL.
watch(() => [props.isRecording, props.recordedUrl] as const, ([recording, url], [wasRecording, oldUrl]) => {
    if (wasRecording && !recording) awaitingTake = true
    if (url !== oldUrl) {
        heard.value = { ...heard.value, mine: false }
        compared.value = { example: false, mine: false }
        if (playing.value === 'mine') playing.value = null
    }
    if (awaitingTake && url && url !== oldUrl) {
        awaitingTake = false
        void revealRecording()
    }
})

// ---- what the panel says

const title = computed(() => theme.isChild ? t('learner.recording.titleChild') : t('learner.recording.title'))

//Problems with the account copy; the microphone's own error sits by the record button.
const saveError = computed<string | null>(() => {
    switch (props.saveStatus) {
        case 'saveFailed': return t('learner.recording.saveFailed')
        case 'deleteFailed': return t('learner.recording.deleteFailed')
        case 'loadFailed': return t('learner.recording.loadFailed')
        default: return null
    }
})

//The polite status line: what is happening now, or where the recording is kept.
const status = computed<string>(() => {
    if (props.error) return ''
    if (props.isRecording) return t('learner.recording.recordingStatus')
    switch (props.saveStatus) {
        case 'loading': return t('learner.recording.loading')
        case 'saving': return t('learner.recording.saving')
        case 'deleting': return t('learner.recording.deleting')
    }
    if (!props.hasRecording) return ''
    if (props.saveStatus === 'saved') {
        return theme.isChild ? t('learner.recording.savedHintChild') : t('learner.recording.savedHint')
    }
    return props.saveStatus == null ? t('learner.recording.temporaryHint') : ''
})

</script>

<template>
  <section
    class="recording-bar"
    :class="{ 'recording-bar--child': theme.isChild, 'recording-bar--recording': isRecording }"
    :aria-labelledby="`${bodyId}-title`"
    data-testid="practice-panel"
  >
    <div class="recording-bar__header">
      <h2 :id="`${bodyId}-title`" class="recording-bar__title">
        <span class="recording-bar__mic" aria-hidden="true">🎙</span>
        {{ title }}
      </h2>
      <div class="recording-bar__header-actions">
        <template v-if="isRecording && !expanded">
          <span class="recording-bar__live"><span class="recording-bar__dot" aria-hidden="true" />{{ t('learner.recording.recordingTime', { time: elapsedText }) }}</span>
          <button type="button" class="recording-bar__btn recording-bar__btn--stop" data-testid="stop-recording-compact" @click="emit('stop')">
            {{ t('learner.recording.stop') }}
          </button>
        </template>
        <button
          type="button"
          class="recording-bar__toggle"
          data-testid="practice-toggle"
          :aria-expanded="expanded"
          :aria-controls="bodyId"
          @click="expanded = !expanded"
        >
          {{ expanded ? t('learner.recording.hide') : t('learner.recording.show') }}
        </button>
      </div>
    </div>

    <div v-show="expanded" :id="bodyId" class="recording-bar__body">
      <p class="recording-bar__intro">{{ hasExample ? t('learner.recording.introWithExample') : t('learner.recording.introNoExample') }}</p>

      <ol class="recording-bar__steps">
        <li
          v-for="(step, index) in steps"
          :key="step"
          class="recording-bar__step"
          :class="[
            `recording-bar__step--${step}`,
            {
              'recording-bar__step--done': done[step],
              'recording-bar__step--current': currentStep === step,
              'recording-bar__step--flash': step === 'listenMine' && justRecorded,
            },
          ]"
          :aria-current="currentStep === step ? 'step' : undefined"
          :data-step="step"
        >
          <span class="recording-bar__badge" :class="`recording-bar__badge--${index + 1}`" aria-hidden="true">{{ done[step] ? '✓' : index + 1 }}</span>
          <div class="recording-bar__step-body">
            <h3 class="recording-bar__step-title">
              {{ t(`learner.recording.steps.${step}`) }}
              <span v-if="done[step]" class="ui-sr-only">({{ t('learner.recording.stepDone') }})</span>
            </h3>

            <!-- 1 Listen to the example -->
            <audio
              v-if="step === 'listenExample' && exampleUrl"
              :ref="setExampleAudio"
              :src="exampleUrl"
              controls
              preload="none"
              :aria-label="t('learner.recording.exampleLabel')"
              data-testid="example-player"
              @play="onPlay('example')"
              @pause="onPause('example')"
              @ended="onPause('example')"
            ></audio>

            <!-- Read aloud and record -->
            <template v-else-if="step === 'record'">
              <div class="recording-bar__actions">
                <template v-if="isRecording">
                  <button type="button" class="recording-bar__btn recording-bar__btn--stop" data-testid="stop-recording" @click="emit('stop')">
                    <span class="recording-bar__square" aria-hidden="true" />
                    {{ t('learner.recording.stop') }}
                  </button>
                  <span class="recording-bar__live"><span class="recording-bar__dot" aria-hidden="true" />{{ t('learner.recording.recordingTime', { time: elapsedText }) }}</span>
                </template>
                <button
                  v-else-if="!hasRecording"
                  type="button"
                  class="recording-bar__btn recording-bar__btn--record"
                  data-testid="start-recording"
                  @click="startRecording"
                >
                  <span class="recording-bar__dot" aria-hidden="true" />
                  {{ t('learner.recording.start') }}
                </button>
                <!-- Without an example, "Try again" is its own step below. -->
                <button
                  v-else-if="hasExample"
                  type="button"
                  class="recording-bar__btn"
                  data-testid="record-again"
                  @click="startRecording"
                >
                  <span class="recording-bar__dot" aria-hidden="true" />
                  {{ t('learner.recording.again') }}
                </button>
              </div>
              <p v-if="!hasRecording && !isRecording" class="recording-bar__hint">{{ t('learner.recording.recordHint') }}</p>
              <p v-if="error" class="recording-bar__error" role="alert">{{ error }}</p>
            </template>

            <!-- Listen to your recording -->
            <div v-else-if="step === 'listenMine'" :ref="setMineStep" class="recording-bar__playback">
              <template v-if="canPlayMine">
                <div class="recording-bar__actions">
                  <button
                    type="button"
                    class="recording-bar__btn recording-bar__btn--mine"
                    data-testid="play-mine"
                    @click="toggle('mine')"
                  >
                    <span class="recording-bar__icon" aria-hidden="true">{{ playing === 'mine' ? '❚❚' : '▶' }}</span>
                    <span>{{ playing === 'mine' ? t('learner.recording.pause') : t('learner.recording.playMine') }}</span>
                  </button>
                </div>
                <audio
                  :ref="setMineAudio"
                  :src="recordedUrl ?? undefined"
                  controls
                  preload="metadata"
                  :aria-label="t('learner.recording.mineLabel')"
                  data-testid="my-player"
                  @play="onPlay('mine')"
                  @pause="onPause('mine')"
                  @ended="onPause('mine')"
                ></audio>
              </template>
              <p v-else class="recording-bar__hint recording-bar__hint--muted">{{ t('learner.recording.mineEmpty') }}</p>
            </div>

            <!-- Compare with the example -->
            <ComparisonBar
              v-else-if="step === 'compare'"
              :can-compare="canPlayMine && !isRecording"
              :playing="playing"
              @play-example="toggle('example')"
              @play-mine="toggle('mine')"
            />

            <!-- Try again (no example) -->
            <template v-else-if="step === 'tryAgain'">
              <div v-if="hasRecording && !isRecording" class="recording-bar__actions">
                <button type="button" class="recording-bar__btn" data-testid="try-again" @click="startRecording">
                  <span class="recording-bar__dot" aria-hidden="true" />
                  {{ t('learner.recording.tryAgain') }}
                </button>
              </div>
              <p class="recording-bar__hint recording-bar__hint--muted">{{ t('learner.recording.tryAgainHint') }}</p>
            </template>
          </div>
        </li>
      </ol>

      <div class="recording-bar__footer">
        <p class="recording-bar__status" role="status" aria-live="polite" data-testid="practice-status">{{ status }}</p>
        <p v-if="saveError" class="recording-bar__error" role="alert">{{ saveError }}</p>
        <button
          v-if="hasRecording && !isRecording"
          type="button"
          class="recording-bar__btn recording-bar__btn--quiet"
          data-testid="delete-recording"
          :disabled="isBusy"
          @click="emit('delete')"
        >
          {{ t('learner.recording.delete') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recording-bar {
  background: var(--accent-soft);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  margin: 0 0 var(--space-5);
}
.recording-bar--recording {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px var(--danger-soft);
}
.recording-bar__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.recording-bar__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  margin: 0;
  color: var(--ink);
}
.recording-bar__header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.recording-bar__toggle {
  background: none;
  border: none;
  padding: var(--space-1) var(--space-2);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--primary);
  text-decoration: underline;
  cursor: pointer;
  min-height: 32px;
}
.recording-bar__body {
  margin-top: var(--space-2);
}
.recording-bar__intro {
  font-size: var(--text-sm);
  color: var(--ink-2);
  margin: 0 0 var(--space-3);
}
.recording-bar__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.recording-bar__step {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  background: var(--surface);
  border: 2px solid transparent;
  border-radius: var(--radius);
  padding: var(--space-3);
}
.recording-bar__step--current {
  border-color: var(--primary);
}
.recording-bar__step--flash {
  animation: flash 0.8s ease 3;
}
@keyframes flash {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50% { box-shadow: 0 0 0 6px var(--success-soft); }
}
.recording-bar__badge {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--text-sm);
  background: var(--surface-3, var(--surface-2));
  color: var(--ink-2);
}
.recording-bar__step--current .recording-bar__badge {
  background: var(--primary);
  color: #fff;
}
.recording-bar__step--done .recording-bar__badge {
  background: var(--success);
  color: #fff;
}
.recording-bar__step-body {
  flex: 1;
  min-width: 0;
}
.recording-bar__step-title {
  font-size: var(--text-md);
  font-weight: 600;
  margin: 2px 0 var(--space-2);
  color: var(--ink);
}
.recording-bar__step audio {
  width: 100%;
  display: block;
}
.recording-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.recording-bar__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 40px;
  border: 1px solid var(--rule-strong);
  background: var(--surface);
  color: var(--ink);
  border-radius: var(--radius);
  padding: 0 var(--space-4);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.recording-bar__btn:hover {
  background: var(--surface-2);
}
.recording-bar__btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.recording-bar__btn--record {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.recording-bar__btn--record:hover {
  background: var(--primary-hover);
}
.recording-bar__btn--record .recording-bar__dot {
  background: #fff;
}
.recording-bar__btn--stop {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.recording-bar__btn--stop:hover {
  background: var(--danger);
  filter: brightness(0.92);
}
.recording-bar__btn--quiet {
  font-weight: 500;
  color: var(--ink-2);
}
.recording-bar__btn--mine {
  background: var(--success-soft);
  border-color: var(--success);
  color: var(--success);
  font-weight: 700;
}
.recording-bar__btn--mine:hover {
  filter: brightness(0.97);
}
.recording-bar__playback {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.recording-bar__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--danger);
  flex: none;
}
.recording-bar__square {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: #fff;
  flex: none;
}
.recording-bar__live {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--danger);
}
.recording-bar__live .recording-bar__dot {
  animation: pulse 1s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.recording-bar__hint {
  font-size: var(--text-xs);
  color: var(--ink-2);
  margin: var(--space-2) 0 0;
}
.recording-bar__hint--muted {
  color: var(--ink-3);
  margin: 0;
}
.recording-bar__error {
  font-size: var(--text-sm);
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin: var(--space-2) 0 0;
}
.recording-bar__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.recording-bar__footer .recording-bar__error {
  margin: 0;
  flex-basis: 100%;
}
.recording-bar__status {
  font-size: var(--text-xs);
  color: var(--ink-2);
  margin: 0;
  flex: 1;
  min-width: 12em;
}
.recording-bar__status:empty {
  display: none;
}

/* Child theme: bigger targets and a colour per step. */
.recording-bar--child .recording-bar__title {
  font-size: var(--text-xl);
}
.recording-bar--child .recording-bar__btn {
  min-height: 52px;
  font-size: var(--text-md);
  border-width: 2px;
}
.recording-bar--child .recording-bar__btn--record {
  box-shadow: 0 4px 0 var(--primary-hover);
}
.recording-bar--child .recording-bar__badge {
  width: 36px;
  height: 36px;
  font-size: var(--text-md);
  color: var(--ink);
}
.recording-bar--child .recording-bar__badge--1 { background: var(--tone-1); }
.recording-bar--child .recording-bar__badge--2 { background: var(--tone-2); }
.recording-bar--child .recording-bar__badge--3 { background: var(--tone-3); }
.recording-bar--child .recording-bar__badge--4 { background: var(--tone-4); color: #fff; }
.recording-bar--child .recording-bar__step--done .recording-bar__badge {
  background: var(--success);
  color: #fff;
}
.recording-bar--child .recording-bar__step-title {
  font-size: var(--text-lg);
}

@media (max-width: 640px) {
  .recording-bar {
    padding: var(--space-3);
  }
  .recording-bar__step {
    padding: var(--space-2) var(--space-3);
  }
}
</style>
