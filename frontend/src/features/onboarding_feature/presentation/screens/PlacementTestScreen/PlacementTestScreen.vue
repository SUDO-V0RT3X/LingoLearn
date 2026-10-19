<!--
  PlacementTestScreen.vue

  The placement test, a ladder that stops once it has found the learner's level,
  in three phases:
    - 'intro':   what the test is, how it works, the six levels, and a clear
                 Start (or Skip). It never starts without the learner's say.
    - 'test':    one question at a time, getting harder. Every 5 correct answers
                 reach the next level; a wrong answer (or a confirmed Quit) ends
                 the test at the level reached.
    - 'results': the level assigned by the server and its skill breakdown.

  It promises no number of questions and no duration, since it ends as soon as
  it finds the level. A reload carries on at the same question (the server keeps
  the unfinished attempt). The header is hidden here, so a small Sign out stays
  in the corner on every phase.

  Grading is server-side only: questions arrive without their answer key and
  with their options in a random order. Access refusals (setup not saved, or an
  under-13 learner without a linked guardian) send the learner to the right screen.
  For a confirmed child the screen is brighter and friendlier (theme tokens plus
  the `placement--child` modifier).
-->

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { placementTestStore } from './state/placementTestStore';
import { themeStore } from '@/features/shared/state/themeStore';
import { authStore } from '@/features/auth_feature/state/authStore';
import { forgetPlacement } from '@/features/shared/state/placementGate';
import { CONTENT_LEVELS } from '@/features/shared/models/contentType';
import { levelLabel } from '@/features/learner_experience/functions/learnerCopy';
import { routeForRefusal } from '@/features/onboarding_feature/functions/accessRefusal';
import { localizeServerMessage } from '@/i18n';

const router = useRouter();
const { t } = useI18n();
const store = placementTestStore();
const theme = themeStore();
const auth = authStore();

/**
 * Current visual phase. A new learner reads the intro first; one coming back
 * to an unfinished attempt goes straight to their question ('checking' while
 * that is looked up).
 */
const screenPhase = ref<'checking' | 'intro' | 'test' | 'results'>('checking');
/** Whether the learner came back to an unfinished attempt (a short notice says so). */
const resumed = ref(false);
/**
 * Messages are kept as a key (or the server's own words) and worded when shown,
 * so they follow the interface language if it changes while they are on screen.
 */
type ScreenMessage = { key: string } | { server: string };

/** Inline warning when Next is pressed without an answer (a message key). */
const validationKey = ref('');
const validationMessage = computed(() => (validationKey.value ? t(validationKey.value) : ''));
/** Error shown when a request fails. */
const errorSource = ref<ScreenMessage | null>(null);
const errorMessage = computed(() => {
  const source = errorSource.value;
  if (!source) return '';
  return 'key' in source ? t(source.key) : localizeServerMessage(source.server);
});

/** The server's error if it sent one, otherwise the given message key. */
function requestError(fallbackKey: string): ScreenMessage {
  return store.error?.message ? { server: store.error.message } : { key: fallbackKey };
}
/** True when the attempt can no longer continue and must be started again. */
const attemptLost = ref(false);
/** Whether the Start button is launching the test. */
const isStarting = ref(false);
/** Whether the Skip button is saving level 1. */
const isSkipping = ref(false);
/** Timer that auto-dismisses the level-unlock notice. */
let unlockBannerTimeout: ReturnType<typeof setTimeout> | null = null;

// The levels: the app's own scale (Explore, My learning and Level up use the same).
const LEVEL_COUNT = CONTENT_LEVELS.length;
const ladder = CONTENT_LEVELS.map((option) => ({ level: option.value, code: option.label }));

/** A child gets bigger type, brighter colours and friendlier words. */
const isChild = computed(() => theme.isChild);

/** A level's name, worded as everywhere else in the app: "Level 2 · A1+". */
function getLevelLabel(level: number): string {
  return levelLabel(level);
}

/** A level's short reference label ("A1+"). */
function levelCode(level: number): string {
  return CONTENT_LEVELS.find((option) => option.value === level)?.label ?? String(level);
}

// Breakdown skills the server sends, with wording in both languages.
const SKILLS = ['Grammar', 'Vocabulary'];
// The English ladder's section heading; the isiZulu ladder's headings are test content.
const ENGLISH_SECTION = 'Grammar & Vocabulary';

/** The level number of the result, from the server's number or else its label. */
const resultLevelNumber = computed<number | null>(() => {
  const result = store.result;
  if (!result) return null;
  if (result.levelNumber != null) return result.levelNumber;
  return CONTENT_LEVELS.find((option) => option.label === result.level)?.value ?? null;
});

