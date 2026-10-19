<script setup lang="ts">

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

//A row of stars, some filled: a child's score at a glance. Drawn as SVG, so
//there is nothing to download.
const props = withDefaults(defineProps<{
    filled: number;
    total?: number;
    //Each star's width and height in pixels.
    size?: number;
    //Stars pop in one after another when true.
    animated?: boolean;
}>(), { total: 5, size: 40, animated: false })

const { t } = useI18n()

const stars = computed(() =>
    Array.from({ length: props.total }, (_, index) => index < props.filled))

const label = computed(() => t('learner.results.stars', { filled: Math.min(props.filled, props.total), total: props.total }))

</script>

<template>
  <div class="star-row" :class="{ 'star-row--animated': animated }" role="img" :aria-label="label">
    <svg
      v-for="(isFilled, index) in stars"
      :key="index"
      class="star-row__star"
      :class="{ 'star-row__star--filled': isFilled }"
      :style="{ animationDelay: `${index * 0.12}s` }"
      :width="size"
      :height="size"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-testid="star"
      :data-filled="isFilled"
    >
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" />
    </svg>
  </div>
</template>

<style scoped>
.star-row {
  display: inline-flex;
  gap: var(--space-1);
}
.star-row__star path {
  fill: var(--surface-3);
  stroke: var(--rule-strong);
  stroke-width: 1;
  stroke-linejoin: round;
}
.star-row__star--filled path {
  fill: var(--tone-2);
  stroke: var(--accent);
}
.star-row--animated .star-row__star--filled {
  animation: star-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes star-pop {
  from { transform: scale(0.2) rotate(-30deg); opacity: 0; }
  to { transform: scale(1) rotate(0); opacity: 1; }
}
</style>
