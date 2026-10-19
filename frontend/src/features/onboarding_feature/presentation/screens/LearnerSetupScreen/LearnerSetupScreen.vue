<script setup lang="ts">
// Import Vue Composition API functions for lifecycle hooks and reactivity
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
// Import storeToRefs to safely destructure reactive properties from Pinia
import { storeToRefs } from 'pinia';
// Import the specific store managing the learner setup data
import { learnerSetupStore } from './state/learnerSetupStore';
// Import translation access for labels and status messages in the form.
import { useI18n } from 'vue-i18n';
// Import the locale setter that applies a saved or newly selected UI language.
import { localizeServerMessage, setInterfaceLocale } from '@/i18n';
// A learner of English reads the app in English; a learner of isiZulu chooses.
import { learnerInterfaceLanguage } from '@/features/onboarding_feature/functions/learnerInterfaceLanguage';
// Import route replacement so setup can direct learners to the next permitted screen.
import { useRoute, useRouter } from 'vue-router';
// Import authentication state so the theme can be worked out again after a save.
import { authStore } from '@/features/auth_feature/state/authStore';
// Import the theme store: a confirmed child gets the child theme and friendlier copy.
import { themeStore } from '@/features/shared/state/themeStore';
// Import the languages on offer (English and isiZulu).
import { TARGET_LANGUAGES } from '@/features/onboarding_feature/models/OnboardingTypes';
// Whether the date typed in makes the learner a child, for the steps and the warning.
import { isUnder13 } from '@/features/onboarding_feature/functions/age';
// The shell's short confirmation, shown once the screen has moved on.
import { toastStore } from '@/features/shared/state/toastStore';
// The browser's own field checks, worded in the interface language.
import { clearValidity, localizeValidity } from '@/features/shared/presentation/forms/localizedValidity';

// Create the reactive store instance that owns onboarding preferences and access.
const store = learnerSetupStore();
// Read the signed-in learner, used to refresh the theme after saving.
const auth = authStore();
// The theme decides whether this learner sees the child version of the screen.
const theme = themeStore();
// Create the router instance used for access refusal and successful completion.
const router = useRouter();
// The current route: `from` says a learning page sent the learner here.
const route = useRoute();
// Says "Settings saved" after the screen has moved on.
const toast = toastStore();
// Retrieve translated text from vue-i18n.
const { t, locale } = useI18n();
// Convert store fields to refs so template bindings remain reactive after destructuring.
const { form, isLoading, isSaving, error, saved, loaded } = storeToRefs(store);

// A child sees bigger, friendlier copy; the colours come from the child theme.
const isChild = computed(() => theme.isChild);
// The first visit shows the journey: plan, then placement test, with a grown-up's
// link in between for a child.
const isFirstSetup = computed(() => loaded.value && !store.hasSavedSettings);
// Whether the date of birth in the form makes this learner a child (null while
// it is empty or half typed).
const formIsChild = computed(() => isUnder13(form.value.dateOfBirth));
// The steps of a new learner's journey. A child needs a grown-up linked before
// the placement test, so they have three.
const journeySteps = computed(() => formIsChild.value
  ? ['setup.stepPlan', 'setup.stepGrownUp', 'setup.stepPlacement']
  : ['setup.stepPlan', 'setup.stepPlacement']);
// A learning page sent the learner here because setup isn't finished.
const sentFromLearningPage = computed(() => typeof route.query.from === 'string' && route.query.from !== '');
// Set up, under 13 and no grown-up linked yet: content waits for the link, but
// this screen stays open so a mistyped date of birth can be corrected.
const waitingForGrownUp = computed(() =>
  store.hasSavedSettings && store.access != null && !store.access.canAccessContent);
// Today, for the date input's upper bound.
const today = new Date().toISOString().slice(0, 10);
// The two-letter mark drawn on each language card.
const languageMarks: Record<string, string> = { english: 'En', zulu: 'Zu' };
// Quick choices for the daily goal, in minutes.
const goalPresets = [5, 10, 15, 30];

// The error to show under the form, in the learner's words rather than the server's.
const errorText = computed(() => {
  if (!error.value) return '';
  if (error.value.statusCode === 403 && error.value.message?.includes('date of birth')) {
    return t('setup.dateOfBirthLockedError');
  }
  if (error.value.statusCode === 400) return t('setup.invalidError');
  return localizeServerMessage(error.value.message) || t('common.states.genericError');
});