/** The result's level, worded as everywhere else in the app. */
const resultLabel = computed(() => {
  if (resultLevelNumber.value != null) return getLevelLabel(resultLevelNumber.value);
  return store.result?.level || t('placement.completeLabel');
});

/** The result badge: the level's short label (A1+). */
const resultCode = computed(() => {
  if (resultLevelNumber.value != null) return levelCode(resultLevelNumber.value);
  return store.result?.level ?? '—';
});

/** A breakdown skill's name in the interface language. */
function skillName(skill: string): string {
  return SKILLS.includes(skill) ? t(`placement.skills.${skill}`) : skill;
}

/** A question's section heading, translated when it is interface wording. */
function sectionName(section: string): string {
  return section === ENGLISH_SECTION ? t('placement.sections.grammarVocabulary') : section;
}

/** Name of the level being tested now. */
const currentTierName = computed(() => getLevelLabel(store.currentLevelNumber));

/** Name of the level the learner is working toward. */
const nextTierName = computed(() => {
  if (store.currentLevelNumber >= 6) return t('placement.allLevelsUnlocked');
  return getLevelLabel(store.nextLevelNumber);
});

/** A short cheer for children, changing with each question. */
const cheer = computed(() => t(`placement.cheer${((store.currentIndex - 1) % 4) + 1}`));

/** Whether the current multiple-choice question actually has options to pick. */
const hasOptions = computed(() => (store.currentQuestion?.options?.length ?? 0) > 0);

/** Next stays disabled until there is an answer, as on a test. */
const hasAnswer = computed(() => store.selectedAnswer.trim() !== '');

/** Option letter from its position on screen (A, B, C, D). Never the option's id. */
function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Sends a refused learner to setup or to parent linking, depending on the refusal. */
async function handleRefusedEntry(): Promise<void> {
  await router.replace(routeForRefusal(store.refusal ?? 'parentLinkRequired'));
}

/** Starts the test after the learner presses Start. */
async function handleStartTest(): Promise<void> {
  errorSource.value = null;
  validationKey.value = '';
  attemptLost.value = false;
  isStarting.value = true;

  const success = await store.startTest();
  isStarting.value = false;

  if (store.isAccessBlocked) {
    await handleRefusedEntry();
    return;
  }

  if (success && store.currentQuestion) {
    screenPhase.value = 'test';
    await nextTick();
    document.getElementById('placement-question-heading')?.focus();
  } else {
    errorSource.value = requestError('placement.loadError');
  }
}

/** Selects an option and clears the validation warning. */
function selectOption(id: string): void {
  if (store.isSubmitting || store.isComplete) return;
  store.selectOption(id);
  validationKey.value = '';
}

/** Limits fill-in answers to 20 characters, even when pasted. */
function handleFillAnswerInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const answer = input.value.slice(0, 20);
  if (input.value !== answer) input.value = answer;
  store.selectOption(answer);
  validationKey.value = '';
}

/** Shows the right message after a failed request (and whether the attempt is lost). */
function showRequestError(): void {
  const status = store.error?.statusCode ?? 0;
  // 400 (already completed), 404 (attempt gone) and 409 (moved on) cannot be retried.
  attemptLost.value = status === 400 || status === 404 || status === 409;
  errorSource.value = { key: attemptLost.value ? 'placement.attemptLost' : 'placement.submitError' };
}

/** Checks there is an answer, then sends it for grading. */
async function handleNext(): Promise<void> {
  if (!store.currentQuestion || store.isSubmitting) return;

  if (!store.selectedAnswer.trim()) {
    validationKey.value = store.currentQuestion.type === 'fill-blank'
      ? 'placement.validationFill'
      : 'placement.validationSelect';
    return;
  }

  validationKey.value = '';
  errorSource.value = null;

  const success = await store.submitAnswer();
  // The welcome-back notice has done its job once the learner answers.
  if (success) resumed.value = false;

  if (store.isAccessBlocked) {
    await handleRefusedEntry();
    return;
  }

  if (!success && store.error) {
    showRequestError();
    return;
  }

  if (store.isComplete) {
    screenPhase.value = 'results';
    return;
  }

  if (store.currentQuestion) {
    await nextTick();
    document.getElementById('placement-question-heading')?.focus();
  }
}

/** Whether the "stop the test?" confirmation is open. */
const confirmingQuit = ref(false);
const quitDialog = ref<HTMLElement | null>(null);
const quitButton = ref<HTMLButtonElement | null>(null);
const keepGoingButton = ref<HTMLButtonElement | null>(null);

