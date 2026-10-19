<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { localizeServerMessage } from '@/i18n';
import { challengePlayStore } from './state/challengePlayStore';
import { themeStore } from '@/features/shared/state/themeStore';
import { ContentBlockTypes, isBlockOfType } from '@/features/shared/models/contentType';
import MultipleChoiceQuestion from '@/features/shared/presentation/blocks/MultipleChoiceQuestion.vue';
import FillBlankQuestion from '@/features/shared/presentation/blocks/FillBlankQuestion.vue';
import ListenChooseQuestion from '@/features/shared/presentation/blocks/ListenChooseQuestion.vue';
import ChallengeResult from '../../components/ChallengeResult.vue';
import LeaveGuardDialog from '@/features/shared/presentation/leaveGuard/LeaveGuardDialog.vue';
import { useLeaveGuard } from '@/features/shared/presentation/leaveGuard/useLeaveGuard';
import type { ChallengeAnswer } from '../../../models/ProgressTypes';

const { t } = useI18n();
const store = challengePlayStore();
const theme = themeStore();
const isChild = computed(() => theme.isChild);

//The server starts the challenge here, whatever screen linked to this one:
//it re-checks eligibility and either draws the questions or resumes the ones
//already drawn, so refreshing never gives a new set.
onMounted(() => { void store.start(); });

//Leaving part-way asks first. Once the result is showing, nothing is asked.
const { asking: askingToLeave, stay: stayHere, leave: leaveAnyway } = useLeaveGuard(() => store.phase === 'playing' || store.phase === 'submitting');

const current = computed(() => store.current);
const answer = computed<ChallengeAnswer>(() => store.answers[store.index] ?? null);
const choice = computed(() => (typeof answer.value === 'number' ? answer.value : null));
const typed = computed(() => (typeof answer.value === 'string' ? answer.value : ''));

const nextLabel = computed(() => {
    if (store.phase === 'submitting') return t('progress.play.marking');
    if (store.isLast) return store.error ? t('progress.play.sendAgain') : t('progress.play.finish');
    return store.currentAnswered ? t('progress.play.nextQuestion') : t('progress.play.skip');
});

//Why the server would not start the challenge, in the learner's words.
const blockedTitle = computed(() => store.error?.statusCode === 409
    ? t('progress.play.notReadyTitle')
    : t('progress.play.blockedTitle'));
const blockedText = computed(() => store.error?.statusCode === 409
    ? t('progress.play.notReadyText')
    : `${capitalise(localizeServerMessage(store.error?.message) || t('progress.play.blockedFallback'))}.`);

