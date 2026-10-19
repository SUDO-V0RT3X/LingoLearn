<script setup lang="ts">

import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { intlLocale } from '@/i18n'
import { CONTENT_LEVELS } from '@/features/shared/models/contentType'
import { myLearningStore } from '@/features/learner_experience/presentation/state/myLearningStore'
import { themeStore } from '@/features/shared/state/themeStore'
import { friendlyError, levelLabel, starsFor } from '@/features/learner_experience/functions/learnerCopy'
import ContinueReadingList from '@/features/learner_experience/presentation/components/ContinueReadingList.vue'
import StarRow from '@/features/learner_experience/presentation/components/StarRow.vue'

//The learner's own dashboard: their level, how close the level-up challenge
//is, what they have done so far and what they were reading. A child sees the
//same numbers as stars.
const store = myLearningStore()
const theme = themeStore()
const { t } = useI18n()
const { summary, isLoading, error } = storeToRefs(store)

const isChild = computed(() => theme.isChild)
const topLevel = CONTENT_LEVELS[CONTENT_LEVELS.length - 1].value
const atTopLevel = computed(() => (summary.value?.currentLevel ?? 0) >= topLevel)

//What stands between the learner and the challenge, in words.
const challengeMessage = computed(() => {
    const data = summary.value
    if (data == null) return ''
    if (atTopLevel.value) {
        return isChild.value ? t('learner.myLearning.topChild') : t('learner.myLearning.top')
    }
    if (data.readyForChallenge) {
        return isChild.value
            ? t('learner.myLearning.readyChild', { level: data.currentLevel + 1 })
            : t('learner.myLearning.ready', { level: data.currentLevel + 1 })
    }
    const toGo = store.testsToGo
    return isChild.value
        ? t('learner.myLearning.toGoChild', { n: toGo }, toGo)
        : t('learner.myLearning.toGo', { n: toGo, level: data.currentLevel }, toGo)
})