/** Quit opens a confirmation first: quitting ends the one-time test. */
async function askToQuit(): Promise<void> {
  if (store.isSubmitting) return;
  confirmingQuit.value = true;
  await nextTick();
  // Start on the safe choice.
  keepGoingButton.value?.focus();
}

/** Closes the confirmation and returns focus to Quit. */
async function cancelQuit(): Promise<void> {
  confirmingQuit.value = false;
  await nextTick();
  quitButton.value?.focus();
}

/** Keeps keyboard focus inside the confirmation, and lets Escape close it. */
function onQuitDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    void cancelQuit();
    return;
  }
  if (event.key !== 'Tab' || !quitDialog.value) return;
  const buttons = Array.from(quitDialog.value.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
  if (buttons.length === 0) return;
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Confirmed: ends the test at the level of the current question. */
async function handleQuitTest(): Promise<void> {
  if (store.isSubmitting) return;
  confirmingQuit.value = false;

  errorSource.value = null;
  const success = await store.quitTest();
  if (store.isAccessBlocked) {
    await handleRefusedEntry();
    return;
  }
  if (success && store.isComplete) {
    validationKey.value = '';
    screenPhase.value = 'results';
    return;
  }

  if (store.error) showRequestError();
}

/** Goes back to the intro so the learner can start a fresh attempt. */
function restartTest(): void {
  store.reset();
  errorSource.value = null;
  validationKey.value = '';
  attemptLost.value = false;
  screenPhase.value = 'intro';
}

/** Saves level 1 and goes to Explore without taking the test. */
async function handleSkipPlacement(): Promise<void> {
  if (isSkipping.value) return;
  errorSource.value = null;
  isSkipping.value = true;
  const skipped = await store.skipPlacement();
  isSkipping.value = false;
  if (store.isAccessBlocked) {
    await handleRefusedEntry();
    return;
  }
  if (skipped) {
    await router.replace({ name: 'explore', query: { placementSkipped: 'true' } });
    return;
  }
  errorSource.value = requestError('placement.loadError');
}

/** Results: on to Explore. */
async function continueToExplore(): Promise<void> {
  await router.replace({ name: 'explore' });
}

/** The header is hidden here, so this is the way out: sign out, as the header does. */
const signingOut = ref(false);
async function signOut(): Promise<void> {
  if (signingOut.value) return;
  signingOut.value = true;
  try {
    await auth.logout();
  } finally {
    forgetPlacement();
    signingOut.value = false;
    await router.push({ name: 'signIn' });
  }
}

/** Closes the level-unlock notice. */
function dismissUnlockToast(): void {
  if (unlockBannerTimeout) {
    clearTimeout(unlockBannerTimeout);
    unlockBannerTimeout = null;
  }
  store.clearUnlockedLevel();
}

// Auto-dismiss the level-unlock notice after a few seconds.
watch(
  () => store.unlockedLevel,
  (newLevel) => {
    if (newLevel) {
      if (unlockBannerTimeout) clearTimeout(unlockBannerTimeout);
      unlockBannerTimeout = setTimeout(() => {
        store.clearUnlockedLevel();
        unlockBannerTimeout = null;
      }, 7000);
    }
  },
);

onMounted(async () => {
  // Begin with a clean store, then carry on with an unfinished attempt if there is one.
  store.reset();
  const restored = await store.resumeTest();
  if (store.isAccessBlocked) {
    await handleRefusedEntry();
    return;
  }
  if (restored && store.currentQuestion) {
    resumed.value = true;
    screenPhase.value = 'test';
    await nextTick();
    document.getElementById('placement-question-heading')?.focus();
    return;
  }
  // Nothing to carry on (or it could not be checked): the learner reads the intro.
  store.error = null;
  screenPhase.value = 'intro';
});

onBeforeUnmount(() => {
  // Do not let the notice timer outlive the screen.
  if (unlockBannerTimeout) clearTimeout(unlockBannerTimeout);
  unlockBannerTimeout = null;
});
</script>

<template>
  <main class="ui-page ui-page--narrow placement" :class="{ 'placement--child': isChild }">
    <!-- The header is hidden on this screen: signing out is the one way out. -->
    <div class="placement__bar">
      <button
        type="button"
        class="ui-btn ui-btn--ghost ui-btn--sm placement__signout"
        data-testid="placement-sign-out"
        :disabled="signingOut"
        @click="signOut"
      >{{ signingOut ? t('common.account.signingOut') : t('common.account.signOut') }}</button>
    </div>

    <!-- ── LOOKING FOR AN UNFINISHED ATTEMPT ─────────────────── -->
    <section v-if="screenPhase === 'checking'" class="ui-card placement__state" role="status" aria-busy="true">
      <span class="ui-spinner" aria-hidden="true"></span>
      <p>{{ t('placement.preparing') }}</p>
    </section>

    <!-- ── INTRO ─────────────────────────────────────────────── -->
    <section
      v-else-if="screenPhase === 'intro'"
      class="placement__intro"
      aria-labelledby="placement-intro-heading"
    >
      <header class="placement__head">
        <p class="ui-eyebrow">{{ t('placement.introHeroTag') }}</p>
        <h1 id="placement-intro-heading" class="ui-title">
          {{ isChild ? t('placement.introTitleChild') : t('placement.introTitle') }}
        </h1>
        <p class="ui-subtitle">
          {{ isChild ? t('placement.introSubtitleChild') : t('placement.introSubtitle') }}
        </p>
        <ul class="placement__facts" :aria-label="t('placement.brandSection')">
          <li class="ui-chip placement__fact"><span class="placement__fact-mark placement__fact-mark--steps" aria-hidden="true"></span>{{ t('placement.factHarder') }}</li>
          <li class="ui-chip placement__fact"><span class="placement__fact-mark placement__fact-mark--time" aria-hidden="true"></span>{{ t('placement.factStops') }}</li>
          <li class="ui-chip placement__fact"><span class="placement__fact-mark" aria-hidden="true"></span>{{ t('placement.levelCount', { count: LEVEL_COUNT }) }}</li>
        </ul>
      </header>

      <section class="ui-card placement__how" aria-labelledby="placement-how-heading">
        <h2 id="placement-how-heading" class="ui-section-title">{{ t('placement.introHowItWorksTitle') }}</h2>
        <ol class="placement__how-list">
          <li v-for="n in 4" :key="n" class="placement__how-item">
            <span class="placement__how-mark" aria-hidden="true">{{ n }}</span>
            <div>
              <h3 class="placement__how-title">{{ t(`placement.card${n}Title${isChild ? 'Child' : ''}`) }}</h3>
              <p class="placement__how-desc">{{ t(`placement.card${n}Desc${isChild ? 'Child' : ''}`) }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="ui-card ui-card--sunken placement__ladder" aria-labelledby="placement-ladder-heading">
        <h2 id="placement-ladder-heading" class="ui-section-title">{{ t('placement.ladderTitle') }}</h2>
        <ol class="placement__ladder-list">
          <li
            v-for="step in ladder"
            :key="step.level"
            class="placement__rung"
            :class="`placement__rung--${step.level}`"
          >
            <span class="placement__rung-level">{{ t('common.level', { level: step.level }) }}</span>
            <span class="placement__rung-name">{{ step.code }}</span>
          </li>
        </ol>
      </section>

      <div v-if="errorMessage" class="ui-alert ui-alert--error" role="alert">{{ errorMessage }}</div>

      <div class="placement__actions">
        <button
          type="button"
          class="ui-btn ui-btn--ghost"
          data-testid="skip-placement"
          :disabled="isSkipping || isStarting"
          @click="handleSkipPlacement"
        >
          {{ isSkipping ? t('placement.skipping') : t('placement.skip') }}
        </button>
        <button
          type="button"
          class="ui-btn ui-btn--primary ui-btn--lg"
          data-testid="start-placement"
          :disabled="isStarting || isSkipping"
          @click="handleStartTest"
        >
          <span v-if="isStarting" class="ui-spinner placement__btn-spinner" aria-hidden="true"></span>
          {{ isStarting ? t('placement.starting') : t('placement.startTestBtn') }}
        </button>
      </div>
    </section>

    <!-- ── LOADING ───────────────────────────────────────────── -->
    <section v-else-if="store.isLoading" class="ui-card placement__state" role="status" aria-busy="true">
      <span class="ui-spinner" aria-hidden="true"></span>
      <p>{{ t('placement.preparing') }}</p>
    </section>

    <!-- ── TEST ──────────────────────────────────────────────── -->
    <section
      v-else-if="screenPhase === 'test' && !store.isComplete && store.currentQuestion"
      class="placement__test"
      aria-labelledby="placement-question-heading"
    >
      <!-- Progress toward the next level -->
      <section class="ui-card placement__progress" :aria-label="t('placement.brandSection')">
        <div class="placement__progress-top">
          <span class="ui-badge ui-badge--brand" aria-live="polite">
            {{ t('placement.questionCounter', { current: store.currentIndex }) }}
          </span>
          <span class="placement__goal">
            {{ t('placement.tierProgressText', { answered: store.tierQuestionIndex, nextLevel: nextTierName }) }}
          </span>
        </div>

        <div
          class="ui-progress placement__track"
          role="progressbar"
          :aria-valuenow="store.tierQuestionIndex"
          aria-valuemin="1"
          aria-valuemax="5"
          :aria-label="t('placement.tierProgressText', { answered: store.tierQuestionIndex, nextLevel: nextTierName })"
        >
          <div class="ui-progress__bar placement__track-bar" :style="{ width: store.tierProgressPercent + '%' }">
            <span class="placement__track-head" aria-hidden="true"></span>
          </div>
        </div>

        <ol class="placement__pips" aria-hidden="true">
          <li
            v-for="step in 5"
            :key="step"
            class="placement__pip"
            :class="{
              'placement__pip--done': step < store.tierQuestionIndex,
              'placement__pip--current': step === store.tierQuestionIndex,
            }"
          >
            <span v-if="step < store.tierQuestionIndex" class="placement__tick"></span>
            <span v-else>{{ step }}</span>
          </li>
        </ol>

        <div class="placement__levels">
          <span><span class="placement__levels-label">{{ t('placement.currentLevelLabel') }}:</span> <strong>{{ currentTierName }}</strong></span>
          <span><span class="placement__levels-label">{{ t('placement.nextLevelLabel') }}:</span> <strong>{{ nextTierName }}</strong></span>
        </div>
      </section>

      <p v-if="resumed" class="ui-alert ui-alert--info" role="status" data-testid="placement-resumed">
        {{ t('placement.resumed') }}
      </p>

      <!-- Level unlocked -->
      <Transition name="placement-pop">
        <div
          v-if="store.unlockedLevel"
          class="ui-alert ui-alert--success placement__unlock"
          role="status"
          aria-live="polite"
        >
          <span class="placement__unlock-mark" aria-hidden="true"></span>
          <div class="placement__unlock-text">
            <h2 class="placement__unlock-title">
              {{ t('placement.levelUnlockToast', { level: store.unlockedLevel, label: levelCode(store.unlockedLevel) }) }}
            </h2>
            <p>{{ t('placement.levelUnlockSubtitle') }}</p>
          </div>
          <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" @click="dismissUnlockToast">
            {{ t('placement.dismiss') }}
          </button>
        </div>
      </Transition>

      <!-- The question -->
      <article class="ui-card placement__question">
        <div class="placement__question-top">
          <p class="ui-eyebrow">{{ sectionName(store.currentQuestion.section) }}</p>
          <span class="ui-chip">{{ currentTierName }} · {{ t('placement.tierStep', { step: store.tierQuestionIndex }) }}</span>
        </div>

        <p v-if="isChild" class="placement__cheer">{{ cheer }}</p>
        <p class="placement__instruction">{{ store.currentQuestion.instructions }}</p>

        <h1 id="placement-question-heading" class="placement__prompt" tabindex="-1">
          {{ store.currentQuestion.prompt }}
        </h1>

        <!-- Multiple choice -->
        <fieldset
          v-if="store.currentQuestion.type === 'multiple-choice' && hasOptions"
          class="placement__options"
          :disabled="store.isSubmitting"
        >
          <legend class="ui-sr-only">{{ t('placement.answerOptionsLegend') }}</legend>
          <label
            v-for="(opt, i) in store.currentQuestion.options"
            :key="opt.id"
            class="placement__option"
            :class="[`placement__option--tone-${(i % 4) + 1}`, {
              'placement__option--selected': store.selectedAnswer === opt.id,
              'placement__option--disabled': store.isSubmitting,
            }]"
          >
            <input
              type="radio"
              name="placement-answer"
              :value="opt.id"
              :checked="store.selectedAnswer === opt.id"
              :disabled="store.isSubmitting"
              @change="selectOption(opt.id)"
            />
            <span class="placement__option-letter" aria-hidden="true">{{ optionLetter(i) }}</span>
            <span class="placement__option-text">{{ opt.text }}</span>
          </label>
        </fieldset>

        <!-- Fill in the blank -->
        <div v-else-if="store.currentQuestion.type === 'fill-blank'" class="ui-field">
          <label class="ui-sr-only" for="placement-fill">{{ t('placement.fillBlankLabel') }}</label>
          <input
            id="placement-fill"
            :value="store.selectedAnswer"
            class="ui-input placement__fill"
            type="text"
            maxlength="20"
            autocomplete="off"
            :placeholder="t('placement.fillBlankPlaceholder')"
            :disabled="store.isSubmitting"
            @input="handleFillAnswerInput"
            @keydown.enter.prevent="handleNext"
          />
        </div>

        <!-- A question with nothing to answer: never a dead end -->
        <div v-else class="ui-alert ui-alert--warning" data-testid="no-options">{{ t('placement.noOptions') }}</div>

        <p v-if="validationMessage" class="ui-alert ui-alert--warning" data-testid="answer-validation" role="alert">
          {{ validationMessage }}
        </p>

        <div v-if="errorMessage" class="ui-alert ui-alert--error placement__error" role="alert">
          <span>{{ errorMessage }}</span>
          <button v-if="attemptLost" type="button" class="ui-btn ui-btn--sm" @click="restartTest">
            {{ t('placement.restart') }}
          </button>
        </div>

        <nav class="placement__nav">
          <button
            ref="quitButton"
            type="button"
            class="ui-btn ui-btn--ghost"
            data-testid="quit-placement-test"
            aria-haspopup="dialog"
            :disabled="store.isSubmitting"
            @click="askToQuit"
          >
            {{ t('placement.quit') }}
          </button>

          <span class="placement__active-level" data-testid="active-placement-level">
            {{ t('placement.currentLevelLabel') }}: {{ currentTierName }}
          </span>

          <button
            type="button"
            class="ui-btn ui-btn--primary ui-btn--lg"
            data-testid="next-question"
            :disabled="store.isSubmitting || attemptLost || !hasAnswer"
            @click="handleNext"
          >
            <span v-if="store.isSubmitting" class="ui-spinner placement__btn-spinner" aria-hidden="true"></span>
            {{ store.isSubmitting ? t('placement.checking') : t('placement.next') }}
          </button>
        </nav>
      </article>

      <!-- Quitting ends the one-time test, so it asks first. -->
      <div v-if="confirmingQuit" class="placement__overlay" role="presentation" @click.self="cancelQuit">
        <section
          ref="quitDialog"
          class="ui-card placement__dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="placement-quit-title"
          aria-describedby="placement-quit-body"
          data-testid="quit-confirm"
          @keydown="onQuitDialogKeydown"
        >
          <h2 id="placement-quit-title" class="ui-section-title placement__dialog-title">{{ t('placement.quitConfirmTitle') }}</h2>
          <p id="placement-quit-body" class="placement__dialog-body">
            {{ t(isChild ? 'placement.quitConfirmBodyChild' : 'placement.quitConfirmBody', { level: currentTierName }) }}
          </p>
          <div class="placement__dialog-actions">
            <button type="button" class="ui-btn ui-btn--ghost" data-testid="quit-confirm-yes" @click="handleQuitTest">
              {{ t('placement.quitConfirmYes') }}
            </button>
            <button ref="keepGoingButton" type="button" class="ui-btn ui-btn--primary" data-testid="quit-confirm-no" @click="cancelQuit">
              {{ t('placement.quitConfirmNo') }}
            </button>
          </div>
        </section>
      </div>
    </section>

    <!-- ── RESULTS ───────────────────────────────────────────── -->
    <section
      v-else-if="store.isComplete || screenPhase === 'results'"
      class="ui-card placement__results"
      data-testid="placement-results"
      aria-labelledby="placement-result-heading"
    >
      <p class="ui-eyebrow" data-testid="result-eyebrow">{{ t('placement.resultTitle') }}</p>
      <div class="placement__level-badge" aria-hidden="true">{{ resultCode }}</div>
      <h1 id="placement-result-heading" class="placement__result-heading">
        {{ isChild ? t('placement.resultHeadingChild') : t('placement.resultHeading') }}
      </h1>
      <p class="placement__result-label" data-testid="result-level">{{ resultLabel }}</p>
      <p class="ui-subtitle placement__result-caption">
        {{ isChild ? t('placement.resultCaptionChild') : t('placement.resultCaption') }}
      </p>

      <ul v-if="store.result?.breakdown?.length" class="placement__breakdown">
        <li v-for="row in store.result.breakdown" :key="row.skill" class="placement__breakdown-row">
          <span>{{ skillName(row.skill) }}</span>
          <span class="ui-badge ui-badge--brand">{{ row.level }}</span>
        </li>
      </ul>

      <button
        type="button"
        class="ui-btn ui-btn--primary ui-btn--lg placement__continue"
        data-testid="continue-to-explore"
        @click="continueToExplore"
      >
        {{ t('placement.continueToExplore') }}
      </button>
    </section>

    <!-- ── NOTHING TO SHOW (e.g. the test ended without a question) ── -->
    <section v-else class="ui-card ui-empty" data-testid="placement-empty">
      <p class="ui-empty__title">{{ t('placement.loadError') }}</p>
      <button type="button" class="ui-btn ui-btn--primary" @click="restartTest">{{ t('placement.restart') }}</button>
    </section>
  </main>