function capitalise(text: string): string {
    const trimmed = text.replace(/\.$/, '');
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
</script>

<template>
  <main class="ui-page ui-page--narrow play" :class="{ 'play--child': isChild }">
    <RouterLink v-if="store.phase !== 'playing' && store.phase !== 'submitting'" :to="{ name: 'challengeIntro' }" class="ui-btn ui-btn--ghost ui-btn--sm play__back">
      ← {{ t('common.nav.levelUp') }}
    </RouterLink>

    <section v-if="store.phase === 'loading'" class="ui-card play__state" aria-busy="true">
      <div class="ui-spinner" aria-hidden="true"></div>
      <p>{{ isChild ? t('progress.play.loadingChild') : t('progress.play.loading') }}</p>
    </section>

    <section v-else-if="store.phase === 'blocked'" class="ui-card ui-empty" data-testid="play-blocked">
      <p class="ui-eyebrow">{{ t('progress.intro.title') }}</p>
      <h1 class="ui-empty__title">{{ blockedTitle }}</h1>
      <p>{{ blockedText }}</p>
      <RouterLink :to="{ name: 'challengeIntro' }" class="ui-btn ui-btn--primary">{{ t('progress.play.backToLevelUp') }}</RouterLink>
    </section>

    <section v-else-if="store.phase === 'failed'" class="ui-alert ui-alert--error play__error" role="alert">
      <span>{{ localizeServerMessage(store.error?.message) || t('progress.play.loadFailed') }}</span>
      <button class="ui-btn ui-btn--sm" type="button" @click="store.start()">{{ t('common.states.retry') }}</button>
    </section>

    <ChallengeResult v-else-if="store.phase === 'result' && store.outcome" :outcome="store.outcome" :is-child="isChild" />

    <template v-else-if="current">
      <header class="play__head">
        <p class="ui-eyebrow">{{ t('progress.play.challengeOfLevel', { level: store.targetLevel ?? '' }) }}</p>
        <h1 class="ui-title play__title">{{ t('progress.play.question', { n: store.index + 1 }) }} <span class="play__of">{{ t('progress.play.of', { total: store.questions.length }) }}</span></h1>
        <div
          class="ui-progress play__progress"
          role="progressbar"
          :aria-valuenow="store.progressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('progress.play.progressAria')"
        >
          <div class="ui-progress__bar" :style="{ width: store.progressPercent + '%' }"></div>
        </div>
      </header>

      <p v-if="store.resumed && store.index === store.resumedAt" class="ui-alert ui-alert--info" data-testid="welcome-back">
        {{ store.resumedAt > 0 ? t('progress.play.welcomeBackAt', { n: store.resumedAt + 1 }) : t('progress.play.welcomeBack') }}
      </p>

      <section class="ui-card play__question" data-testid="challenge-question">
        <MultipleChoiceQuestion
          v-if="isBlockOfType(current, ContentBlockTypes.multipleChoice)"
          :key="`mc-${store.index}`"
          :value="current.value"
          :answer="choice"
          @update:answer="store.setAnswer"
        />
        <FillBlankQuestion
          v-else-if="isBlockOfType(current, ContentBlockTypes.fillBlank)"
          :key="`fb-${store.index}`"
          :value="current.value"
          :answer="typed"
          @update:answer="store.setAnswer"
        />
        <ListenChooseQuestion
          v-else-if="isBlockOfType(current, ContentBlockTypes.listenChoose)"
          :key="`lc-${store.index}`"
          :value="current.value"
          :answer="choice"
          :allow-transcript="false"
          @update:answer="store.setAnswer"
        />
        <p v-else class="ui-alert">{{ t('progress.play.cannotShow') }}</p>
      </section>

      <p v-if="store.error" class="ui-alert ui-alert--error" role="alert">{{ localizeServerMessage(store.error.message) || t('common.states.genericError') }}</p>

      <footer class="play__foot">
        <p class="ui-hint">
          {{ isChild ? t('progress.play.noGoingBackChild') : t('progress.play.noGoingBack') }}
        </p>
        <button
          class="ui-btn ui-btn--lg"
          :class="store.currentAnswered || store.isLast ? 'ui-btn--primary' : ''"
          type="button"
          data-testid="next-question"
          :disabled="store.phase === 'submitting'"
          @click="store.next()"
        >
          <span v-if="store.phase === 'submitting'" class="ui-spinner play__btn-spinner" aria-hidden="true"></span>
          {{ nextLabel }}
        </button>
      </footer>
    </template>

    <LeaveGuardDialog
      v-if="askingToLeave"
      :title="t('progress.play.leaveTitle')"
      :body="t('progress.play.leaveBody')"
      :stay-label="t('progress.play.leaveStay')"
      :leave-label="t('progress.play.leaveGo')"
      @stay="stayHere"
      @leave="leaveAnyway"
    />
  </main>
</template>

<style scoped>
.play {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.play__back { align-self: flex-start; }

.play__state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.play__state p { margin: 0; }

.play__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.play__head .ui-eyebrow { margin: 0; }

.play__title { margin: var(--space-1) 0 var(--space-3); }

.play__of {
  color: var(--ink-3);
  font-size: var(--text-xl);
  font-weight: 500;
}

.play__question {
  padding: var(--space-5);
  font-size: var(--text-lg);
}

/* The shared question blocks bring their own frame; inside a card it is not needed. */
.play__question :deep(.question-block) {
  border: none;
  padding: 0;
  margin: 0;
}

.play__question :deep(.question-block__option) {
  padding: var(--space-3) var(--space-4);
  margin-top: var(--space-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.play__question :deep(.question-block__option:hover) {
  border-color: var(--rule-strong);
  background: var(--surface-2);
}

.play__question :deep(.question-block__option:has(input:checked)) {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.play__question :deep(.question-block__gap) {
  border-bottom-color: var(--primary);
  font-weight: 600;
  color: var(--primary);
}

.play__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.play__foot .ui-hint { margin: 0; }

.play__btn-spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

/* A child gets a bigger, brighter question card. */
.play--child .play__question {
  border-width: 3px;
  border-color: var(--tone-4);
  font-size: var(--text-xl);
}

.play--child .play__question :deep(.question-block__option) {
  border-width: 2px;
}

@media (max-width: 640px) {
  .play__foot { flex-direction: column-reverse; align-items: stretch; }
}
</style>
