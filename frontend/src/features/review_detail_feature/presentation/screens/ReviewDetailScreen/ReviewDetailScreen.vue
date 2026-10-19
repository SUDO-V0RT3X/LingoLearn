<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { reviewDetailScreenStore } from './state/reviewDetailScreenStore';
import { DecisionValidator, type Decision } from '../../../functions/decisionValidator';
import { DecisionMessageBuilder } from '../../../functions/decisionMessageBuilder';
import ModeratorBlockRenderer from '../../components/ModeratorBlockRenderer.vue';
import { CONTENT_LEVELS, QUESTION_BLOCK_TYPES } from '@/features/shared/models/contentType';
import { intlLocale, localizeServerMessage } from '@/i18n';

const { t } = useI18n();
const route = useRoute();
const store = reviewDetailScreenStore();

//Only rejecting asks for anything more: the reason the author will read.
const rejecting = ref(false);
const reason = ref('');
const reasonError = ref('');
//The decision just recorded. The message itself is built when shown, so it
//follows the interface language.
const decided = ref<Decision | null>(null);

const contentId = computed(() => Number(route.params.id));

function loadForCurrentRoute() {
    rejecting.value = false;
    reason.value = '';
    reasonError.value = '';
    decided.value = null;
    if (!Number.isInteger(contentId.value)) return;
    void store.load(contentId.value);
}

onMounted(loadForCurrentRoute);
watch(() => route.params.id, loadForCurrentRoute);

const item = computed(() => store.item);
const isPending = computed(() => item.value?.status === 'pending');
const questionCount = computed(() => (item.value?.content ?? [])
    .flat().filter(block => QUESTION_BLOCK_TYPES.includes(block.itemType)).length);
const decisionMessage = computed(() => (decided.value ? DecisionMessageBuilder.messageFor(decided.value) : ''));

const levelLabel = computed(() => {
    const level = item.value?.level;
    if (!level) return t('moderation.detail.notSet');
    const named = CONTENT_LEVELS.find(option => option.value === level);
    const plain = t('common.level', { level });
    return named ? `${plain} · ${named.label}` : plain;
});
const languageLabel = computed(() => {
    const language = item.value?.language;
    if (language === 'english' || language === 'zulu') return t(`common.languages.${language}`);
    return language ?? t('moderation.detail.notSet');
});
const typeLabel = computed(() => (item.value?.contentType === 'Test'
    ? t('moderation.contentType.test')
    : t('moderation.contentType.lesson')));
const audienceLabel = computed(() => (item.value?.audience === 'Child-friendly'
    ? t('common.audience.child')
    : t('common.audience.general')));

const STATUS_TONE: Record<string, string> = {
    pending: 'ui-badge--warning',
    approved: 'ui-badge--success',
    rejected: 'ui-badge--danger',
    draft: 'ui-badge--info',
};
const statusBadge = computed(() => {
    const status = item.value?.status ?? '';
    const label = status === 'pending' ? t('moderation.detail.status.pending')
        : status === 'draft' ? t('moderation.detail.status.draft')
        : status === 'approved' ? t('common.status.approved')
        : status === 'rejected' ? t('common.status.rejected')
        : status;
    return { label, tone: STATUS_TONE[status] ?? '' };
});

//What went wrong loading, in a moderator's words.
const loadProblem = computed(() => {
    const status = store.error?.statusCode;
    if (status === 404) return { title: t('moderation.detail.notFoundTitle'), text: t('moderation.detail.notFoundText'), retry: false };
    if (status === 409) return { title: t('moderation.detail.notSubmittedTitle'), text: t('moderation.detail.notSubmittedText'), retry: false };
    if (status === 403) return { title: t('moderation.detail.moderatorsOnlyTitle'), text: t('moderation.detail.moderatorsOnlyText'), retry: false };
    return {
        title: t('moderation.detail.loadFailedTitle'),
        text: localizeServerMessage(store.error?.message) || t('moderation.detail.pleaseTryAgain'),
        retry: true,
    };
});

function formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function startRejecting() {
    rejecting.value = true;
    reasonError.value = '';
    decided.value = null;
}

function cancelRejecting() {
    rejecting.value = false;
    reason.value = '';
    reasonError.value = '';
}

// Records the decision. Rejecting needs a reason; the server checks the same
// rule, so a decision can never be stored without one.
async function confirm(decision: Decision) {
    const validation = DecisionValidator.validate(decision, reason.value);
    if (!validation.valid) {
        reasonError.value = validation.error ?? t('moderation.detail.needsReason');
        return;
    }
    reasonError.value = '';
    const saved = await store.decide(decision === 'approve' ? 'approved' : 'rejected', reason.value.trim());
    if (!saved) return;

    decided.value = decision;
    rejecting.value = false;
    reason.value = '';
}
</script>

