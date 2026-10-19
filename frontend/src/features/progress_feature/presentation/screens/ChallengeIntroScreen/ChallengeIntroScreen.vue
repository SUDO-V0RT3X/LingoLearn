<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { intlLocale, localizeServerMessage } from '@/i18n';
import { challengeIntroStore } from './state/challengeIntroStore';
import { themeStore } from '@/features/shared/state/themeStore';
import { SecondsRemainingFormatter } from '../../../functions/formatSecondsRemaining';
import { ChallengeDisplay } from '../../../functions/challengeDisplay';

const { t, locale } = useI18n();
const store = challengeIntroStore();
const theme = themeStore();

//Ticks once a second so the cooldown counts down on screen. The end time comes
//from the server; the count is worked out from it, so it never drifts.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
//The cooldown end already re-checked, so a clock running ahead of the server's
//asks once, not every second.
let recheckedFor: string | null = null;

onMounted(() => {
    void store.load();
    timer = setInterval(() => {
        now.value = Date.now();
        // The cooldown has just run out: ask the server again rather than assume.
        const report = store.report;
        if (report?.reason === 'cooldown_active' && report.cooldownUntil !== recheckedFor
            && ChallengeDisplay.secondsUntil(report.cooldownUntil, now.value) === 0 && !store.isLoading) {
            recheckedFor = report.cooldownUntil;
            void store.load();
        }
    }, 1000);
});

// Cleans up the interval when this screen is left.
onUnmounted(() => { if (timer) clearInterval(timer); });

const report = computed(() => store.report);
//The wait after a failed challenge, in the largest whole unit: "2 minutes", "24 hours".
const cooldownWait = computed(() => {
    const minutes = report.value?.cooldownMinutes ?? 60;
    return minutes >= 60 && minutes % 60 === 0
        ? t('progress.intro.waitHours', minutes / 60, { named: { n: minutes / 60 } })
        : t('progress.intro.waitMinutes', minutes, { named: { n: minutes } });
});
const isChild = computed(() => theme.isChild);

const testsDone = computed(() => Math.min(report.value?.testsPassed ?? 0, report.value?.testsRequired ?? 0));
const testsLeft = computed(() => Math.max(0, (report.value?.testsRequired ?? 0) - (report.value?.testsPassed ?? 0)));
const testsPercent = computed(() => ChallengeDisplay.percent(testsDone.value, report.value?.testsRequired ?? 0));

