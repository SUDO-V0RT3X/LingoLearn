<script setup lang="ts">

import { computed } from 'vue'
import type { $ImageBlockValue } from '@/features/shared/models/contentType'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'

const props = defineProps<{ value: $ImageBlockValue }>()

//Uploads are stored as relative paths, so the API origin has to be put back.
const source = computed(() => MediaDataSource.resolveUrl(props.value.fileUrl))

</script>

<template>
  <figure class="image-block">
    <h3 v-if="value.title" class="image-block__title">{{ value.title }}</h3>
    <img v-if="value.fileUrl" :src="source" :alt="value.altText" loading="lazy" />
  </figure>
</template>

<style scoped>
.image-block {
  margin: 0 0 var(--space-5);
}
.image-block__title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink-2);
  margin: 0 0 var(--space-2);
}
.image-block img {
  display: block;
  width: 100%;
  border-radius: var(--radius);
  border: 1px solid var(--rule);
}
</style>
