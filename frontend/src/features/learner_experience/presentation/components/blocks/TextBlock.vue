<script setup lang="ts">

import type { $TextBlockValue } from '@/features/shared/models/contentType'

defineProps<{ value: $TextBlockValue }>()

</script>

<template>
  <div class="text-block">
    <h2 v-if="value.title" class="text-block__title">{{ value.title }}</h2>
    <p v-if="value.text" class="text-block__body">{{ value.text }}</p>
  </div>
</template>

<style scoped>
.text-block {
  margin: 0 0 var(--space-5);
}
.text-block__title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  margin: 0 0 var(--space-2);
  line-height: 1.3;
}
.text-block__body {
  font-size: var(--text-lg);
  line-height: 1.75;
  margin: 0;
  color: var(--ink);
  white-space: pre-line;
}
</style>
