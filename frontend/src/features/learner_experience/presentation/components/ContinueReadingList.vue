<script setup lang="ts">

import { useI18n } from 'vue-i18n'
import type { $ContinueReadingRow } from '@/features/learner_experience/models/learnerTypes'
import { progressPercent } from '@/features/learner_experience/functions/learnerCopy'

//Content the learner started and has not finished, most recent first. Each
//opens the reader, which resumes at the saved page.
defineProps<{ rows: $ContinueReadingRow[] }>()

const { t } = useI18n()

</script>

<template>
  <ul class="continue-list">
    <li v-for="row in rows" :key="row.contentId">
      <RouterLink
        class="continue-list__item"
        :to="{ name: 'reader', params: { contentId: String(row.contentId) } }"
        data-testid="continue-reading"
      >
        <span class="continue-list__title">{{ row.title }}</span>
        <span class="continue-list__page">{{ t('learner.pageOf', { current: row.page + 1, total: row.totalPages }) }}</span>
        <span class="ui-progress" aria-hidden="true">
          <span class="ui-progress__bar" :style="{ width: `${progressPercent(row.page + 1, row.totalPages)}%` }" />
        </span>
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped>
.continue-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.continue-list__item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: 100%;
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.continue-list__item:hover {
  box-shadow: var(--shadow-2);
}
.continue-list__title {
  font-weight: 600;
  color: var(--ink);
}
.continue-list__page {
  font-size: var(--text-xs);
  color: var(--ink-3);
}
.continue-list .ui-progress {
  display: block;
  height: 6px;
}
.continue-list .ui-progress__bar {
  display: block;
}
</style>
