<script setup lang="ts">
import type { StatusFilter } from '@/features/media_feature/models/AuthorDashboardTypes'
import { STATUS_FILTERS } from '@/features/media_feature/models/AuthorDashboardTypes'
import { useI18n } from 'vue-i18n'

defineProps<{
  active: StatusFilter
  // How many items each filter holds; the pills show them when given.
  counts?: Record<StatusFilter, number>
}>()
const emit = defineEmits<{ select: [filter: StatusFilter] }>()

const { t } = useI18n()

// The pills are short, so "Pending" here rather than the badge's "Pending review".
const LABEL_KEYS: Record<StatusFilter, string> = {
  all: 'media.filters.all',
  draft: 'common.status.draft',
  pending: 'media.filters.pending',
  approved: 'common.status.approved',
  rejected: 'common.status.rejected',
}
</script>

<template>
  <div class="pills" role="group" :aria-label="t('media.filters.label')">
    <button
      v-for="filter in STATUS_FILTERS"
      :key="filter"
      type="button"
      :class="['ui-chip', 'pill', { 'ui-chip--active': active === filter }]"
      :aria-pressed="active === filter"
      :data-testid="`filter-pill-${filter}`"
      @click="emit('select', filter)"
    >
      {{ t(LABEL_KEYS[filter]) }} <span v-if="counts" class="pill__count">{{ counts[filter] }}</span>
    </button>
  </div>
</template>

<style scoped>
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pill {
  font: inherit;
  font-size: var(--text-sm);
  min-height: 32px;
  padding: 0 var(--space-3);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.pill:not(.ui-chip--active):hover {
  background: var(--surface-2);
  border-color: var(--rule-strong);
}

.pill__count {
  margin-left: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 700;
  opacity: 0.75;
}
</style>