</template>

<style scoped>
.placement {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.placement__intro,
.placement__test {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* ---------------------------------------------------------- sign out */
/* A quiet text button in the corner; the header is hidden on this screen. */
.placement__bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: calc(-1 * var(--space-2));
}

.placement__signout {
  color: var(--ink-2);
}

/* ---------------------------------------------------------- intro */
.placement__head {
  margin-bottom: var(--space-2);
}

.placement__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
}

.placement__fact {
  font-size: var(--text-sm);
  padding: var(--space-1) var(--space-3);
}

/* Small drawn marks instead of icons: a dot, a clock face, a stair. */
.placement__fact-mark {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--accent);
}

.placement__fact-mark--time {
  width: 10px;
  height: 10px;
  background: transparent;
  border: 2px solid var(--primary);
}

.placement__fact-mark--steps {
  width: 10px;
  height: 10px;
  border-radius: 1px;
  background: linear-gradient(to top right, var(--tone-2) 50%, transparent 50%);
}

.placement__how-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-4);
  list-style: none;
  margin: 0;
  padding: 0;
}

.placement__how-item {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.placement__how-mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--primary-soft);
  color: var(--primary);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-sm);
}

.placement__how-title {
  margin: 0 0 var(--space-1);
  font-size: var(--text-md);
}