<template>
  <main class="ui-page ui-page--wide review">
    <RouterLink :to="{ name: 'reviewQueue' }" class="ui-btn ui-btn--ghost ui-btn--sm review__back">← {{ t('common.nav.reviewQueue') }}</RouterLink>

    <section v-if="store.isLoading" class="ui-card review__loading" aria-busy="true">
      <div class="ui-spinner" aria-hidden="true"></div>
      <p>{{ t('moderation.detail.loading') }}</p>
    </section>

    <section v-else-if="store.error || !item" class="ui-card ui-empty" data-testid="review-load-error">
      <p class="ui-eyebrow">{{ t('moderation.detail.eyebrow') }}</p>
      <h1 class="ui-empty__title">{{ loadProblem.title }}</h1>
      <p>{{ loadProblem.text }}</p>
      <div class="ui-row review__empty-actions">
        <button v-if="loadProblem.retry" class="ui-btn ui-btn--primary" type="button" @click="loadForCurrentRoute">{{ t('common.states.retry') }}</button>
        <RouterLink :to="{ name: 'reviewQueue' }" class="ui-btn">{{ t('moderation.detail.backToQueue') }}</RouterLink>
      </div>
    </section>

    <template v-else>
      <header class="ui-page__head review__head">
        <div>
          <p class="ui-eyebrow">{{ t('moderation.detail.eyebrowWithType', { type: typeLabel }) }}</p>
          <h1 class="ui-title">{{ item.title }}</h1>
          <p class="ui-subtitle review__meta">
            {{ t('moderation.detail.byAuthor', { author: item.author }) }}
            <span aria-hidden="true">·</span> {{ t('moderation.detail.submittedOn', { date: formatDate(item.submittedAt) }) }}
            <template v-if="item.version > 1"><span aria-hidden="true">·</span> {{ t('moderation.detail.submission', { n: item.version }) }}</template>
          </p>
        </div>
        <span class="ui-badge" :class="statusBadge.tone" data-testid="review-status">{{ statusBadge.label }}</span>
      </header>

      <p v-if="item.status === 'draft'" class="ui-alert ui-alert--info review__banner" data-testid="reopened-notice">
        {{ t('moderation.detail.reopenedNotice') }}
      </p>
      <p v-else-if="!isPending && !decisionMessage" class="ui-alert review__banner">
        {{ item.status === 'approved' ? t('moderation.detail.alreadyApproved') : t('moderation.detail.alreadyRejected') }}
      </p>

      <div class="review__layout">
        <!-- What the learner will read, with the answers they will not see. -->
        <section class="review__preview" :aria-label="t('moderation.detail.previewLabel')">
          <div class="review__preview-head">
            <h2 class="ui-section-title">{{ t('moderation.detail.preview') }}</h2>
            <span v-if="questionCount" class="ui-chip">
              {{ t('moderation.detail.questionCount', questionCount) }}
            </span>
          </div>
          <p v-if="item.content.length === 0" class="ui-card ui-empty">{{ t('moderation.detail.noPages') }}</p>
          <article v-for="(blocks, pageIndex) in item.content" :key="pageIndex" class="ui-card review__page">
            <p class="ui-eyebrow">{{ t('moderation.detail.pageOf', { page: pageIndex + 1, total: item.content.length }) }}</p>
            <ModeratorBlockRenderer :blocks="blocks" />
          </article>
        </section>

        <aside class="review__side">
          <section class="ui-card review__panel">
            <h2 class="ui-section-title">{{ t('moderation.detail.details') }}</h2>
            <dl class="review__facts">
              <div><dt>{{ t('moderation.queue.columns.level') }}</dt><dd>{{ levelLabel }}</dd></div>
              <div><dt>{{ t('moderation.queue.columns.type') }}</dt><dd>{{ typeLabel }}</dd></div>
              <div>
                <dt>{{ t('moderation.queue.columns.audience') }}</dt>
                <dd>
                  <span class="ui-badge" :class="item.audience === 'Child-friendly' ? 'ui-badge--brand' : ''">{{ audienceLabel }}</span>
                </dd>
              </div>
              <div><dt>{{ t('moderation.queue.columns.language') }}</dt><dd>{{ languageLabel }}</dd></div>
            </dl>
            <p class="review__label">{{ t('moderation.detail.tags') }}</p>
            <div v-if="item.chosenTags.length" class="ui-row review__tags">
              <span v-for="tag in item.chosenTags" :key="tag" class="ui-chip">{{ tag }}</span>
            </div>
            <p v-else class="ui-hint">{{ t('moderation.detail.noTags') }}</p>
          </section>

          <section v-if="isPending" class="ui-card review__panel review__decision" data-testid="decision-panel">
            <h2 class="ui-section-title">{{ t('moderation.detail.decision') }}</h2>
            <template v-if="!rejecting">
              <p class="ui-hint">{{ t('moderation.detail.decisionHint') }}</p>
              <div class="review__decision-buttons">
                <button class="ui-btn ui-btn--primary" type="button" data-testid="approve" :disabled="store.isDeciding" @click="confirm('approve')">
                  {{ store.isDeciding ? t('common.states.saving') : t('moderation.detail.approve') }}
                </button>
                <button class="ui-btn ui-btn--danger" type="button" data-testid="reject" :disabled="store.isDeciding" @click="startRejecting">
                  {{ t('moderation.detail.reject') }}
                </button>
              </div>
            </template>

            <form v-else class="ui-stack review__reject" @submit.prevent="confirm('reject')">
              <div class="ui-field">
                <label class="ui-label" for="reject-reason">{{ t('moderation.detail.reasonLabel') }}</label>
                <textarea
                  id="reject-reason"
                  v-model="reason"
                  class="ui-textarea"
                  rows="4"
                  minlength="5"
                  maxlength="1000"
                  required
                  data-testid="reject-reason"
                  :aria-invalid="reasonError ? 'true' : 'false'"
                  :placeholder="t('moderation.detail.reasonPlaceholder')"
                ></textarea>
                <span class="ui-hint">{{ t('moderation.detail.reasonHint') }}</span>
              </div>
              <p v-if="reasonError" class="ui-alert ui-alert--error" role="alert">{{ reasonError }}</p>
              <div class="review__decision-buttons">
                <button class="ui-btn ui-btn--danger" type="submit" data-testid="confirm-reject" :disabled="store.isDeciding">
                  {{ store.isDeciding ? t('common.states.saving') : t('moderation.detail.confirmReject') }}
                </button>
                <button class="ui-btn ui-btn--ghost" type="button" @click="cancelRejecting">{{ t('common.states.cancel') }}</button>
              </div>
            </form>

            <p v-if="store.decisionError" class="ui-alert ui-alert--error" role="alert">
              {{ localizeServerMessage(store.decisionError.message) || t('moderation.detail.decisionNotSaved') }}
            </p>
          </section>

          <p v-if="decisionMessage" class="ui-alert ui-alert--success" role="status" data-testid="decision-message">{{ decisionMessage }}</p>

          <section class="ui-card review__panel">
            <h2 class="ui-section-title">{{ t('moderation.detail.history') }}</h2>
            <ol v-if="item.decisions.length" class="review__history">
              <li v-for="(decision, i) in item.decisions" :key="i" class="review__event">
                <div class="ui-row review__event-head">
                  <span class="ui-badge" :class="decision.decision === 'approved' ? 'ui-badge--success' : 'ui-badge--danger'">
                    {{ decision.decision === 'approved' ? t('common.status.approved') : t('common.status.rejected') }}
                  </span>
                  <span class="review__event-by">{{ decision.moderator }}</span>
                </div>
                <time class="ui-hint" :datetime="decision.decidedAt">{{ formatDate(decision.decidedAt) }}</time>
                <blockquote v-if="decision.reason" class="review__reason">{{ decision.reason }}</blockquote>
              </li>
            </ol>
            <p v-else class="ui-hint">{{ t('moderation.detail.noHistory') }}</p>
          </section>
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.review__back { margin-bottom: var(--space-3); }

