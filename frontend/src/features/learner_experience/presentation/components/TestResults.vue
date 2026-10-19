<script setup lang="ts">

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { $TestResult } from '@/features/learner_experience/models/learnerTypes'
import { starsFor } from '@/features/learner_experience/functions/learnerCopy'
import StarRow from './StarRow.vue'

//How the server marked a test: the score, whether it passed, and which
//questions were right. The right answers themselves are never known here.
const props = withDefaults(defineProps<{
    result: $TestResult;
    title: string;
    isChild?: boolean;
}>(), { isChild: false })

const emit = defineEmits<{ (event: 'retry'): void }>()

const { t } = useI18n()

const stars = computed(() => starsFor(props.result.percent))

const headline = computed(() => {
    if (props.isChild) {
        if (props.result.percent === 100) return t('learner.results.perfect')
        return props.result.passed ? t('learner.results.didIt') : t('learner.results.greatTry')
    }
    return props.result.passed ? t('learner.results.passed') : t('learner.results.notPassedThisTime')
})

//A pass only "counts toward your level-up challenge" when it does: the server
//says so for a test at the learner's own level. Below it, a pass is practice.
const message = computed(() => {
    const { passed, passMark, countsTowardLevelUp } = props.result
    if (!passed) {
        return props.isChild
            ? t('learner.results.messageFailedChild', { mark: passMark })
            : t('learner.results.messageFailed', { mark: passMark })
    }
    if (countsTowardLevelUp) {
        return props.isChild ? t('learner.results.messagePassedChild') : t('learner.results.messagePassed')
    }
    return props.isChild ? t('learner.results.messagePracticeChild') : t('learner.results.messagePractice')
})

//The ring around the percentage: how much of its circumference to draw.
const RING_LENGTH = 2 * Math.PI * 52
const ringOffset = computed(() => RING_LENGTH * (1 - Math.min(100, Math.max(0, props.result.percent)) / 100))

</script>

<template>
  <section
    class="test-results"
    :class="{ 'test-results--child': isChild, 'test-results--passed': result.passed }"
    data-testid="test-results"
  >
    <div class="ui-card test-results__hero">
      <div v-if="isChild && result.passed" class="test-results__confetti" aria-hidden="true">
        <span v-for="n in 14" :key="n" :style="{ '--n': n }" />
      </div>

      <p class="ui-eyebrow">{{ title }}</p>

      <StarRow v-if="isChild" :filled="stars" :size="52" animated />
      <svg v-else class="test-results__ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" class="test-results__ring-track" />
        <circle
          cx="60" cy="60" r="52"
          class="test-results__ring-value"
          :stroke-dasharray="RING_LENGTH"
          :stroke-dashoffset="ringOffset"
        />
        <text x="60" y="68" text-anchor="middle" class="test-results__ring-text">{{ result.percent }}%</text>
      </svg>

      <h1 class="ui-title test-results__headline">{{ headline }}</h1>
      <p class="test-results__score" data-testid="score">
        {{ t('learner.results.score', { score: result.score, total: result.total }) }}
        <template v-if="isChild"> · {{ result.percent }}%</template>
      </p>
      <span
        class="ui-badge"
        :class="result.passed ? 'ui-badge--success' : 'ui-badge--warning'"
        data-testid="pass-badge"
      >{{ result.passed ? t('learner.results.passed') : t('learner.results.notPassed') }} · {{ t('learner.results.passMark', { mark: result.passMark }) }}</span>
      <p class="test-results__message" data-testid="result-message">{{ message }}</p>
    </div>

    <div class="ui-card test-results__questions">
      <h2 class="ui-section-title">{{ isChild ? t('learner.results.yourAnswers') : t('learner.results.questionByQuestion') }}</h2>
      <ol class="test-results__list">
        <li
          v-for="(question, index) in result.questions"
          :key="index"
          class="test-results__item"
          :class="question.correct ? 'test-results__item--right' : 'test-results__item--wrong'"
          data-testid="question-result"
        >
          <span class="test-results__mark" aria-hidden="true">
            <svg v-if="question.correct" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <svg v-else viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg>
          </span>
          <span>{{ t('learner.results.question', { number: index + 1 }) }}</span>
          <!-- The tick or cross and the colour say right or wrong; screen readers get the word. -->
          <span class="ui-sr-only">{{ question.correct ? t('learner.results.right') : t('learner.results.notRight') }}</span>
        </li>
      </ol>
    </div>

    <div class="ui-row test-results__actions">
      <RouterLink :to="{ name: 'myLearning' }" class="ui-btn ui-btn--primary">{{ isChild ? t('learner.results.seeMyStars') : t('common.nav.myLearning') }}</RouterLink>
      <RouterLink :to="{ name: 'explore' }" class="ui-btn">{{ isChild ? t('learner.results.findAnotherStory') : t('learner.results.exploreMore') }}</RouterLink>
      <button type="button" class="ui-btn ui-btn--ghost" data-testid="retry" @click="emit('retry')">{{ t('common.states.retry') }}</button>
    </div>
  </section>
</template>

<style scoped>
.test-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.test-results__hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-5);
  text-align: center;
  overflow: hidden;
}
.test-results--passed .test-results__hero {
  border-top: 6px solid var(--success);
}
.test-results__ring {
  width: 132px;
  height: 132px;
}
.test-results__ring-track {
  fill: none;
  stroke: var(--surface-3);
  stroke-width: 10;
}
.test-results__ring-value {
  fill: none;
  stroke: var(--warning);
  stroke-width: 10;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 60px 60px;
  transition: stroke-dashoffset 0.6s ease;
}
.test-results--passed .test-results__ring-value {
  stroke: var(--success);
}
.test-results__ring-text {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  fill: var(--ink);
}
.test-results__headline {
  margin: 0;
}
.test-results__score {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--ink-2);
}
.test-results__message {
  margin: 0;
  max-width: 48ch;
  color: var(--ink-2);
}
.test-results__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.test-results__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  font-weight: 600;
}
.test-results__item--right {
  background: var(--success-soft);
  color: var(--success);
}
.test-results__item--wrong {
  background: var(--danger-soft);
  color: var(--danger);
}
.test-results__mark {
  display: inline-flex;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface);
}
.test-results__mark svg {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.test-results__actions {
  justify-content: center;
}

/* A child's results: bigger, brighter, with confetti for a pass. */
.test-results--child .test-results__hero {
  background: linear-gradient(160deg, var(--surface), var(--accent-soft));
  border: 3px solid var(--tone-2);
}
.test-results--child .test-results__headline {
  font-size: var(--text-3xl);
  color: var(--primary);
}
.test-results--child .test-results__item {
  border-radius: var(--radius-pill);
}
.test-results__confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.test-results__confetti span {
  position: absolute;
  top: -12px;
  left: calc(var(--n) * 7%);
  width: 10px;
  height: 14px;
  border-radius: 3px;
  background: var(--tone-1);
  animation: confetti-fall 2.4s ease-in calc(var(--n) * 0.09s) both;
}
.test-results__confetti span:nth-child(5n + 2) { background: var(--tone-2); }
.test-results__confetti span:nth-child(5n + 3) { background: var(--tone-3); }
.test-results__confetti span:nth-child(5n + 4) { background: var(--tone-4); }
.test-results__confetti span:nth-child(5n) { background: var(--tone-5); }
@keyframes confetti-fall {
  0% { transform: translateY(0) rotate(0); opacity: 1; }
  100% { transform: translateY(380px) rotate(540deg); opacity: 0; }
}
</style>
