<script setup lang="ts">
// The author's home: everything they have written, filtered by status, and the
// moderators' feedback on what was sent back. The app shell's header carries
// the navigation; this screen only has its own two tabs.
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authorDashboardScreenStore } from '@/features/media_feature/state/authorDashboardScreenStore'
import ContentStatusBadge from '../components/ContentStatusBadge.vue'
import ContentFilterPills from '../components/ContentFilterPills.vue'
import RejectedContentNotice from '../components/RejectedContentNotice.vue'
import { getRowActionLabel } from '@/features/media_feature/functions/contentStatusMeta'
import { formatRelativeTime } from '@/features/media_feature/functions/formatRelativeTime'
import type { ContentItem, StatusFilter } from '@/features/media_feature/models/AuthorDashboardTypes'

const store = authorDashboardScreenStore()
const router = useRouter()
const { t } = useI18n()

type DashboardTab = 'content' | 'feedback'
const activeTab = ref<DashboardTab>('content')

const summary = computed(() =>
  `${t('media.dashboard.itemCount', store.totalCount)} · ${t('media.dashboard.awaitingReview', { n: store.awaitingReviewCount })}`,
)

onMounted(() => store.load())

function onSelectFilter(filter: StatusFilter) {
  store.setStatusFilter(filter)
}

function languageOf(item: ContentItem): string {
  return item.language ? t(`common.languages.${item.language}`) : t('media.dashboard.noLanguage')
}

// The builder opens a saved draft at /content-builder/:contentId, and a new one
// at /content-builder?new (plain /content-builder carries on with the draft in progress).
function goToContentBuilder(id?: number) {
  if (id) {
    router.push({ name: 'contentBuilderDraft', params: { contentId: String(id) } })
  } else {
    router.push({ name: 'contentBuilder', query: { new: '1' } })
  }
}
</script>

<template>
  <main class="ui-page dashboard">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ t('media.dashboard.eyebrow') }}</p>
        <h1 class="ui-title">{{ t('media.dashboard.title') }}</h1>
        <p class="ui-subtitle" data-testid="item-summary">{{ summary }}</p>
      </div>
      <button type="button" class="ui-btn ui-btn--primary" data-testid="new-content" @click="goToContentBuilder()">
        {{ t('media.dashboard.newContent') }}
      </button>
    </header>

    <div class="tabs" role="tablist" :aria-label="t('media.dashboard.tabsLabel')">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab--active': activeTab === 'content' }"
        :aria-selected="activeTab === 'content'"
        data-testid="tab-content"
        @click="activeTab = 'content'"
      >
        {{ t('media.dashboard.tabContent') }}
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab--active': activeTab === 'feedback' }"
        :aria-selected="activeTab === 'feedback'"
        data-testid="tab-feedback"
        @click="activeTab = 'feedback'"
      >
        {{ t('media.dashboard.tabFeedback') }}
        <span v-if="store.rejectedItems.length" class="ui-badge ui-badge--danger tab__count">
          {{ store.rejectedItems.length }}
        </span>
      </button>
    </div>

    <div v-if="store.isLoading" class="ui-card ui-card--flat state" role="status" data-testid="loading">
      <span class="ui-spinner" aria-hidden="true"></span>
      <span>{{ t('media.dashboard.loading') }}</span>
    </div>

    <div v-else-if="store.error" class="ui-alert ui-alert--error state--error" role="alert" data-testid="error">
      <span>{{ store.error }}</span>
      <button type="button" class="ui-btn ui-btn--sm" @click="store.load()">{{ t('common.states.retry') }}</button>
    </div>

    <section v-else-if="activeTab === 'content'" class="ui-stack" data-testid="content-tab">
      <ContentFilterPills :active="store.statusFilter" :counts="store.countsByFilter" @select="onSelectFilter" />

      <div v-if="store.totalCount === 0" class="ui-card ui-card--flat ui-empty" data-testid="empty">
        <p class="ui-empty__title">{{ t('media.dashboard.empty.title') }}</p>
        <p>{{ t('media.dashboard.empty.body') }}</p>
        <button type="button" class="ui-btn ui-btn--primary" @click="goToContentBuilder()">{{ t('media.dashboard.empty.action') }}</button>
      </div>

      <div v-else-if="store.filteredItems.length === 0" class="ui-card ui-card--flat ui-empty" data-testid="filter-empty">
        <p class="ui-empty__title">{{ t('media.dashboard.filterEmpty.title') }}</p>
        <p>{{ t('media.dashboard.filterEmpty.body') }}</p>
        <button type="button" class="ui-btn" @click="onSelectFilter('all')">{{ t('media.dashboard.filterEmpty.action') }}</button>
      </div>

      <div v-else class="ui-table-wrap">
        <table class="ui-table" data-testid="content-table">
          <thead>
            <tr>
              <th scope="col">{{ t('media.dashboard.columns.title') }}</th>
              <th scope="col">{{ t('media.dashboard.columns.type') }}</th>
              <th scope="col">{{ t('media.dashboard.columns.level') }}</th>
              <th scope="col">{{ t('media.dashboard.columns.updated') }}</th>
              <th scope="col">{{ t('media.dashboard.columns.status') }}</th>
              <th scope="col"><span class="ui-sr-only">{{ t('media.dashboard.columns.action') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in store.filteredItems" :key="item.id" data-testid="content-row">
              <td>
                <span class="row__title">{{ item.title }}</span>
                <span class="row__meta">
                  {{ languageOf(item) }}<template v-if="item.childFriendly"> · {{ t('common.audience.child') }}</template>
                </span>
              </td>
              <td>
                <span :class="['ui-badge', item.type === 'test' ? 'ui-badge--info' : 'ui-badge--brand']">
                  {{ t(`media.dashboard.types.${item.type}`) }}
                </span>
              </td>
              <td class="muted">{{ item.level ? t('common.level', { level: item.level }) : '—' }}</td>
              <td class="muted nowrap">{{ formatRelativeTime(item.updatedAt) }}</td>
              <td><ContentStatusBadge :status="item.status" /></td>
              <td class="action">
                <button type="button" class="ui-btn ui-btn--sm" data-testid="row-action" @click="goToContentBuilder(item.id)">
                  {{ getRowActionLabel(item.status) }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else class="ui-stack" data-testid="feedback-tab">
      <div v-if="store.rejectedItems.length === 0" class="ui-card ui-card--flat ui-empty" data-testid="no-feedback">
        <p class="ui-empty__title">{{ t('media.dashboard.noFeedback.title') }}</p>
        <p>{{ t('media.dashboard.noFeedback.body') }}</p>
      </div>
      <RejectedContentNotice
        v-for="item in store.rejectedItems"
        :key="item.id"
        :item="item"
        @edit-and-resubmit="goToContentBuilder"
      />
    </section>
  </main>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--rule);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: -1px;
  padding: var(--space-2) var(--space-4);
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--ink-3);
  cursor: pointer;
}

.tab:hover {
  color: var(--ink);
}

.tab--active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.tab__count {
  padding: 0 8px;
}

.state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.state--error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.row__title {
  display: block;
  font-weight: 600;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.row__meta {
  display: block;
  font-size: var(--text-xs);
  color: var(--ink-3);
}

.muted {
  color: var(--ink-2);
}

.nowrap {
  white-space: nowrap;
}

.action {
  text-align: right;
}
</style>
