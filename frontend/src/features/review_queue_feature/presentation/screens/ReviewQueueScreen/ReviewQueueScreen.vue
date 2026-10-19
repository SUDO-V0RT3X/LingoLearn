<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { reviewQueueScreenStore } from './state/reviewQueueScreenStore';
import { WaitingTimeFormatter } from '../../../functions/waitingTimeFormatter';
import { QueueSortFilter, type LevelFilter, type QueueFilters, type SortOrder } from '../../../functions/queueSortFilter';
import { CONTENT_LEVELS } from '@/features/shared/models/contentType';
import type { ReviewQueueRow } from '../../../models/ReviewQueueTypes';
import { intlLocale, localizeServerMessage } from '@/i18n';

const { t, locale } = useI18n();
const store = reviewQueueScreenStore();
onMounted(() => { void store.load(); });

const sortOrder = ref<SortOrder>('oldest');
const levelFilter = ref<LevelFilter>('any');
const typeFilter = ref<NonNullable<QueueFilters['contentType']>>('any');
const audienceFilter = ref<NonNullable<QueueFilters['audience']>>('any');
const search = ref('');

//The sorting and filtering live in the tested QueueSortFilter class.
const visibleItems = computed(() => QueueSortFilter.apply(store.items, sortOrder.value, levelFilter.value, {
    contentType: typeFilter.value,
    audience: audienceFilter.value,
    search: search.value,
}));

const filtersActive = computed(() => levelFilter.value !== 'any' || typeFilter.value !== 'any'
    || audienceFilter.value !== 'any' || search.value.trim() !== '');

function clearFilters() {
    levelFilter.value = 'any';
    typeFilter.value = 'any';
    audienceFilter.value = 'any';
    search.value = '';
}

//The longest wait in the whole queue, whatever is filtered.
const oldest = computed(() => QueueSortFilter.apply(store.items, 'oldest', 'any')[0] ?? null);

// Waiting time comes from the tested WaitingTimeFormatter. Reading the locale
// here makes the template redraw it when the interface language changes.
function formatWaiting(iso: string): string {
    void locale.value;
    return WaitingTimeFormatter.format(iso);
}

//Anything waiting more than two days is flagged.
function waitedLong(iso: string): boolean {
    return Date.now() - new Date(iso).getTime() > 2 * 86_400_000;
}

function levelLabel(level: number): string {
    const named = CONTENT_LEVELS.find(option => option.value === level);
    return named ? `${level} · ${named.label}` : level > 0 ? String(level) : '—';
}

//The language names, type and audience come from the server as fixed values;
//these show them in the interface language.
function languageLabel(language: string | null): string {
    if (language === 'english' || language === 'zulu') return t(`common.languages.${language}`);
    return language ?? '—';
}

function typeLabel(type: ReviewQueueRow['contentType']): string {
    return type === 'Test' ? t('moderation.contentType.test') : t('moderation.contentType.lesson');
}

function submittedTitle(iso: string): string {
    return new Date(iso).toLocaleString(intlLocale());
}
</script>