// Loads saved preferences and the server-computed child access policy. A child
// still waiting for a grown-up's link stays here (with a way to the link page),
// so they can always correct their date of birth while nobody is linked.
async function loadSetup() {
  await store.load();
}

// Fetch existing user preferences when the component is first rendered
onMounted(loadSetup);

// ---- the "this makes you a child" check ----

// Open while the learner is asked to confirm a date that turns child mode on.
const confirmingChild = ref(false);
const confirmButton = ref<HTMLButtonElement | null>(null);
const dateInput = ref<HTMLInputElement | null>(null);

/**
 * Saving a date that makes the learner under 13 when they weren't before turns
 * child mode on and sends them to link a grown-up before they can read, so it
 * is confirmed first: a mistyped year must not land an adult there unawares.
 * A child already known to be under 13 is not asked again.
 */
const needsChildConfirmation = computed(() =>
  !store.dateOfBirthLocked
  && formIsChild.value === true
  && !(store.hasSavedSettings && store.access?.isUnder13 === true));

function closeChildConfirmation() {
  confirmingChild.value = false;
  void nextTick(() => dateInput.value?.focus());
}

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && confirmingChild.value) closeChildConfirmation();
}
onMounted(() => document.addEventListener('keydown', onDialogKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onDialogKeydown));

async function submitSetup() {
  if (needsChildConfirmation.value) {
    confirmingChild.value = true;
    await nextTick();
    confirmButton.value?.focus();
    return;
  }
  await saveSetup();
}

async function confirmChildAndSave() {
  confirmingChild.value = false;
  await saveSetup();
}

async function saveSetup() {
  // Continue only when the server confirms that submitted preferences were saved.
  if (!(await store.save())) return;

  // The date of birth may have made this learner a child (or not): work the theme out again.
  try {
    theme.invalidate();
    await theme.refreshFor(auth.currentUser);
  } catch {
    // The theme is cosmetic; never block the journey on it.
  }

  // First save: placement test (unless already placed); later saves: Explore;
  // a blocked under-13 learner: parent linking. The screen is gone by the time
  // anyone reads its own "saved" line, so the shell says it instead.
  const destination = await store.destinationAfterSave();
  if (!store.lastSaveWasFirst) toast.show('setup.savedToast');
  await router.replace(destination);
}

// Keep vue-i18n synchronized with the interface-language preference.
watch(() => form.value.interfaceLanguage, (language) => {
  // Apply only supported locale values to the application's shared translator.
  if ((language === 'english' || language === 'zulu') && language !== locale.value) {
    // Update global copy immediately when the learner changes this preference.
    setInterfaceLocale(language);
  }
}, { immediate: true });

// Learners have no language switch in the header: this screen is where they
// choose, and only while they learn isiZulu. Choosing English to learn turns
// the interface English (and remembers the isiZulu learner's choice); choosing
// isiZulu again brings that choice back (English when there was none).
let choiceWhileLearningZulu = 'english';
watch(() => form.value.targetLanguage, (target, previous) => {
  if (target === 'english') {
    if (previous !== 'english' && form.value.interfaceLanguage) choiceWhileLearningZulu = form.value.interfaceLanguage;
    form.value.interfaceLanguage = 'english';
  } else if (target === 'zulu' && previous === 'english') {
    form.value.interfaceLanguage = choiceWhileLearningZulu;
  }
});

// Leaving without saving: the interface goes back to what the saved settings
// say, so a choice tried here and not saved does not stay behind.
onBeforeUnmount(() => {
  const settings = store.settings;
  if (settings) setInterfaceLocale(learnerInterfaceLanguage(settings.target_language, settings.interface_language));
});
</script>

