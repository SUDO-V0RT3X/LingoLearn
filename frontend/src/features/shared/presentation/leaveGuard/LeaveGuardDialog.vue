<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

//The question useLeaveGuard asks: stay (the safe choice, focused first) or
//leave. An alert dialog, so a screen reader announces it straight away; Escape
//stays, and Tab keeps to the two buttons. Focus goes back where it was after.
const props = defineProps<{ title: string; body: string; stayLabel: string; leaveLabel: string }>();
const emit = defineEmits<{ stay: []; leave: [] }>();

const titleId = useId();
const bodyId = useId();
const stayButton = ref<HTMLButtonElement | null>(null);
const leaveButton = ref<HTMLButtonElement | null>(null);
let returnFocusTo: HTMLElement | null = null;

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        emit('stay');
        return;
    }
    if (event.key !== 'Tab') return;
    // Only two places to be: keep the focus inside the dialog.
    event.preventDefault();
    const onStay = document.activeElement === stayButton.value;
    (onStay ? leaveButton.value : stayButton.value)?.focus();
}

onMounted(async () => {
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.addEventListener('keydown', onKeydown);
    await nextTick();
    stayButton.value?.focus();
});

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    returnFocusTo?.focus?.();
});
</script>

<template>
  <div class="leave-guard" role="presentation" data-testid="leave-guard">
    <section
      class="ui-card leave-guard__dialog"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="bodyId"
    >
      <h2 :id="titleId" class="ui-section-title leave-guard__title">{{ props.title }}</h2>
      <p :id="bodyId" class="leave-guard__body">{{ props.body }}</p>
      <div class="leave-guard__actions">
        <button ref="leaveButton" type="button" class="ui-btn" data-testid="leave-guard-leave" @click="emit('leave')">
          {{ props.leaveLabel }}
        </button>
        <button ref="stayButton" type="button" class="ui-btn ui-btn--primary" data-testid="leave-guard-stay" @click="emit('stay')">
          {{ props.stayLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.leave-guard {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: color-mix(in srgb, var(--ink) 50%, transparent);
}

.leave-guard__dialog {
  width: min(460px, 100%);
  box-shadow: var(--shadow-2);
}

.leave-guard__title {
  margin: 0 0 var(--space-2);
}

.leave-guard__body {
  margin: 0 0 var(--space-4);
  color: var(--ink-2);
}

.leave-guard__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}

@media (max-width: 480px) {
  .leave-guard__actions { flex-direction: column-reverse; }
  .leave-guard__actions .ui-btn { width: 100%; }
}
</style>