.review__loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.review__loading p { margin: 0; }

.review__empty-actions { justify-content: center; margin-top: var(--space-4); }

.review__head { align-items: flex-start; }

.review__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.review__banner { margin: 0 0 var(--space-5); }

.review__layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: var(--space-5);
  align-items: start;
}

.review__preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.review__preview-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.review__preview-head .ui-section-title { margin: 0; }

.review__page .ui-eyebrow { margin-bottom: var(--space-3); }

.review__side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  position: sticky;
  top: calc(var(--header-height) + var(--space-4));
}

.review__panel .ui-section-title { font-size: var(--text-lg); }

.review__facts {
  margin: 0 0 var(--space-3);
  display: grid;
  gap: var(--space-2);
}

.review__facts div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--text-sm);
}

.review__facts dt { color: var(--ink-3); }

.review__facts dd { margin: 0; font-weight: 600; text-align: right; }

.review__label {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  color: var(--ink-3);
}

.review__tags { gap: var(--space-2); }

.review__decision {
  border-color: var(--rule-strong);
  box-shadow: var(--shadow-2);
}

.review__decision-buttons {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-top: var(--space-3);
}

.review__reject .review__decision-buttons { margin-top: 0; }

.review__decision .ui-alert { margin: var(--space-3) 0 0; }

.review__history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.review__event {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-left: var(--space-3);
  border-left: 2px solid var(--rule-strong);
}

.review__event-head { gap: var(--space-2); }

.review__event-by { font-weight: 600; font-size: var(--text-sm); }

.review__reason {
  margin: var(--space-1) 0 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: var(--text-sm);
}

@media (max-width: 900px) {
  .review__layout { grid-template-columns: 1fr; }
  .review__side { position: static; }
}
</style>