const cooldownSeconds = computed(() => ChallengeDisplay.secondsUntil(report.value?.cooldownUntil ?? null, now.value));
const cooldownEndsAt = computed(() => report.value?.cooldownUntil
    ? new Date(report.value.cooldownUntil).toLocaleString(intlLocale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : '');

// Reading the locale makes the template redraw these when the interface language changes.
const levelLabel = (level: number) => { void locale.value; return ChallengeDisplay.levelLabel(level); };
const formatSeconds = (seconds: number) => { void locale.value; return SecondsRemainingFormatter.format(seconds); };
</script>

<template>
  <main class="ui-page ui-page--narrow intro" :class="{ 'intro--child': isChild }">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ t('common.nav.levelUp') }}</p>
        <h1 class="ui-title">{{ isChild ? t('progress.intro.titleChild') : t('progress.intro.title') }}</h1>
        <p class="ui-subtitle">
          {{ isChild ? t('progress.intro.subtitleChild') : t('progress.intro.subtitle') }}
        </p>
      </div>
    </header>

    <section v-if="store.isLoading && !report" class="ui-card intro__loading" aria-busy="true">
      <div class="ui-spinner" aria-hidden="true"></div>
      <p>{{ t('progress.intro.checking') }}</p>
    </section>

    <section v-else-if="store.error" class="ui-alert ui-alert--error intro__error" role="alert">
      <span>{{ localizeServerMessage(store.error.message) || t('common.states.genericError') }}</span>
      <button class="ui-btn ui-btn--sm" type="button" @click="store.load()">{{ t('common.states.retry') }}</button>
    </section>

    <div v-else-if="report" class="ui-stack">
      <!-- Where the learner is, and where the challenge takes them. -->
      <section class="ui-card journey" :aria-label="t('progress.intro.levelAria')">
        <div class="journey__stop">
          <span class="journey__badge">{{ report.currentLevel }}</span>
          <div>
            <p class="ui-eyebrow">{{ t('progress.intro.youAreHere') }}</p>
            <p class="journey__name">{{ levelLabel(report.currentLevel) }}</p>
          </div>
        </div>
        <svg v-if="report.targetLevel" class="journey__arrow" viewBox="0 0 48 16" aria-hidden="true">
          <path d="M2 8h40M34 2l8 6-8 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div v-if="report.targetLevel" class="journey__stop journey__stop--next">
          <span class="journey__badge journey__badge--next">{{ report.targetLevel }}</span>
          <div>
            <p class="ui-eyebrow">{{ t('progress.intro.nextLevel') }}</p>
            <p class="journey__name">{{ levelLabel(report.targetLevel) }}</p>
          </div>
        </div>
      </section>

      <!-- Progress toward the tests the level-up rule asks for (testsRequired). -->
      <section v-if="report.reason !== 'max_level'" class="ui-card">
        <div class="tests__head">
          <h2 class="ui-section-title">{{ t('progress.intro.testsPassedAt', { level: report.currentLevel }) }}</h2>
          <span class="tests__count" data-testid="tests-count">{{ t('progress.intro.testsCount', { done: testsDone, total: report.testsRequired }) }}</span>
        </div>
        <div
          class="ui-progress"
          role="progressbar"
          :aria-valuenow="testsDone"
          aria-valuemin="0"
          :aria-valuemax="report.testsRequired"
          :aria-label="t('progress.intro.testsAria', { done: testsDone, total: report.testsRequired })"
        >
          <div class="ui-progress__bar" :style="{ width: testsPercent + '%' }"></div>
        </div>
        <ol class="tests__steps" aria-hidden="true">
          <li v-for="n in report.testsRequired" :key="n" class="tests__step" :class="{ 'tests__step--done': n <= testsDone }">
            <svg v-if="n <= testsDone" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span v-else>{{ n }}</span>
          </li>
        </ol>
        <p class="ui-hint">{{ t('progress.intro.eachCountsOnce') }}</p>
      </section>

      <!-- What the learner can do now. -->
      <section v-if="report.eligible" class="ui-card status status--ready" data-testid="status-ready">
        <span class="ui-badge ui-badge--success">{{ report.inProgress ? t('progress.intro.inProgress') : t('progress.intro.ready') }}</span>
        <h2 class="status__title">
          {{ report.inProgress
            ? t('progress.intro.waitingTitle')
            : t(isChild ? 'progress.intro.readyTitleChild' : 'progress.intro.readyTitle', { level: report.targetLevel ?? '' }) }}
        </h2>
        <p class="status__text">
          {{ report.inProgress
            ? t('progress.intro.resumeText')
            : t('progress.intro.passMarkText', { mark: report.passMark ?? '' }) }}
        </p>
        <RouterLink :to="{ name: 'challengePlay' }" class="ui-btn ui-btn--primary ui-btn--lg" data-testid="start-challenge">
          {{ report.inProgress ? t('progress.intro.resume') : t('progress.intro.start') }}
        </RouterLink>
      </section>

      <section v-else-if="report.reason === 'requirement_not_met'" class="ui-card status" data-testid="status-locked">
        <span class="ui-badge">{{ t('progress.intro.notYet') }}</span>
        <h2 class="status__title">
          {{ t(isChild ? 'progress.intro.lockedTitleChild' : 'progress.intro.lockedTitle', testsLeft) }}
        </h2>
        <p class="status__text">{{ t('progress.intro.lockedText', { level: report.currentLevel }) }}</p>
        <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">{{ t('progress.intro.findTest') }}</RouterLink>
      </section>

      <section v-else-if="report.reason === 'cooldown_active'" class="ui-card status status--cooldown" data-testid="status-cooldown">
        <span class="ui-badge ui-badge--warning">{{ t('progress.intro.coolingDown') }}</span>
        <h2 class="status__title">{{ isChild ? t('progress.intro.cooldownTitleChild') : t('progress.intro.cooldownTitle') }}</h2>
        <p class="status__countdown" aria-live="polite">{{ formatSeconds(cooldownSeconds) }}</p>
        <p class="status__text">
          {{ cooldownEndsAt ? t('progress.intro.againOn', { when: cooldownEndsAt }) : t('progress.intro.againSoon') }}
          {{ t('progress.intro.cooldownPractise', { level: report.currentLevel }) }}
        </p>
        <RouterLink :to="{ name: 'explore' }" class="ui-btn">{{ t('progress.intro.practiseInExplore') }}</RouterLink>
      </section>

      <section v-else-if="report.reason === 'max_level'" class="ui-card status status--top" data-testid="status-top">
        <svg class="status__trophy" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M20 10h24v14a12 12 0 0 1-24 0z" fill="currentColor" />
          <path d="M20 14h-8a8 8 0 0 0 8 12M44 14h8a8 8 0 0 1-8 12" fill="none" stroke="currentColor" stroke-width="3" />
          <rect x="29" y="35" width="6" height="10" fill="currentColor" />
          <rect x="20" y="45" width="24" height="6" rx="2" fill="currentColor" />
        </svg>
        <h2 class="status__title">{{ isChild ? t('progress.intro.topTitleChild') : t('progress.intro.topTitle') }}</h2>
        <p class="status__text">{{ t('progress.intro.topText', { level: report.currentLevel }) }}</p>
        <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">{{ t('progress.intro.keepExploring') }}</RouterLink>
      </section>

      <!-- What happens in the challenge. -->
      <section v-if="report.targetLevel" class="ui-card ui-card--sunken how">
        <h2 class="ui-section-title">{{ t('progress.intro.howTitle') }}</h2>
        <ol class="how__list">
          <li>{{ t('progress.intro.how1', { level: report.targetLevel }) }}</li>
          <li>{{ t('progress.intro.how2') }}</li>
          <li>{{ t('progress.intro.how3', { mark: report.passMark ?? 70, level: report.targetLevel }) }}</li>
          <li>{{ t('progress.intro.how4', { wait: cooldownWait }) }}</li>
        </ol>
      </section>
    </div>
  </main>
