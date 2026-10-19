<script setup lang="ts">

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { wallpapersFor } from '@/features/learner_experience/functions/wallpapers'

//isChild picks the bright set; current is the wallpaper showing now.
const props = withDefaults(defineProps<{ isChild?: boolean; current?: string | null }>(), { isChild: false, current: null })

//select picks a wallpaper; close leaves the current one as it is.
const emit = defineEmits<{ (event: 'select', css: string): void; (event: 'close'): void }>()

const { t } = useI18n()

const options = computed(() => wallpapersFor(props.isChild))
const grid = ref<HTMLElement | null>(null)
//Focus goes back where it was (the Background button) when the picker closes.
let returnFocusTo: HTMLElement | null = null

//Escape closes, wherever focus is.
function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault()
        emit('close')
    }
}

onMounted(async () => {
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    const chosen = grid.value?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
    ;(chosen ?? grid.value?.querySelector<HTMLButtonElement>('button'))?.focus()
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    returnFocusTo?.focus()
})

</script>

<template>
  <div class="ui-dialog-backdrop" @click.self="emit('close')">
    <div class="ui-dialog wallpaper" role="dialog" aria-modal="true" aria-labelledby="wallpaper-heading" data-testid="wallpaper-picker">
      <h2 id="wallpaper-heading" class="ui-dialog__title">{{ t('learner.wallpaper.title') }}</h2>
      <p class="ui-dialog__body">{{ t('learner.wallpaper.body') }}</p>
      <div ref="grid" class="wallpaper__grid">
        <button
          v-for="wallpaper in options"
          :key="wallpaper.id"
          type="button"
          class="wallpaper__swatch"
          :style="{ background: wallpaper.css }"
          :aria-pressed="wallpaper.css === props.current"
          @click="emit('select', wallpaper.css)"
        >
          <span class="wallpaper__label">{{ t(`learner.wallpaper.names.${wallpaper.id}`) }}</span>
        </button>
      </div>
      <div class="ui-dialog__actions">
        <button type="button" class="ui-btn ui-btn--ghost" @click="emit('close')">{{ t('learner.wallpaper.keep') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallpaper__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.wallpaper__swatch {
  position: relative;
  display: flex;
  align-items: flex-end;
  height: 88px;
  padding: var(--space-2);
  overflow: hidden;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  font: inherit;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.wallpaper__swatch:hover {
  transform: scale(1.03);
}
.wallpaper__swatch[aria-pressed='true'] {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
/* A small light label, readable on dark and bright swatches alike. */
.wallpaper__label {
  max-width: 100%;
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--ink);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  overflow-wrap: anywhere;
}
:root[data-theme='child'] .wallpaper__swatch {
  border-width: 2px;
}
@media (max-width: 420px) {
  .wallpaper__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .wallpaper__swatch:hover {
    transform: none;
  }
}
</style>