.placement__how-desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--ink-2);
}

.placement__ladder-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.placement__rung {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--tone-1);
}

.placement__rung--2 { border-left-color: var(--tone-2); }
.placement__rung--3 { border-left-color: var(--tone-3); }
.placement__rung--4 { border-left-color: var(--tone-4); }
.placement__rung--5 { border-left-color: var(--tone-5); }
.placement__rung--6 { border-left-color: var(--accent); }

.placement__rung-level {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.placement__rung-name {
  font-weight: 600;
  color: var(--ink);
}

.placement__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-3);
}

.placement__btn-spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

.placement__state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.placement__state p {
  margin: 0;
}

/* ---------------------------------------------------------- progress */
.placement__progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
}

.placement__progress-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.placement__goal {
  font-size: var(--text-sm);
  color: var(--ink-2);
}

.placement__track-bar {
  position: relative;
}

.placement__track-head {
  display: none;
}

.placement__pips {
  display: flex;
  justify-content: space-between;
  list-style: none;
  margin: 0;
  padding: 0;
}

.placement__pip {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--rule-strong);
  background: var(--surface);
  color: var(--ink-3);
  font-size: var(--text-xs);
  font-weight: 700;
}

.placement__pip--done {
  background: var(--success);
  border-color: var(--success);
  color: var(--on-primary);
}