//"12 Oct" in the interface language, or nothing for a date the browser cannot read.
function shortDate(iso: string): string {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

onMounted(() => store.load())

</script>

<template>
  <main class="ui-page my-learning" :class="{ 'my-learning--child': isChild }">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ isChild ? t('common.nav.myStars') : t('common.nav.myLearning') }}</p>
        <h1 class="ui-title">{{ isChild ? t('learner.myLearning.titleChild') : t('learner.myLearning.title') }}</h1>
        <p class="ui-subtitle">
          {{ isChild ? t('learner.myLearning.subtitleChild') : t('learner.myLearning.subtitle') }}
        </p>
      </div>
    </header>

    <div v-if="isLoading && !summary" class="ui-card my-learning__state" role="status">
      <span class="ui-spinner" aria-hidden="true" />
      <span>{{ t('learner.myLearning.loading') }}</span>
    </div>

    <div v-else-if="error && !summary" class="ui-alert ui-alert--error" role="alert" data-testid="my-learning-error">
      <p class="my-learning__error-text">{{ friendlyError(error) }}</p>
      <button type="button" class="ui-btn ui-btn--sm" @click="store.load()">{{ t('common.states.retry') }}</button>
    </div>

    <template v-else-if="summary">
      <p v-if="error" class="ui-alert ui-alert--warning my-learning__stale" role="status">
        {{ t('learner.myLearning.stale', { error: friendlyError(error) }) }}
      </p>

      <section class="ui-card my-learning__level" data-testid="level-card">
        <div class="my-learning__level-badge" aria-hidden="true">
          <span class="my-learning__level-number">{{ summary.currentLevel }}</span>
        </div>
        <div class="my-learning__level-body">
          <p class="ui-eyebrow">{{ isChild ? t('learner.explore.myLevel') : t('learner.myLearning.currentLevel') }}</p>
          <h2 class="my-learning__level-name">{{ levelLabel(summary.currentLevel) }}</h2>

          <div v-if="!atTopLevel" class="my-learning__challenge">
            <div class="my-learning__challenge-head">
              <span>{{ isChild ? t('learner.myLearning.challengeHeadChild') : t('learner.myLearning.challengeHead') }}</span>
              <strong data-testid="challenge-count">{{ Math.min(summary.testsPassedAtLevel, summary.testsRequired) }} / {{ summary.testsRequired }}</strong>
            </div>
            <StarRow v-if="isChild" :filled="summary.testsPassedAtLevel" :total="summary.testsRequired" :size="34" />
            <div
              v-else
              class="ui-progress"
              role="progressbar"
              :aria-valuenow="store.challengeProgress"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <div class="ui-progress__bar" :style="{ width: `${store.challengeProgress}%` }" />
            </div>
          </div>

          <p class="my-learning__challenge-text">{{ challengeMessage }}</p>
          <RouterLink
            v-if="summary.readyForChallenge"
            :to="{ name: 'challengeIntro' }"
            class="ui-btn ui-btn--accent ui-btn--lg"
            data-testid="challenge-cta"
          >{{ isChild ? t('learner.myLearning.challengeCtaChild') : t('learner.myLearning.challengeCta') }}</RouterLink>
          <RouterLink v-else :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">
            {{ isChild ? t('learner.myLearning.findQuiz') : t('learner.myLearning.findTest') }}
          </RouterLink>
        </div>
      </section>

      <section class="my-learning__stats" :aria-label="t('learner.myLearning.statistics')">
        <div class="ui-card my-learning__stat" style="--stat-tone: var(--tone-1)">
          <span class="my-learning__stat-value" data-testid="stat-completed">{{ summary.testsCompleted }}</span>
          <span class="my-learning__stat-label">{{ isChild ? t('learner.myLearning.quizzesTried') : t('learner.myLearning.testsTaken') }}</span>
        </div>
        <div class="ui-card my-learning__stat" style="--stat-tone: var(--tone-3)">
          <span class="my-learning__stat-value" data-testid="stat-passed">{{ summary.testsPassed }}</span>
          <span class="my-learning__stat-label">{{ isChild ? t('learner.myLearning.quizzesPassed') : t('learner.myLearning.testsPassed') }}</span>
        </div>
        <div class="ui-card my-learning__stat" style="--stat-tone: var(--tone-4)">
          <span class="my-learning__stat-value" data-testid="stat-average">{{ summary.averagePercent }}%</span>
          <span class="my-learning__stat-label">{{ isChild ? t('learner.myLearning.averageScoreChild') : t('learner.myLearning.averageScore') }}</span>
          <span v-if="!isChild" class="my-learning__stat-hint">{{ t('learner.myLearning.averageHint') }}</span>
        </div>
      </section>

      <section v-if="summary.continueReading.length" class="my-learning__section" aria-labelledby="continue-heading">
        <h2 id="continue-heading" class="ui-section-title">{{ isChild ? t('learner.explore.keepGoing') : t('learner.explore.continueReading') }}</h2>
        <ContinueReadingList :rows="summary.continueReading" />
      </section>

      <section class="my-learning__section" aria-labelledby="history-heading">
        <h2 id="history-heading" class="ui-section-title">{{ isChild ? t('learner.myLearning.myQuizzes') : t('learner.myLearning.testHistory') }}</h2>
        <p v-if="summary.history.length > 0" class="my-learning__history-hint">
          {{ isChild ? t('learner.myLearning.myQuizzesHint') : t('learner.myLearning.historyHint') }}
        </p>

        <div v-if="summary.history.length === 0" class="ui-card ui-empty" data-testid="history-empty">
          <h3 class="ui-empty__title">{{ isChild ? t('learner.myLearning.noQuizzes') : t('learner.myLearning.noTests') }}</h3>
          <p>{{ isChild ? t('learner.myLearning.noQuizzesBody') : t('learner.myLearning.noTestsBody') }}</p>
          <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">{{ t('learner.myLearning.goToExplore') }}</RouterLink>
        </div>

        <!-- A child sees each quiz once, with their best try: a list of every
             attempt repeats the same quiz as "Try again" then "Passed". -->
        <ul v-else-if="isChild" class="my-learning__child-history">
          <li v-for="test in summary.bestResults" :key="test.contentId" data-testid="history-row">
            <RouterLink
              :to="{ name: 'reader', params: { contentId: String(test.contentId) } }"
              class="ui-card my-learning__child-attempt"
            >
              <span class="my-learning__child-title">{{ test.title }}</span>
              <StarRow :filled="starsFor(test.bestPercent)" :size="22" />
              <span class="ui-badge" :class="test.passed ? 'ui-badge--success' : 'ui-badge--warning'">
                {{ test.passed ? t('learner.results.passed') : t('learner.myLearning.notYet') }}
              </span>
              <span class="my-learning__child-tries">{{ t('learner.myLearning.triedTimes', { n: test.attempts }, test.attempts) }}</span>
            </RouterLink>
          </li>
        </ul>

        <div v-else class="ui-table-wrap">
          <table class="ui-table">
            <thead>
              <tr>
                <th scope="col">{{ t('learner.card.test') }}</th>
                <th scope="col">{{ t('learner.explore.level') }}</th>
                <th scope="col">{{ t('learner.myLearning.columnScore') }}</th>
                <th scope="col">{{ t('learner.myLearning.columnResult') }}</th>
                <th scope="col">{{ t('learner.myLearning.columnDate') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="attempt in summary.history" :key="attempt.attemptId" data-testid="history-row">
                <td class="my-learning__title-cell">
                  <RouterLink :to="{ name: 'reader', params: { contentId: String(attempt.contentId) } }">{{ attempt.title }}</RouterLink>
                </td>
                <td>{{ attempt.level }}</td>
                <td>{{ attempt.score }}/{{ attempt.total }} · {{ attempt.percent }}%</td>
                <td>
                  <span class="ui-badge" :class="attempt.passed ? 'ui-badge--success' : 'ui-badge--warning'">
                    {{ attempt.passed ? t('learner.results.passed') : t('learner.results.notPassed') }}
                  </span>
                </td>
                <td>{{ shortDate(attempt.submittedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.my-learning__state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}
.my-learning__error-text {
  margin: 0 0 var(--space-3);
}
.my-learning__stale {
  margin: 0 0 var(--space-4);
}
.my-learning__level {
  display: flex;
  gap: var(--space-5);
  align-items: flex-start;
  margin-bottom: var(--space-5);
}
.my-learning__level-badge {
  flex: none;
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: var(--radius-lg);
  background: var(--primary);
  color: var(--on-primary);
}
.my-learning__level-number {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 600;
  line-height: 1;
}
.my-learning__level-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
}
.my-learning__level-body .ui-eyebrow {
  margin: 0;
}
.my-learning__level-name {
  margin: 0;
  font-size: var(--text-2xl);
}
.my-learning__challenge {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.my-learning__challenge-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--ink-2);
}
.my-learning__challenge-text {
  margin: 0;
  color: var(--ink-2);
}
.my-learning__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.my-learning__stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border-top: 4px solid var(--stat-tone);
}
.my-learning__stat-value {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 600;
  line-height: 1.1;
}
.my-learning__stat-label {
  font-size: var(--text-sm);
  color: var(--ink-2);
}
.my-learning__stat-hint {
  font-size: var(--text-xs);
  color: var(--ink-3);
}
.my-learning__history-hint {
  margin: calc(-1 * var(--space-2)) 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--ink-3);
}
.my-learning__section {
  margin-bottom: var(--space-6);
}
.my-learning__title-cell {
  font-weight: 600;
}

/* A child's dashboard: brighter blocks, stars instead of bars. */
.my-learning--child .my-learning__level {
  background: linear-gradient(160deg, var(--surface), var(--primary-soft));
  border: 3px solid var(--tone-4);
}
.my-learning--child .my-learning__level-badge {
  border-radius: 50%;
  background: var(--tone-2);
  color: var(--ink);
  box-shadow: 0 6px 0 var(--accent);
}
.my-learning--child .my-learning__stat {
  border: none;
  background: var(--stat-tone);
  color: #fff;
}
.my-learning--child .my-learning__stat-label {
  color: rgba(255, 255, 255, 0.9);
}
.my-learning__child-history {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.my-learning__child-attempt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-4);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.my-learning__child-attempt:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
}
.my-learning__child-attempt:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
.my-learning__child-tries {
  font-size: var(--text-sm);
  color: var(--ink-3);
}
.my-learning__child-title {
  font-weight: 700;
}

@media (max-width: 640px) {
  .my-learning__level {
    flex-direction: column;
  }
  .my-learning__level-badge {
    width: 72px;
    height: 72px;
  }
}
</style>
