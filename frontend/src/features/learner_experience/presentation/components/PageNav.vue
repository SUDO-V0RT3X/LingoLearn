<script setup lang="ts">

import { useI18n } from 'vue-i18n'

//current is 1-indexed for display; the viewer keeps the 0-indexed page itself.
const props = defineProps<{ current: number; total: number }>()

const emit = defineEmits<{ (event: 'prev'): void; (event: 'next'): void }>()

const { t } = useI18n()

</script>

<template>
  <nav class="page-nav" :aria-label="t('learner.viewer.pages')">
    <button class="ui-btn page-nav__btn" type="button" :disabled="props.current <= 1" @click="emit('prev')">
      &lsaquo; {{ t('learner.viewer.previous') }}
    </button>
    <div class="page-nav__middle">
      <span class="page-nav__label">{{ t('learner.pageOf', { current: props.current, total: props.total }) }}</span>
      <span class="ui-progress page-nav__progress" aria-hidden="true">
        <span class="ui-progress__bar" :style="{ width: `${props.total > 0 ? (props.current / props.total) * 100 : 0}%` }" />
      </span>
    </div>
    <button class="ui-btn ui-btn--primary page-nav__btn" type="button" :disabled="props.current >= props.total" @click="emit('next')">
      {{ t('common.states.next') }} &rsaquo;
    </button>
  </nav>
</template>

<style scoped>
/* Previous, the page count, Next on one row; on a phone the count takes its own
   row above two equal buttons, so long labels (isiZulu "Okulandelayo") fit. */
.page-nav {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  padding-top: var(--space-4);
  margin-top: var(--space-5);
  border-top: 1px solid var(--rule);
}
.page-nav__btn {
  min-width: 0;
  white-space: normal;
  text-align: center;
  line-height: 1.2;
}
.page-nav__middle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  max-width: 260px;
  justify-self: center;
  min-width: 0;
}
.page-nav__label {
  font-size: var(--text-sm);
  color: var(--ink-2);
  text-align: center;
}
.page-nav__progress {
  display: block;
  width: 100%;
  height: 6px;
}
.page-nav__progress .ui-progress__bar {
  display: block;
}

@media (max-width: 520px) {
  .page-nav {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .page-nav__middle {
    grid-column: 1 / -1;
    grid-row: 1;
    max-width: none;
  }
  .page-nav .page-nav__btn {
    padding: 0 var(--space-2);
    font-size: var(--text-sm);
  }
}
</style>