.placement__pip--current {
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: var(--focus-ring);
}

/* A tick drawn with two borders. */
.placement__tick {
  display: block;
  width: 6px;
  height: 11px;
  margin-top: -2px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
}

.placement__levels {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.placement__levels-label {
  color: var(--ink-3);
}

/* ---------------------------------------------------------- unlock notice */
.placement__unlock {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.placement__unlock-mark {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--success);
  position: relative;
}

.placement__unlock-mark::after {
  content: '';
  position: absolute;
  left: 10px;
  top: 6px;
  width: 6px;
  height: 11px;
  border-right: 2px solid var(--on-primary);
  border-bottom: 2px solid var(--on-primary);
  transform: rotate(45deg);
}

.placement__unlock-text {
  flex: 1;
}

.placement__unlock-title {
  margin: 0;
  font-size: var(--text-md);
  color: inherit;
}

.placement__unlock-text p {
  margin: 2px 0 0;
}

.placement-pop-enter-active,
.placement-pop-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.placement-pop-enter-from,
.placement-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---------------------------------------------------------- question */
.placement__question {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.placement__question-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.placement__question-top .ui-eyebrow {
  margin: 0;
}

.placement__instruction {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.placement__prompt {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 600;
  line-height: 1.3;
}

.placement__prompt:focus {
  outline: none;
}

.placement__options {
  display: grid;
  gap: var(--space-2);
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.placement__option {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.placement__option:hover {
  border-color: var(--primary);
}

.placement__option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.placement__option:has(input:focus-visible) {
  box-shadow: var(--focus-ring);
}

.placement__option-letter {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
  font-weight: 700;
  font-size: var(--text-sm);
}

.placement__option-text {
  font-size: var(--text-md);
  color: var(--ink);
}

.placement__option--selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: inset 0 0 0 1px var(--primary);
}

.placement__option--selected .placement__option-letter {
  background: var(--primary);
  color: var(--on-primary);
}

.placement__option--disabled {
  cursor: progress;
  opacity: 0.7;
}

.placement__fill {
  font-size: var(--text-lg);
  max-width: 360px;
}

.placement__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.placement__nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--rule);
}

.placement__active-level {
  font-size: var(--text-sm);
  color: var(--ink-3);
}

/* ---------------------------------------------------------- quit confirmation */
.placement__overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: color-mix(in srgb, var(--ink) 50%, transparent);
}

.placement__dialog {
  width: min(460px, 100%);
  box-shadow: var(--shadow-2);
}

.placement__dialog-title {
  margin: 0 0 var(--space-2);
}

.placement__dialog-body {
  margin: 0;
  color: var(--ink-2);
}

.placement__dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

/* ---------------------------------------------------------- results */
.placement__results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-5);
  text-align: center;
}

