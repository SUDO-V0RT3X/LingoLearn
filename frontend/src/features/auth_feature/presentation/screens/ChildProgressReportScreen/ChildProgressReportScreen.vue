<script setup lang="ts">
// The report page reads route state, fetches one report, and renders no form controls.
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { I18nT, useI18n } from 'vue-i18n'
import { formatLongDate, formatLongDateTime, localizeServerMessage } from '@/i18n'
import { authStore } from '@/features/auth_feature/state/authStore'
import { ChildProgressReportDataSource } from '@/features/auth_feature/datasources/childProgressReportDataSource'
import type {
  ChildProgressReport,
  ReportActivity,
  ReportFlag,
  ReportLanguage,
} from '@/features/auth_feature/models/childProgressReportType'
import GuardianDateOfBirthCard from '@/features/onboarding_feature/presentation/components/GuardianDateOfBirthCard.vue'

// Read the current route parameters.
const route = useRoute()
// Translate the page into the interface language.
const { t, te } = useI18n()
// Read the session token from the existing Identity store.
const auth = authStore()
// Store the report returned by the backend.
const report = ref<ChildProgressReport | null>(null)
// Track the first load and retry state.
const isLoading = ref(true)
// Track the dedicated unlinked-child response state.
const isForbidden = ref(false)
// Store a general request error message, as the server sent it (shown localised).
const errorMessage = ref<string | null>(null)

/**
 * Loads the report for the child id in the route. The report covers all of the
 * child's learning: they have one level across languages, as on their own My learning.
 */
async function loadReport(): Promise<void> {
  // Convert the child route parameter to a numeric id.
  const childId = Number(route.params.childId)
  // Clear the previous state before starting the request.
  isLoading.value = true
  // Hide any previous forbidden state.
  isForbidden.value = false
  // Clear any previous general error message.
  errorMessage.value = null
  // Request the complete report from the backend.
  const response = await ChildProgressReportDataSource.getReport(childId, undefined, auth.token)
  // Finish the loading state after the request resolves.
  isLoading.value = false

  // Display the dedicated access-denied state for an unlinked child.
  if (response.error?.statusCode === 403) {
    isForbidden.value = true
    report.value = null
    return
  }
  // Display a general error when the request did not return report data.
  if (response.error || !response.data) {
    errorMessage.value = response.error?.message || 'Failed to load child progress. Please try again.'
    report.value = null
    return
  }
  // Store the complete successful report for rendering.
  report.value = response.data
}

/** Formats an ISO date in the app's one long date form; a bad value shows a dash. */
function formatDate(value: string): string {
  return formatLongDate(value) || '—'
}

/** Formats nullable scores without displaying a misleading zero. */
function formatScore(score: number | null): string {
  // Display the numeric percentage or a plain unscored label.
  return score === null ? t('identity.report.notScored') : `${score}%`
}

/** Formats the challenge state and optional cooldown as one line of text. */
function challengeStatus(value: ChildProgressReport): string {
  // Display the cooldown end time when the challenge is cooling down.
  if (value.challenge.state === 'cooldown' && value.challenge.cooldownEndsAt) {
    return t('identity.report.cooldownUntil', { time: formatLongDateTime(value.challenge.cooldownEndsAt) })
  }
  // Display that there is no level left to climb at the top level.
  if (value.challenge.state === 'max_level') return t('identity.report.topLevel')
  // Display the available state when the learner has met the requirements.
  if (value.challenge.state === 'eligible') return t('identity.report.eligible')
  // Display the locked state for every remaining response.
  return t('identity.report.locked')
}

/** Names the language the child is learning. */
function languageName(language: ReportLanguage): string {
  if (language === 'zu') return t('common.languages.zulu')
  if (language === 'en') return t('common.languages.english')
  return String(language).toUpperCase()
}

/** An activity's title: a challenge has no content, so it is named by the level it aimed for. */
function activityTitle(activity: ReportActivity): string {
  if (activity.type === 'challenge' && activity.level) return t('identity.report.challengeTitle', { level: activity.level })
  return activity.title
}

/** An activity's type in the interface language; an unknown type shows as sent. */
function activityTypeLabel(type: ReportActivity['type']): string {
  const key = `identity.report.activityTypes.${type}`
  return te(key) ? t(key) : type
}

/** An activity's outcome in the interface language; an unknown outcome shows as sent. */
function outcomeLabel(outcome: ReportActivity['outcome']): string {
  const key = `identity.report.outcomes.${outcome}`
  return te(key) ? t(key) : String(outcome).replace(/_/g, ' ')
}

/** A flag's short title, from its code. */
function flagTitle(flag: ReportFlag): string {
  const key = `identity.report.flagTitles.${flag.code}`
  return te(key) ? t(key) : flag.code.replace(/_/g, ' ')
}