<template>
  <main class="ui-page ui-page--narrow setup" :class="{ 'setup--child': isChild }">
    <header class="setup__head">
      <p class="ui-eyebrow">{{ isFirstSetup ? t('setup.eyebrowFirst', { total: journeySteps.length }) : t('setup.eyebrow') }}</p>
      <h1 class="ui-title">{{ isChild ? t('setup.titleChild') : t('setup.title') }}</h1>
      <p class="ui-subtitle">{{ isChild ? t('setup.subtitleChild') : t('setup.subtitle') }}</p>

      <!-- The steps of a new learner's journey: three for a child, two otherwise. -->
      <ol v-if="isFirstSetup" class="setup__steps" :aria-label="t('setup.stepsLabel')" data-testid="setup-steps">
        <template v-for="(step, index) in journeySteps" :key="step">
          <li v-if="index > 0" class="setup__step-line" aria-hidden="true"></li>
          <li class="setup__step" :class="{ 'setup__step--current': index === 0 }" :aria-current="index === 0 ? 'step' : undefined">
            <span class="setup__step-mark" aria-hidden="true">{{ index + 1 }}</span>{{ t(step) }}
          </li>
        </template>
      </ol>
    </header>

    <!-- A learning page sent the learner here: say why nothing else opened. -->
    <p v-if="sentFromLearningPage && !waitingForGrownUp" class="ui-alert ui-alert--info setup__notice" role="status" data-testid="setup-from-hint">
      {{ t('setup.finishFirst') }}
    </p>

    <!-- Under 13 with no grown-up linked: reading waits, settings stay open. -->
    <div v-if="waitingForGrownUp" class="ui-alert ui-alert--info setup__notice" role="status" data-testid="setup-waiting-for-grown-up">
      <p>{{ t('setup.waitingForGrownUp') }}</p>
      <RouterLink :to="{ name: 'parentLinking', query: { blocked: 'under13' } }" class="ui-btn ui-btn--primary ui-btn--sm">
        {{ t('setup.linkGrownUp') }}
      </RouterLink>
    </div>

    <!-- Loading -->
    <section v-if="isLoading || (!loaded && !error)" class="ui-card setup__state" role="status" aria-live="polite">
      <span class="ui-spinner" aria-hidden="true"></span>
      <p>{{ t('setup.loading') }}</p>
    </section>

    <!-- Could not load: never show a form that might overwrite unknown settings. -->
    <section v-else-if="!loaded" class="ui-card ui-empty" data-testid="setup-load-error">
      <p class="ui-empty__title">{{ t('setup.loadErrorTitle') }}</p>
      <p>{{ errorText }}</p>
      <button type="button" class="ui-btn ui-btn--primary" @click="loadSetup">{{ t('setup.retry') }}</button>
    </section>

    <form
      v-else
      class="ui-card setup__form"
      @submit.prevent="submitSetup"
      @invalid.capture="localizeValidity"
      @input="clearValidity"
      @change="clearValidity"
    >
      <!-- Language to learn -->
      <fieldset class="setup__group">
        <legend class="ui-label">{{ t('setup.targetLanguage') }}</legend>
        <div class="setup__choices">
          <label
            v-for="(language, index) in TARGET_LANGUAGES"
            :key="language.value"
            class="setup__choice"
            :class="[`setup__choice--tone-${index + 1}`, { 'setup__choice--selected': form.targetLanguage === language.value }]"
          >
            <input v-model="form.targetLanguage" type="radio" name="targetLang" :value="language.value" required />
            <span class="setup__choice-mark" aria-hidden="true">{{ languageMarks[language.value] }}</span>
            <span class="setup__choice-text">{{ t(`setup.${language.value}`) }}</span>
          </label>
        </div>
        <p class="ui-hint">{{ t('setup.targetLanguageHint') }}</p>
      </fieldset>

      <!-- Interface language: only offered to isiZulu learners -->
      <Transition name="setup-reveal">
        <fieldset v-if="form.targetLanguage === 'zulu'" class="setup__group">
          <legend class="ui-label">{{ t('setup.interfaceLanguage') }}</legend>
          <div class="setup__segmented">
            <label v-for="language in TARGET_LANGUAGES" :key="language.value" class="setup__segment">
              <input v-model="form.interfaceLanguage" type="radio" name="uiLang" :value="language.value" required />
              <span>{{ t(`setup.${language.value}`) }}</span>
            </label>
          </div>
        </fieldset>
        <p v-else-if="form.targetLanguage === 'english'" class="ui-hint" data-testid="setup-english-interface">
          {{ t('setup.englishInterfaceNote') }}
        </p>
      </Transition>

      <!-- Date of birth: fixed after the first save -->
      <div class="ui-field">
        <label class="ui-label" for="dateOfBirth">{{ t('setup.dateOfBirth') }}</label>
        <input
          v-if="store.dateOfBirthLocked"
          id="dateOfBirth"
          class="ui-input setup__locked"
          type="date"
          :value="form.dateOfBirth"
          readonly
          aria-readonly="true"
          aria-describedby="dateOfBirthHint"
          data-testid="dob-locked"
        />
        <input
          v-else
          id="dateOfBirth"
          ref="dateInput"
          v-model="form.dateOfBirth"
          class="ui-input"
          type="date"
          min="1900-01-01"
          :max="today"
          required
          aria-describedby="dateOfBirthHint"
        />
        <p id="dateOfBirthHint" class="ui-hint" :class="{ 'setup__lock-hint': store.dateOfBirthLocked }">
          <span v-if="store.dateOfBirthLocked" class="setup__lock" aria-hidden="true"></span>
          {{ store.dateOfBirthLocked ? t('setup.dateOfBirthLocked') : t('setup.dateOfBirthHint') }}
        </p>
        <!-- Linked as a child, now 13 or older: the link stays and can be seen, read only. -->
        <RouterLink
          v-if="store.keepsGuardianLinkPastThirteen"
          :to="{ name: 'parentLinking' }"
          class="ui-btn ui-btn--ghost ui-btn--sm setup__guardian-link"
        >{{ t('setup.seeGuardianLink') }}</RouterLink>
      </div>

      <!-- Daily goal -->
      <div class="ui-field">
        <label class="ui-label" for="dailyGoal">{{ t('setup.dailyGoal') }} <span class="setup__unit">({{ t('setup.minutes') }})</span></label>
        <div class="setup__goal">
          <input
            id="dailyGoal"
            v-model.number="form.dailyGoal"
            class="ui-input setup__goal-input"
            type="number"
            min="1"
            max="120"
            step="1"
            required
            :placeholder="t('setup.dailyGoalPlaceholder')"
            aria-describedby="dailyGoalHint"
          />
          <div class="setup__presets">
            <button
              v-for="minutes in goalPresets"
              :key="minutes"
              type="button"
              class="ui-chip setup__preset"
              :class="{ 'ui-chip--active': form.dailyGoal === minutes }"
              :aria-pressed="form.dailyGoal === minutes"
              @click="form.dailyGoal = minutes"
            >
              {{ t('setup.minutesShort', { count: minutes }) }}
            </button>
          </div>
        </div>
        <p id="dailyGoalHint" class="ui-hint">{{ t('setup.dailyGoalHint') }}</p>
      </div>

      <div v-if="errorText" class="ui-alert ui-alert--error" role="alert">{{ errorText }}</div>
      <div v-if="saved" class="ui-alert ui-alert--success" role="status">{{ t('setup.saved') }}</div>

      <button
        type="submit"
        class="ui-btn ui-btn--primary ui-btn--lg setup__submit"
        :disabled="isSaving || !form.targetLanguage || !form.dateOfBirth"
      >
        <span v-if="isSaving" class="ui-spinner setup__btn-spinner" aria-hidden="true"></span>
        {{ isSaving ? t('setup.saving') : (store.hasSavedSettings ? t('setup.saveChanges') : t('setup.continue')) }}
      </button>
    </form>

    <!-- Confirms a date of birth that turns child mode on. -->
    <div v-if="confirmingChild" class="ui-dialog-backdrop" @click.self="closeChildConfirmation">
      <div
        class="ui-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="child-confirm-title"
        aria-describedby="child-confirm-body"
        data-testid="child-confirm"
      >
        <h2 id="child-confirm-title" class="ui-dialog__title">{{ t('setup.childConfirmTitle') }}</h2>
        <div id="child-confirm-body">
          <p class="ui-dialog__body">{{ t('setup.childConfirmBody') }}</p>
          <p class="ui-dialog__body">{{ t('setup.childConfirmCheck') }}</p>
        </div>
        <div class="ui-dialog__actions">
          <button type="button" class="ui-btn" data-testid="child-confirm-cancel" @click="closeChildConfirmation">{{ t('setup.childConfirmFix') }}</button>
          <button ref="confirmButton" type="button" class="ui-btn ui-btn--primary" data-testid="child-confirm-ok" @click="confirmChildAndSave">{{ t('setup.childConfirmOk') }}</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.setup__head {
  margin-bottom: var(--space-5);
}