.placement__level-badge {
  display: grid;
  place-items: center;
  width: 112px;
  height: 112px;
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--on-primary);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 700;
  box-shadow: 0 0 0 8px var(--primary-soft);
  margin: var(--space-2) 0;
}

.placement__result-heading {
  margin: 0;
  font-size: var(--text-2xl);
}

.placement__result-label {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--primary);
}

.placement__result-caption {
  margin: 0;
}

.placement__breakdown {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  max-width: 320px;
  list-style: none;
  margin: var(--space-2) 0;
  padding: 0;
}

.placement__breakdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: var(--text-sm);
}

.placement__continue {
  margin-top: var(--space-2);
}

/* ---------------------------------------------------------- child */
.placement--child .ui-title {
  color: var(--primary);
}

.placement--child .ui-subtitle {
  font-size: var(--text-lg);
}

.placement--child .placement__how-mark {
  background: var(--tone-2);
  color: var(--ink);
}

.placement--child .placement__how-item:nth-child(2) .placement__how-mark { background: var(--tone-3); }
.placement--child .placement__how-item:nth-child(3) .placement__how-mark { background: var(--tone-4); color: var(--on-primary); }
.placement--child .placement__how-item:nth-child(4) .placement__how-mark { background: var(--tone-5); color: var(--on-primary); }

