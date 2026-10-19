<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContentItem } from '@/features/media_feature/models/AuthorDashboardTypes'
import { intlLocale } from '@/i18n'

const props = defineProps<{ item: ContentItem }>()
const emit = defineEmits<{ 'edit-and-resubmit': [id: number] }>()
const { t, locale } = useI18n()

// The day of the decision, written the way the interface language writes dates.
const reviewedOn = computed(() => {
  if (!props.item.reviewedAt) return ''
  void locale.value
  const when = new Date(props.item.reviewedAt)
  return Number.isNaN(when.getTime()) ? '' : when.toLocaleDateString(intlLocale())
})
</script>

<template>
  <article class="ui-card notice" data-testid="rejected-notice">
    <header class="notice__header">
      <span class="ui-badge ui-badge--danger">{{ t('common.status.rejected') }}</span>
      <h3 class="notice__title">{{ item.title }}</h3>
    </header>
    <blockquote class="notice__note">
      <span class="notice__label">{{ t('media.notice.moderatorNote') }}</span>
      {{ item.moderatorNote || t('media.notice.noNote') }}
    </blockquote>
    <footer class="notice__footer">
      <button type="button" class="ui-btn ui-btn--primary" @click="emit('edit-and-resubmit', item.id)">
        {{ t('media.notice.editAndResubmit') }}
      </button>
      <span v-if="item.reviewedBy" class="ui-hint">
        {{ t('media.notice.reviewedBy', { name: item.reviewedBy }) }}<template v-if="reviewedOn"> · {{ reviewedOn }}</template>
      </span>
    </footer>
  </article>
</template>

<style scoped>
.notice {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border-left: 4px solid var(--danger);
}

.notice__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.notice__title {
  margin: 0;
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.notice__note {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--danger-soft);
  color: var(--ink);
  white-space: pre-line;
}

.notice__label {
  display: block;
  margin-bottom: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--danger);
}

.notice__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
</style>
