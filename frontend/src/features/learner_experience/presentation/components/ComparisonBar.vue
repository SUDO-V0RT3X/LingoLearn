<script setup lang="ts">

import { useI18n } from 'vue-i18n'
import { themeStore } from '@/features/shared/state/themeStore'

//The "Compare with the example" step of the practice panel: one button for
//the example, one for the learner's own recording, side by side. The panel
//owns the players; this only asks for one to play (or pause, when it already
//is). canCompare is false until there is a recording to compare; playing is
//whichever clip is playing now.
defineProps<{
    canCompare: boolean;
    playing: 'example' | 'mine' | null;
}>()

const emit = defineEmits<{ (event: 'play-example'): void; (event: 'play-mine'): void }>()

const { t } = useI18n()
const theme = themeStore()

</script>

<template>
  <div class="comparison-bar" :class="{ 'comparison-bar--child': theme.isChild }">
    <template v-if="canCompare">
      <div class="comparison-bar__buttons">
        <button
          type="button"
          class="comparison-bar__btn comparison-bar__btn--example"
          data-testid="compare-example"
          @click="emit('play-example')"
        >
          <span class="comparison-bar__icon" aria-hidden="true">{{ playing === 'example' ? '❚❚' : '▶' }}</span>
          <span class="comparison-bar__label">{{ playing === 'example' ? t('learner.recording.pause') : t('learner.recording.playExample') }}</span>
        </button>
        <button
          type="button"
          class="comparison-bar__btn comparison-bar__btn--mine"
          data-testid="compare-mine"
          @click="emit('play-mine')"
        >
          <span class="comparison-bar__icon" aria-hidden="true">{{ playing === 'mine' ? '❚❚' : '▶' }}</span>
          <span class="comparison-bar__label">{{ playing === 'mine' ? t('learner.recording.pause') : t('learner.recording.playMine') }}</span>
        </button>
      </div>
      <p class="comparison-bar__hint">{{ t('learner.recording.compareHint') }}</p>
    </template>
    <p v-else class="comparison-bar__hint comparison-bar__hint--muted">{{ t('learner.recording.compareNeedsRecording') }}</p>
  </div>
</template>

<style scoped>
.comparison-bar__buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}
.comparison-bar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 44px;
  border-radius: var(--radius);
  border: 2px solid transparent;
  padding: 0 var(--space-3);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 700;
  cursor: pointer;
}
.comparison-bar__btn--example {
  background: var(--info-soft);
  border-color: var(--info);
  color: var(--info);
}
.comparison-bar__btn--mine {
  background: var(--success-soft);
  border-color: var(--success);
  color: var(--success);
}
.comparison-bar__btn:hover {
  filter: brightness(0.97);
}
.comparison-bar__icon {
  font-size: 0.8em;
}
.comparison-bar__hint {
  font-size: var(--text-xs);
  color: var(--ink-2);
  margin: var(--space-2) 0 0;
}
.comparison-bar__hint--muted {
  margin: 0;
  color: var(--ink-3);
}
.comparison-bar--child .comparison-bar__btn {
  min-height: 52px;
  font-size: var(--text-md);
}
@media (max-width: 420px) {
  .comparison-bar__buttons {
    grid-template-columns: 1fr;
  }
}
</style>