/* A chunky, rainbow progress bar with a bouncing ball at its head. */
.placement--child .placement__track {
  height: 22px;
  overflow: visible;
  border: 2px solid var(--rule-strong);
}

.placement--child .placement__track-head {
  display: block;
  position: absolute;
  right: -12px;
  top: 50%;
  width: 26px;
  height: 26px;
  margin-top: -13px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  border: 3px solid var(--surface);
  box-shadow: var(--shadow-2);
  animation: placement-bounce 1.4s ease-in-out infinite;
}

@keyframes placement-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.placement--child .placement__pip {
  width: 34px;
  height: 34px;
  border-width: 2px;
  font-size: var(--text-sm);
}

.placement--child .placement__pip--done:nth-child(1) { background: var(--tone-1); border-color: var(--tone-1); }
.placement--child .placement__pip--done:nth-child(2) { background: var(--tone-2); border-color: var(--tone-2); }
.placement--child .placement__pip--done:nth-child(3) { background: var(--tone-3); border-color: var(--tone-3); }
.placement--child .placement__pip--done:nth-child(4) { background: var(--tone-4); border-color: var(--tone-4); }

.placement__cheer {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--accent);
}

.placement--child .placement__prompt {
  font-size: var(--text-3xl);
}

.placement--child .placement__question {
  border-width: 2px;
  box-shadow: var(--shadow-2);
}

.placement--child .placement__option {
  border-width: 2px;
  padding: var(--space-4);
}

.placement--child .placement__option-letter {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-pill);
  color: var(--on-primary);
  font-size: var(--text-lg);
  background: var(--tone-1);
}

.placement--child .placement__option--tone-2 .placement__option-letter { background: var(--tone-3); }
.placement--child .placement__option--tone-3 .placement__option-letter { background: var(--tone-4); }
.placement--child .placement__option--tone-4 .placement__option-letter { background: var(--tone-5); }

.placement--child .placement__option-text {
  font-size: var(--text-lg);
  font-weight: 600;
}

.placement--child .placement__option--selected {
  transform: scale(1.01);
}

.placement--child .placement__level-badge {
  background: linear-gradient(135deg, var(--tone-4), var(--tone-5));
  box-shadow: 0 0 0 8px var(--accent-soft), 0 0 0 16px var(--primary-soft);
}

@media (max-width: 560px) {
  .placement__question {
    padding: var(--space-5) var(--space-4);
  }

  .placement__prompt {
    font-size: var(--text-xl);
  }

  .placement--child .placement__prompt {
    font-size: var(--text-2xl);
  }

  .placement__nav {
    justify-content: stretch;
  }

  .placement__nav .ui-btn--primary {
    flex: 1;
  }

  .placement__active-level {
    order: -1;
    width: 100%;
  }
}
</style>
