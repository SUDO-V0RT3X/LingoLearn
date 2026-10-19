<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContentStatus } from '@/features/media_feature/models/AuthorDashboardTypes'
import { getStatusMeta } from '@/features/media_feature/functions/contentStatusMeta'

const props = defineProps<{ status: ContentStatus }>()
// Read the locale so the label is worked out again when the language changes.
const { locale } = useI18n()
const meta = computed(() => {
  void locale.value
  return getStatusMeta(props.status)
})
</script>

<template>
  <span :class="['ui-badge', meta.badgeClass]" data-testid="status-badge">{{ meta.label }}</span>
</template>