</template>

<style scoped>
.intro__loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.intro__loading p { margin: 0; }

.intro__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

/* Where the learner is and where they are heading. */
.journey {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.journey__stop {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.journey__stop .ui-eyebrow { margin: 0; }

.journey__name {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
}

.journey__badge {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: 50%;
  background: var(--primary);
  color: var(--on-primary);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 700;
}

.journey__badge--next {
  background: var(--accent-soft);
  color: var(--accent);
  border: 2px dashed var(--accent);
}

.journey__arrow {
  width: 48px;
  color: var(--ink-3);
  flex: none;
}

/* One step per test the challenge needs. */
.tests__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.tests__count {
  font-weight: 700;
  color: var(--primary);
}

.tests__steps {
  display: flex;
  gap: var(--space-2);
  list-style: none;
  padding: 0;
  margin: var(--space-4) 0 var(--space-3);
  flex-wrap: wrap;
}

.tests__step {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--rule-strong);
  color: var(--ink-3);
  font-size: var(--text-sm);
  font-weight: 600;
}

.tests__step svg { width: 16px; height: 16px; }

.tests__step--done {
  border-color: var(--success);
  background: var(--success);
  color: var(--on-primary);
}

/* What the learner can do now. */
.status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}

.status__title {
  margin: 0;
  font-size: var(--text-xl);
}

.status__text {
  margin: 0;
  color: var(--ink-2);
  max-width: 60ch;
}

.status--ready {
  border-color: var(--success);
  background: linear-gradient(180deg, var(--success-soft), var(--surface) 70%);
}

.status--cooldown {
  border-color: var(--warning);
}

.status__countdown {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: 600;
  color: var(--warning);
  font-variant-numeric: tabular-nums;
}

.status--top {
  align-items: center;
  text-align: center;
  background: linear-gradient(180deg, var(--accent-soft), var(--surface) 75%);
}

.status__trophy {
  width: 72px;
  height: 72px;
  color: var(--accent);
}

/* How it works. */
.how__list {
  margin: 0;
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  color: var(--ink-2);
}

/* A child gets bigger, brighter stops on the journey. */
.intro--child .journey__badge {
  width: 64px;
  height: 64px;
  background: var(--tone-4);
  box-shadow: 0 4px 0 var(--primary-hover);
}

.intro--child .journey__badge--next {
  background: var(--tone-2);
  color: var(--ink);
  border: none;
  box-shadow: 0 4px 0 var(--accent);
}

.intro--child .tests__step--done {
  background: var(--tone-3);
  border-color: var(--tone-3);
}

.intro--child .tests__step:nth-child(6n + 2).tests__step--done { background: var(--tone-1); border-color: var(--tone-1); }
.intro--child .tests__step:nth-child(6n + 3).tests__step--done { background: var(--tone-2); border-color: var(--tone-2); }
.intro--child .tests__step:nth-child(6n + 4).tests__step--done { background: var(--tone-4); border-color: var(--tone-4); }
.intro--child .tests__step:nth-child(6n + 5).tests__step--done { background: var(--tone-5); border-color: var(--tone-5); }
</style>
