<script setup lang="ts">
//The end of a level-up challenge: the server's marking, then either the new
//level (with a celebration for a child) or when the learner may try again.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { intlLocale } from '@/i18n';
import type { ChallengeOutcome } from '../../models/ProgressTypes';
import { ChallengeDisplay } from '../../functions/challengeDisplay';
import { SecondsRemainingFormatter } from '../../functions/formatSecondsRemaining';

const props = defineProps<{ outcome: ChallengeOutcome; isChild: boolean }>();
const { t, locale } = useI18n();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    if (!props.outcome.passed) timer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });

const cooldownSeconds = computed(() => ChallengeDisplay.secondsUntil(props.outcome.cooldownUntil, now.value));
const cooldownEndsAt = computed(() => props.outcome.cooldownUntil
    ? new Date(props.outcome.cooldownUntil).toLocaleString(intlLocale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : '');
const scoreWidth = computed(() => ChallengeDisplay.percent(props.outcome.percent, 100));
const passMarkAt = computed(() => ChallengeDisplay.percent(props.outcome.passMark, 100));
//The live countdown, redrawn when the interface language changes too.
const countdown = computed(() => { void locale.value; return SecondsRemainingFormatter.format(cooldownSeconds.value); });

const title = computed(() => {
    if (props.outcome.passed) {
        return t(props.isChild ? 'progress.result.passedTitleChild' : 'progress.result.passedTitle', { level: props.outcome.newLevel });
    }
    return props.isChild ? t('progress.result.failedTitleChild') : t('progress.result.failedTitle');
});

//Confetti pieces for a child's pass: each one's colour, place and timing.
const confetti = Array.from({ length: 24 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${(i % 8) * 0.15}s`,
    tone: `var(--tone-${(i % 5) + 1})`,
    turn: `${(i * 47) % 360}deg`,
}));
</script>

<template>
  <section
    class="ui-card result"
    :class="[outcome.passed ? 'result--pass' : 'result--fail', { 'result--child': isChild }]"
    data-testid="challenge-result"
    aria-live="polite"
  >
    <div v-if="outcome.passed && isChild" class="result__confetti" aria-hidden="true">
      <span
        v-for="(piece, i) in confetti"
        :key="i"
        class="result__piece"
        :style="{ left: piece.left, animationDelay: piece.delay, background: piece.tone, rotate: piece.turn }"
      ></span>
    </div>

    <!-- A star for a child, a medal for everyone else, with the new level on it. -->
    <svg v-if="outcome.passed" class="result__medal" viewBox="0 0 100 100" aria-hidden="true">
      <template v-if="isChild">
        <polygon class="result__star" points="50,4 62,36 96,37 69,58 79,92 50,72 21,92 31,58 4,37 38,36" />
        <text x="50" y="62" text-anchor="middle" class="result__medal-number">{{ outcome.newLevel }}</text>
      </template>
      <template v-else>
        <circle cx="50" cy="50" r="44" class="result__ring" />
        <circle cx="50" cy="50" r="35" class="result__disc" />
        <text x="50" y="62" text-anchor="middle" class="result__medal-number">{{ outcome.newLevel }}</text>
      </template>
    </svg>

    <!-- A friendly sun for a child who did not pass this time. -->
    <svg v-else-if="isChild" class="result__sun" viewBox="0 0 100 100" aria-hidden="true">
      <g class="result__rays">
        <line v-for="n in 8" :key="n" x1="50" y1="6" x2="50" y2="18" :transform="`rotate(${n * 45} 50 50)`" />
      </g>
      <circle cx="50" cy="50" r="26" class="result__sun-face" />
      <circle cx="41" cy="46" r="3" class="result__sun-eye" />
      <circle cx="59" cy="46" r="3" class="result__sun-eye" />
      <path d="M40 57q10 9 20 0" class="result__sun-smile" />
    </svg>

    <p class="ui-eyebrow">{{ outcome.passed ? t('progress.result.passedEyebrow') : t('progress.result.failedEyebrow') }}</p>
    <h1 class="result__title">{{ title }}</h1>
    <p class="result__score">
      <i18n-t keypath="progress.result.score" tag="span" scope="global">
        <template #percent><strong>{{ outcome.percent }}%</strong></template>
        <template #score>{{ outcome.score }}</template>
        <template #total>{{ outcome.total }}</template>
      </i18n-t>
      {{ t(outcome.passed ? 'progress.result.neededToPass' : 'progress.result.needToPass', { mark: outcome.passMark }) }}
    </p>

    <div class="result__bar">
      <div
        class="ui-progress"
        role="progressbar"
        :aria-valuenow="outcome.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="t('progress.result.scoreAria', { percent: outcome.percent })"
      >
        <div class="ui-progress__bar result__fill" :style="{ width: scoreWidth + '%' }"></div>
      </div>
      <span class="result__mark" :style="{ left: passMarkAt + '%' }" :title="t('progress.result.passMarkTitle', { mark: outcome.passMark })"></span>
    </div>

    <div v-if="!outcome.passed" class="result__cooldown">
      <p class="ui-eyebrow">{{ t('progress.result.tryAgainIn') }}</p>
      <p class="result__countdown">{{ countdown }}</p>
      <p class="result__hint">
        {{ cooldownEndsAt ? t('progress.intro.againOn', { when: cooldownEndsAt }) : t('progress.intro.againSoon') }}
        {{ isChild ? t('progress.result.practiseChild') : t('progress.result.practise') }}
      </p>
    </div>
    <p v-else class="result__hint">
      {{ isChild ? t('progress.result.unlockedChild') : t('progress.result.unlocked', { level: outcome.newLevel }) }}
    </p>

    <div class="result__actions">
      <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">
        {{ outcome.passed ? t('progress.result.exploreLevel', { level: outcome.newLevel }) : t('progress.intro.practiseInExplore') }}
      </RouterLink>
      <RouterLink :to="{ name: 'challengeIntro' }" class="ui-btn">{{ t('progress.play.backToLevelUp') }}</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.result {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-5);
}

.result--pass {
  border-color: var(--success);
  background: linear-gradient(180deg, var(--success-soft), var(--surface) 65%);
}

.result--fail {
  background: linear-gradient(180deg, var(--surface-2), var(--surface) 60%);
}

.result .ui-eyebrow { margin: 0; }

.result__title {
  margin: 0;
  font-size: var(--text-3xl);
}

.result__score,
.result__hint {
  margin: 0;
  color: var(--ink-2);
  max-width: 52ch;
}

.result__score strong { color: var(--ink); }

/* The medal or star with the new level. */
.result__medal {
  width: 112px;
  height: 112px;
  animation: result-pop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}

.result__ring { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 4; }
.result__disc { fill: var(--primary); }
.result__star { fill: var(--tone-2); stroke: var(--accent); stroke-width: 3; stroke-linejoin: round; }

.result__medal-number {
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 700;
  fill: var(--on-primary);
}

.result--child .result__medal-number { fill: var(--ink); }

.result--child .result__medal { width: 140px; height: 140px; }

/* The sun for a child's near miss. */
.result__sun { width: 96px; height: 96px; }
.result__rays line { stroke: var(--tone-2); stroke-width: 5; stroke-linecap: round; }
.result__sun-face { fill: var(--tone-2); }
.result__sun-eye { fill: var(--ink); }
.result__sun-smile { fill: none; stroke: var(--ink); stroke-width: 3; stroke-linecap: round; }
.result__sun .result__rays { transform-origin: 50px 50px; animation: result-spin 12s linear infinite; }

/* The score, with a tick where the pass mark is. */
.result__bar {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin: var(--space-2) 0;
}

.result--pass .result__fill { background: var(--success); }
.result--fail .result__fill { background: var(--warning); }

.result__mark {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 3px;
  margin-left: -1px;
  border-radius: 2px;
  background: var(--ink);
}

.result__cooldown {
  width: 100%;
  max-width: 420px;
  padding: var(--space-4);
  border-radius: var(--radius);
  background: var(--warning-soft);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.result__countdown {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--warning);
  font-variant-numeric: tabular-nums;
}

.result__actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  justify-content: center;
  margin-top: var(--space-2);
}

/* Confetti falling across a child's pass. */
.result__confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.result__piece {
  position: absolute;
  top: -16px;
  width: 10px;
  height: 14px;
  border-radius: 3px;
  opacity: 0;
  animation: result-fall 2.8s ease-in forwards;
}

.result__piece:nth-child(3n) { width: 8px; height: 8px; border-radius: 50%; }

@keyframes result-fall {
  0% { transform: translateY(0) rotate(0); opacity: 1; }
  100% { transform: translateY(520px) rotate(540deg); opacity: 0; }
}

@keyframes result-pop {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes result-spin {
  to { transform: rotate(360deg); }
}
</style>
