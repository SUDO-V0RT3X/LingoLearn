<!--
  GuardianDateOfBirthCard.vue

  Lets a linked guardian correct their child's date of birth. Learners cannot
  change their own once setup is saved, because it decides whether they are a
  child (child-friendly content, and a parent link before they can read).

  Self-contained: give it the child's id. It loads nothing until the guardian
  opens it, so the screen it sits on pays no cost.
    <GuardianDateOfBirthCard :child-id="childId" />
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';
import { formatLongDate, localizeServerMessage } from '@/i18n';
import { clearValidity, localizeValidity } from '@/features/shared/presentation/forms/localizedValidity';

const props = defineProps<{ childId: number }>();
const { t } = useI18n();

const isOpen = ref(false);
const isLoading = ref(false);
const isSaving = ref(false);
// The saved date ('YYYY-MM-DD'), or null when the child has not finished setup.
const savedDate = ref<string | null>(null);
// Whether the saved date has been read at least once.
const hasLoaded = ref(false);
const draft = ref('');
// Why the last request failed: a status the card explains itself, or the server's
// own message (shown in the interface language). Null when nothing failed.
const failure = ref<{ status: number; message: string | null; fallbackKey: string } | null>(null);
// Whether the last save succeeded, to confirm it until the card is opened again.
const justSaved = ref(false);

const today = new Date().toISOString().slice(0, 10);
const validChild = computed(() => Number.isSafeInteger(props.childId) && props.childId > 0);
const canSave = computed(() => !isSaving.value && draft.value !== '' && draft.value !== savedDate.value);

/** Shows a date the way the guardian reads it, in the app's one long date form. */
function formatDate(value: string): string {
  return formatLongDate(value) || value;
}

/** The confirmation after a save: "Date of birth updated. Now 1 March 2010." as one sentence pair. */
const savedMessage = computed((): string => {
  const updated = t('onboarding.guardianDob.updated');
  return savedDate.value ? `${updated} ${t('onboarding.guardianDob.now', { date: formatDate(savedDate.value) })}` : updated;
});

/** Turns a failed request into words for the guardian, in the interface language. */
const errorMessage = computed((): string => {
  if (!failure.value) return '';
  const { status, message, fallbackKey } = failure.value;
  if (status === 403) return t('onboarding.guardianDob.notLinked');
  if (status === 404) return t('onboarding.guardianDob.notSetUp');
  if (status === 400) return t('onboarding.guardianDob.invalidDate');
  return message ? localizeServerMessage(message) : t(fallbackKey);
});

async function load(): Promise<void> {
  isLoading.value = true;
  failure.value = null;
  const response = await OnboardingDataSource.getChildDateOfBirth(props.childId);
  isLoading.value = false;
  if (response.error || !response.data) {
    failure.value = {
      status: response.error?.statusCode ?? 0,
      message: response.error?.message ?? null,
      fallbackKey: 'onboarding.guardianDob.loadFailed',
    };
    return;
  }
  hasLoaded.value = true;
  savedDate.value = response.data.dateOfBirth;
  draft.value = response.data.dateOfBirth ?? '';
}

async function open(): Promise<void> {
  isOpen.value = true;
  justSaved.value = false;
  await load();
}

function close(): void {
  isOpen.value = false;
  failure.value = null;
}

async function save(): Promise<void> {
  if (!canSave.value) return;
  isSaving.value = true;
  failure.value = null;
  justSaved.value = false;
  const response = await OnboardingDataSource.setChildDateOfBirth(props.childId, draft.value);
  isSaving.value = false;
  if (response.error || !response.data) {
    failure.value = {
      status: response.error?.statusCode ?? 0,
      message: response.error?.message ?? null,
      fallbackKey: 'onboarding.guardianDob.saveFailed',
    };
    return;
  }
  savedDate.value = response.data.dateOfBirth;
  draft.value = response.data.dateOfBirth ?? '';
  isOpen.value = false;
  justSaved.value = true;
}
</script>

<template>
  <section v-if="validChild" class="ui-card dob-card" aria-labelledby="dob-card-title" data-testid="guardian-dob-card">
    <div class="dob-card__head">
      <div>
        <h2 id="dob-card-title" class="ui-section-title dob-card__title">{{ t('onboarding.guardianDob.title') }}</h2>
        <p class="dob-card__text">{{ t('onboarding.guardianDob.explanation') }}</p>
      </div>
      <button v-if="!isOpen" type="button" class="ui-btn" data-testid="dob-open" @click="open">
        {{ t('onboarding.guardianDob.open') }}
      </button>
    </div>

    <p v-if="justSaved" class="ui-alert ui-alert--success" role="status" data-testid="dob-saved">{{ savedMessage }}</p>

    <div v-if="isOpen" class="dob-card__body">
      <div v-if="isLoading" class="dob-card__state" role="status">
        <span class="ui-spinner" aria-hidden="true"></span> {{ t('common.states.loading') }}
      </div>

      <template v-else-if="hasLoaded">
        <p v-if="savedDate === null" class="ui-alert ui-alert--info" data-testid="dob-no-setup">
          {{ t('onboarding.guardianDob.noSetup') }}
        </p>

        <form
          v-else
          class="dob-card__form"
          @submit.prevent="save"
          @invalid.capture="localizeValidity"
          @input="clearValidity"
          @change="clearValidity"
        >
          <div class="ui-field">
            <label class="ui-label" :for="`guardian-dob-${childId}`">{{ t('onboarding.guardianDob.label') }}</label>
            <input
              :id="`guardian-dob-${childId}`"
              v-model="draft"
              class="ui-input dob-card__input"
              type="date"
              min="1900-01-01"
              :max="today"
              required
            />
            <p class="ui-hint">{{ t('onboarding.guardianDob.savedValue', { date: formatDate(savedDate) }) }}</p>
          </div>
          <div class="ui-row">
            <button type="submit" class="ui-btn ui-btn--primary" :disabled="!canSave" data-testid="dob-save">
              {{ isSaving ? t('common.states.saving') : t('onboarding.guardianDob.save') }}
            </button>
            <button type="button" class="ui-btn ui-btn--ghost" @click="close">{{ t('common.states.cancel') }}</button>
          </div>
        </form>
      </template>

      <p v-if="errorMessage" class="ui-alert ui-alert--error" role="alert">{{ errorMessage }}</p>
      <div v-if="!hasLoaded && !isLoading && errorMessage" class="ui-row">
        <button type="button" class="ui-btn ui-btn--sm" @click="load">{{ t('common.states.retry') }}</button>
        <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" @click="close">{{ t('common.states.close') }}</button>
      </div>
      <div v-else-if="hasLoaded && savedDate === null" class="ui-row">
        <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" @click="close">{{ t('common.states.close') }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dob-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.dob-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.dob-card__title {
  margin-bottom: var(--space-1);
}

.dob-card__text {
  margin: 0;
  max-width: 60ch;
  font-size: var(--text-sm);
  color: var(--ink-2);
}

.dob-card__body,
.dob-card__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.dob-card__state {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-2);
}

.dob-card__input {
  max-width: 240px;
}

.ui-alert {
  margin: 0;
}
</style>