<template>
  <main class="ui-page ui-page--wide queue">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ t('moderation.eyebrow') }}</p>
        <h1 class="ui-title">{{ t('common.nav.reviewQueue') }}</h1>
        <p class="ui-subtitle" data-testid="queue-summary">
          <template v-if="store.items.length">
            {{ t('moderation.queue.summary', { count: store.items.length }) }}<template v-if="oldest"> · {{ t('moderation.queue.longestWait', { time: formatWaiting(oldest.submittedAt) }) }}</template>
          </template>
          <template v-else>{{ t('moderation.queue.emptySubtitle') }}</template>
        </p>
      </div>
      <button class="ui-btn" type="button" :disabled="store.isLoading" @click="store.load()">
        {{ store.isLoading ? t('moderation.queue.refreshing') : t('moderation.queue.refresh') }}
      </button>
    </header>

    <section class="ui-card queue__filters" :aria-label="t('moderation.queue.filtersLabel')">
      <div class="ui-field queue__search">
        <label class="ui-label" for="queue-search">{{ t('moderation.queue.search') }}</label>
        <input id="queue-search" v-model="search" class="ui-input" type="search" :placeholder="t('moderation.queue.searchPlaceholder')" />
      </div>
      <div class="ui-field">
        <label class="ui-label" for="queue-level">{{ t('moderation.queue.level') }}</label>
        <select id="queue-level" v-model="levelFilter" class="ui-select">
          <option value="any">{{ t('moderation.queue.allLevels') }}</option>
          <option v-for="option in CONTENT_LEVELS" :key="option.value" :value="option.value">{{ option.value }} · {{ option.label }}</option>
        </select>
      </div>
      <div class="ui-field">
        <label class="ui-label" for="queue-type">{{ t('moderation.queue.type') }}</label>
        <select id="queue-type" v-model="typeFilter" class="ui-select">
          <option value="any">{{ t('moderation.queue.typeAny') }}</option>
          <option value="Lesson">{{ t('moderation.queue.lessons') }}</option>
          <option value="Test">{{ t('moderation.queue.tests') }}</option>
        </select>
      </div>
      <div class="ui-field">
        <label class="ui-label" for="queue-audience">{{ t('moderation.queue.audience') }}</label>
        <select id="queue-audience" v-model="audienceFilter" class="ui-select">
          <option value="any">{{ t('moderation.queue.audienceAny') }}</option>
          <option value="Child-friendly">{{ t('common.audience.child') }}</option>
          <option value="General">{{ t('common.audience.general') }}</option>
        </select>
      </div>
      <div class="ui-field">
        <label class="ui-label" for="queue-sort">{{ t('moderation.queue.sort') }}</label>
        <select id="queue-sort" v-model="sortOrder" class="ui-select">
          <option value="oldest">{{ t('moderation.queue.oldestFirst') }}</option>
          <option value="newest">{{ t('moderation.queue.newestFirst') }}</option>
        </select>
      </div>
    </section>

    <section v-if="store.isLoading && store.items.length === 0" class="ui-card queue__loading" aria-busy="true">
      <div class="ui-spinner" aria-hidden="true"></div>
      <p>{{ t('moderation.queue.loading') }}</p>
    </section>

    <section v-else-if="store.error" class="ui-alert ui-alert--error queue__error" role="alert">
      <span>{{ localizeServerMessage(store.error.message) || t('common.states.genericError') }}</span>
      <button class="ui-btn ui-btn--sm" type="button" @click="store.load()">{{ t('common.states.retry') }}</button>
    </section>

    <section v-else-if="store.items.length === 0" class="ui-card ui-empty" data-testid="queue-empty">
      <h2 class="ui-empty__title">{{ t('moderation.queue.emptyTitle') }}</h2>
      <p>{{ t('moderation.queue.emptyBody') }}</p>
    </section>

    <section v-else-if="visibleItems.length === 0" class="ui-card ui-empty" data-testid="queue-no-match">
      <h2 class="ui-empty__title">{{ t('moderation.queue.noMatchTitle') }}</h2>
      <p>{{ t('moderation.queue.noMatchBody', store.items.length) }}</p>
      <button class="ui-btn" type="button" @click="clearFilters">{{ t('moderation.queue.clearFilters') }}</button>
    </section>

    <template v-else>
      <div class="queue__count">
        <span>{{ t('moderation.queue.showing', { shown: visibleItems.length, total: store.items.length }) }}</span>
        <button v-if="filtersActive" class="ui-btn ui-btn--ghost ui-btn--sm" type="button" @click="clearFilters">{{ t('moderation.queue.clearFilters') }}</button>
      </div>
      <div class="ui-table-wrap">
        <table class="ui-table queue__table">
          <thead>
            <tr>
              <th scope="col">{{ t('moderation.queue.columns.content') }}</th>
              <th scope="col">{{ t('moderation.queue.columns.type') }}</th>
              <th scope="col">{{ t('moderation.queue.columns.level') }}</th>
              <th scope="col">{{ t('moderation.queue.columns.audience') }}</th>
              <th scope="col">{{ t('moderation.queue.columns.language') }}</th>
              <th scope="col">{{ t('moderation.queue.columns.waiting') }}</th>
              <th scope="col"><span class="ui-sr-only">{{ t('moderation.queue.columns.action') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleItems" :key="row.id" data-testid="queue-row">
              <td>
                <RouterLink :to="{ name: 'reviewDetail', params: { id: row.id } }" class="queue__title">{{ row.title }}</RouterLink>
                <span class="queue__author">{{ t('moderation.queue.byAuthor', { author: row.author }) }}</span>
              </td>
              <td>
                <span class="ui-badge" :class="row.contentType === 'Test' ? 'ui-badge--info' : ''">{{ typeLabel(row.contentType) }}</span>
              </td>
              <td class="queue__level">{{ levelLabel(row.level) }}</td>
              <td>
                <span v-if="row.audience === 'Child-friendly'" class="ui-badge ui-badge--brand">{{ t('common.audience.child') }}</span>
                <span v-else class="queue__muted">{{ t('common.audience.general') }}</span>
              </td>
              <td>{{ languageLabel(row.language) }}</td>
              <td>
                <span class="queue__wait" :class="{ 'queue__wait--long': waitedLong(row.submittedAt) }" :title="submittedTitle(row.submittedAt)">
                  {{ formatWaiting(row.submittedAt) }}
                </span>
                <span v-if="waitedLong(row.submittedAt)" class="ui-sr-only">{{ t('moderation.queue.waitedLong') }}</span>
              </td>
              <td class="queue__action">
                <RouterLink :to="{ name: 'reviewDetail', params: { id: row.id } }" class="ui-btn ui-btn--sm ui-btn--primary">{{ t('moderation.queue.review') }}</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </main>
</template>

<style scoped>
.queue__filters {
  display: grid;
  grid-template-columns: minmax(200px, 2fr) repeat(4, minmax(140px, 1fr));
  gap: var(--space-3);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}

.queue__loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.queue__loading p { margin: 0; }

.queue__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.queue__count {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  font-size: var(--text-sm);
  color: var(--ink-3);
}

.queue__table td { white-space: nowrap; }

.queue__table td:first-child { white-space: normal; min-width: 220px; }

.queue__title {
  display: block;
  font-weight: 600;
  color: var(--ink);
  text-decoration: none;
}

.queue__title:hover { color: var(--primary); text-decoration: underline; }

.queue__author {
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.queue__level { font-variant-numeric: tabular-nums; }

.queue__muted { color: var(--ink-3); }

.queue__wait {
  font-variant-numeric: tabular-nums;
  color: var(--ink-2);
}

.queue__wait--long {
  color: var(--warning);
  font-weight: 700;
}

.queue__action { text-align: right; }

@media (max-width: 900px) {
  .queue__filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .queue__search { grid-column: 1 / -1; }
}
</style>
