<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { toastStore } from '@/features/shared/state/toastStore'

//The shell's one confirmation line, e.g. "Settings saved", at the bottom of the
//screen. It is announced politely and goes by itself; the close button is for
//anyone who wants it gone sooner.
const toast = toastStore()
const { t } = useI18n()
</script>

<template>
  <div class="app-toast-region" role="status" aria-live="polite">
    <Transition name="app-toast">
      <p v-if="toast.messageKey" class="app-toast" data-testid="app-toast">
        <span class="app-toast__mark" aria-hidden="true">✓</span>
        <span class="app-toast__text">{{ t(toast.messageKey) }}</span>
        <button type="button" class="app-toast__close" :aria-label="t('common.states.close')" @click="toast.dismiss()">×</button>
      </p>
    </Transition>
  </div>
</template>

<style scoped>
.app-toast-region {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--space-5);
  z-index: 60;
  display: flex;
  justify-content: center;
  padding: 0 var(--space-4);
  pointer-events: none;
}

.app-toast {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  max-width: 100%;
  margin: 0;
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--surface);
  font-size: var(--text-sm);
  font-weight: 600;
  box-shadow: var(--shadow-2);
  pointer-events: auto;
}

.app-toast__mark {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 50%;
  background: var(--success);
  color: var(--on-primary);
  font-size: var(--text-xs);
}

.app-toast__close {
  width: 28px;
  height: 28px;
  flex: none;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--text-lg);
  line-height: 1;
  cursor: pointer;
}

.app-toast__close:hover {
  background: color-mix(in srgb, var(--surface) 18%, transparent);
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .app-toast-enter-from,
  .app-toast-leave-to {
    transform: none;
  }
}
</style>