/* ---- the two-step journey ---- */
.setup__steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
  font-size: var(--text-sm);
  color: var(--ink-3);
}

.setup__step {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.setup__step--current {
  color: var(--ink);
  font-weight: 600;
}

.setup__step-mark {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--rule-strong);
  font-size: var(--text-xs);
  font-weight: 700;
}

.setup__step--current .setup__step-mark {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

.setup__step-line {
  flex: 0 1 48px;
  height: 1px;
  background: var(--rule-strong);
}

/* ---- notices above the form ---- */
.setup__notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
}

.setup__notice p {
  margin: 0;
  flex: 1 1 260px;
}

/* ---- states ---- */
.setup__state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.setup__state p {
  margin: 0;
}

/* ---- form ---- */
.setup__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
}

.setup__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}

.setup__group legend {
  padding: 0;
  margin-bottom: var(--space-2);
}

/* Language choice cards */
.setup__choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}

.setup__choice {
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

.setup__choice:hover {
  border-color: var(--primary);
}

.setup__choice input,
.setup__segment input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.setup__choice--selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: inset 0 0 0 1px var(--primary);
}

.setup__choice:has(input:focus-visible),
.setup__segment:has(input:focus-visible) {
  box-shadow: var(--focus-ring);
}

.setup__choice-mark {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: var(--radius-sm);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-sm);
  color: var(--on-primary);
  background: var(--tone-1);
}