/** A flag's explanation, from its code; a flag this page doesn't know keeps the server's text. */
function flagMessage(flag: ReportFlag): string {
  const key = `identity.report.flagMessages.${flag.code}`
  return te(key) ? t(key) : flag.message
}

/** Level-up progress as a 0–100 bar width; an empty requirement shows as empty. */
function levelUpPercent(value: ChildProgressReport): number {
  const { testsPassed, testsRequired } = value.summary.levelUp
  if (!testsRequired || testsRequired <= 0) return 0
  return Math.min(100, Math.round((testsPassed / testsRequired) * 100))
}

/** The alert colour for the challenge line. */
function challengeTone(value: ChildProgressReport): string {
  if (value.challenge.state === 'eligible' || value.challenge.state === 'max_level') return 'ui-alert--success'
  if (value.challenge.state === 'cooldown') return 'ui-alert--warning'
  return 'ui-alert--info'
}

/** The badge colour for an activity outcome. */
function outcomeTone(outcome: string): string {
  if (outcome === 'passed' || outcome === 'completed') return 'ui-badge--success'
  if (outcome === 'failed') return 'ui-badge--danger'
  return 'ui-badge--info'
}

// Load the initial report after Vue mounts the route component.
onMounted(() => loadReport())
</script>

<template>
  <!-- The main region contains loading, forbidden, error, and successful report states. -->
  <main class="ui-page progress-report">
    <!-- This link returns the guardian to the linked children list. -->
    <RouterLink :to="{ name: 'parentLinking' }" class="ui-btn ui-btn--ghost ui-btn--sm progress-report__back">&larr; {{ t('common.nav.myChildren') }}</RouterLink>

    <!-- This status appears while the API request is in progress. -->
    <div v-if="isLoading" class="ui-card ui-empty progress-report__state" role="status">
      <span class="ui-spinner progress-report__spinner" aria-hidden="true" />
      <p>{{ t('identity.report.loading') }}</p>
    </div>

    <!-- This section appears when the backend refuses an unlinked learner id. -->
    <section v-else-if="isForbidden" class="ui-card ui-empty progress-report__state" data-testid="forbidden-state">
      <p class="ui-eyebrow">{{ t('identity.report.forbiddenEyebrow') }}</p>
      <h1 class="ui-empty__title">{{ t('identity.report.forbiddenTitle') }}</h1>
      <p>{{ t('identity.report.forbiddenBody') }}</p>
      <RouterLink :to="{ name: 'parentLinking' }" class="ui-btn ui-btn--primary">{{ t('common.nav.myChildren') }}</RouterLink>
    </section>

    <!-- This alert appears for network and non-forbidden API errors. -->
    <div v-else-if="errorMessage" class="ui-card progress-report__state progress-report__failed">
      <p class="ui-alert ui-alert--error" role="alert">{{ localizeServerMessage(errorMessage) }}</p>
      <button type="button" class="ui-btn" @click="loadReport()">{{ t('common.states.retry') }}</button>
    </div>

    <!-- This article renders the complete report returned by the backend. -->
    <article v-else-if="report" class="ui-stack progress-report__content">
      <!-- The header displays child identity, language and read-only status. -->
      <header class="ui-page__head report-header">
        <div>
          <p class="ui-eyebrow">{{ t('identity.report.eyebrow') }}</p>
          <h1 class="ui-title">{{ report.child.firstName }}</h1>
          <p class="ui-subtitle">
            {{ t('identity.report.learning', { language: languageName(report.child.activeLanguage) }) }}
            &middot;
            {{ t('identity.report.lastActive', { date: report.child.lastActiveAt ? formatDate(report.child.lastActiveAt) : t('identity.report.noActivityRecorded') }) }}
          </p>
        </div>

        <!-- This badge labels the entire screen as non-editable. -->
        <span class="ui-badge">{{ t('identity.report.readOnly') }}</span>
      </header>

      <!-- These four cards display the summary values. -->
      <dl class="summary-grid" :aria-label="t('identity.report.summaryLabel')">
        <div class="ui-card summary-card">
          <dt>{{ t('identity.report.level') }}</dt>
          <dd v-if="report.summary.level !== null">{{ report.summary.level }}</dd>
          <dd v-else data-testid="not-placed">
            {{ t('identity.report.notPlaced') }}
            <span class="summary-card__hint">{{ t('identity.report.notPlacedHint') }}</span>
          </dd>
        </div>
        <div class="ui-card summary-card">
          <dt>{{ t('identity.report.completed') }}</dt>
          <dd>{{ report.summary.completed }}</dd>
        </div>
        <div class="ui-card summary-card">
          <dt>{{ t('identity.report.avgScore') }}</dt>
          <dd>{{ report.summary.avgScore === null ? t('identity.report.notAvailable') : `${report.summary.avgScore}%` }}</dd>
        </div>
        <div class="ui-card summary-card">
          <dt>{{ t('identity.report.levelUpProgress') }}</dt>
          <dd>
            {{ t('identity.report.testsPassed', { passed: report.summary.levelUp.testsPassed, required: report.summary.levelUp.testsRequired }) }}
            <span class="ui-progress summary-card__bar" aria-hidden="true">
              <span class="ui-progress__bar" :style="{ width: `${levelUpPercent(report)}%` }" />
            </span>
          </dd>
        </div>
      </dl>

      <!-- This line displays the current level-up challenge state. -->
      <p class="ui-alert challenge-status" :class="challengeTone(report)" :data-state="report.challenge.state">
        <strong>{{ t('identity.report.challenge') }}</strong> {{ challengeStatus(report) }}
      </p>

      <!-- This section displays the newest activity rows in a read-only table. -->
      <section class="ui-card report-section">
        <div class="report-section__heading">
          <h2 class="ui-section-title">{{ t('identity.report.recentActivity') }}</h2>
          <span class="ui-hint">{{ t('identity.report.newestFirst') }}</span>
        </div>

        <!-- This message appears when the activity list is empty. -->
        <p v-if="report.recentActivity.length === 0" class="empty-state">{{ t('identity.report.noActivity') }}</p>

        <!-- This table appears when at least one activity exists. -->
        <div v-else class="ui-table-wrap">
          <table class="ui-table activity-table">
            <thead>
              <tr>
                <th>{{ t('identity.report.columns.date') }}</th>
                <th>{{ t('identity.report.columns.title') }}</th>
                <th>{{ t('identity.report.columns.type') }}</th>
                <th>{{ t('identity.report.columns.score') }}</th>
                <th>{{ t('identity.report.columns.outcome') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="activity in report.recentActivity" :key="`${activity.contentId}-${activity.occurredAt}`">
                <td>{{ formatDate(activity.occurredAt) }}</td>
                <td>{{ activityTitle(activity) }}</td>
                <td class="activity-table__type">{{ activityTypeLabel(activity.type) }}</td>
                <td>{{ formatScore(activity.score) }}</td>
                <td><span class="ui-badge activity-table__outcome" :class="outcomeTone(activity.outcome)">{{ outcomeLabel(activity.outcome) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- This section displays every flag returned by the backend rule set. -->
      <section class="report-section report-section--split">
        <div class="ui-card">
          <h2 class="ui-section-title">{{ t('identity.report.flags') }}</h2>
          <p v-if="report.flags.length === 0" class="empty-state">{{ t('identity.report.noFlags') }}</p>
          <ul v-else class="flags-list">
            <li v-for="flag in report.flags" :key="flag.code">
              <strong>{{ flagTitle(flag) }}</strong>
              <span>{{ flagMessage(flag) }}</span>
            </li>
          </ul>
        </div>

        <!-- This plain text value displays the setting without a toggle or input. -->
        <div class="settings-copy">
          <h2>{{ t('common.nav.settings') }}</h2>
          <I18nT keypath="identity.report.childFriendly" tag="p" scope="global">
            <template #state><strong>{{ report.settings.childFriendly ? t('identity.report.enabled') : t('identity.report.disabled') }}</strong></template>
          </I18nT>
        </div>
      </section>
      <GuardianDateOfBirthCard :child-id="Number(route.params.childId)" />
    </article>
  </main>
</template>

<style scoped>
.progress-report__back {
  margin-bottom: var(--space-4);
}

.progress-report__state p {
  margin: 0 0 var(--space-3);
}

.progress-report__spinner {
  margin: 0 auto var(--space-3);
}

.progress-report__failed {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
}

.report-header {
  margin-bottom: 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
  margin: 0;
}

.summary-card {
  padding: var(--space-4) var(--space-5);
}

.summary-card dt {
  color: var(--ink-3);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.summary-card dd {
  margin: var(--space-2) 0 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
}

.summary-card__hint {
  display: block;
  margin-top: var(--space-1);
  color: var(--ink-3);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 400;
}

.summary-card__bar {
  display: block;
  margin-top: var(--space-3);
}

.summary-card__bar .ui-progress__bar {
  display: block;
}

.challenge-status {
  margin: 0;
}

.report-section__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}

.empty-state {
  margin: 0;
  color: var(--ink-2);
}

.activity-table {
  min-width: 640px;
}

.activity-table__type,
.activity-table__outcome {
  text-transform: capitalize;
}

.report-section--split {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.flags-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.flags-list li {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--warning-soft);
}

.flags-list strong {
  color: var(--warning);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
}

/* Settings: a card in the same style as the flags beside it. */
.settings-copy {
  padding: var(--space-5);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

.settings-copy h2 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xl);
  font-weight: 600;
}

.settings-copy p {
  margin: 0;
  color: var(--ink-2);
}

@media (max-width: 860px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .report-section--split {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