.setup__choice--tone-2 .setup__choice-mark {
  background: var(--tone-4);
}

.setup__choice-text {
  font-weight: 600;
  color: var(--ink);
}

/* Interface language: a segmented control */
.setup__segmented {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.setup__segment {
  position: relative;
  flex: 1;
  cursor: pointer;
}

.setup__segment span {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  text-align: center;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink-2);
  transition: background 0.15s ease, color 0.15s ease;
}

.setup__segment input:checked + span {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-1);
}

/* Date of birth, locked */
.setup__locked {
  background: var(--surface-2);
  color: var(--ink-2);
  cursor: not-allowed;
}

.setup__guardian-link {
  justify-self: start;
  align-self: flex-start;
}

.setup__lock-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-2);
}

/* A small padlock drawn in CSS: a body with a shackle above it. */
.setup__lock {
  position: relative;
  display: inline-block;
  width: 10px;
  height: 8px;
  margin-top: 4px;
  border-radius: 2px;
  background: var(--ink-3);
  flex: none;
}

.setup__lock::before {
  content: '';
  position: absolute;
  left: 2px;
  bottom: 6px;
  width: 6px;
  height: 6px;
  border: 2px solid var(--ink-3);
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  box-sizing: border-box;
}

/* Daily goal */
.setup__unit {
  font-weight: 400;
  color: var(--ink-3);
}

.setup__goal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.setup__goal-input {
  width: 120px;
}

.setup__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.setup__preset {
  cursor: pointer;
  min-height: 32px;
  font-size: var(--text-sm);
}

.setup__submit {
  width: 100%;
}

.setup__btn-spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

/* Interface-language reveal */
.setup-reveal-enter-active,
.setup-reveal-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.setup-reveal-enter-from,
.setup-reveal-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---- child: bigger, brighter, friendlier ---- */
.setup--child .ui-title {
  font-size: var(--text-3xl);
  color: var(--primary);
}

.setup--child .ui-subtitle {
  font-size: var(--text-lg);
}

.setup--child .setup__form {
  border-width: 2px;
  box-shadow: var(--shadow-2);
}

.setup--child .setup__choice {
  border-width: 2px;
  padding: var(--space-4);
}

.setup--child .setup__choice-mark {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
  font-size: var(--text-lg);
}

.setup--child .setup__choice-text {
  font-size: var(--text-lg);
}

.setup--child .setup__choice--tone-2 .setup__choice-mark {
  background: var(--tone-3);
}

.setup--child .ui-label {
  font-size: var(--text-md);
}

.setup--child .setup__preset:nth-child(4n + 1) { border-color: var(--tone-1); }
.setup--child .setup__preset:nth-child(4n + 2) { border-color: var(--tone-2); }
.setup--child .setup__preset:nth-child(4n + 3) { border-color: var(--tone-3); }
.setup--child .setup__preset:nth-child(4n + 4) { border-color: var(--tone-4); }

@media (max-width: 480px) {
  .setup__form {
    padding: var(--space-5) var(--space-4);
  }
}
</style>
