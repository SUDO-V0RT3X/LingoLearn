<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// The frame every administrator dialog shares: a dimmed backdrop, a titled
// card, a close button and Escape to close. Each modal supplies its body and
// footer, so the three account dialogs look and behave the same.
// subtitle names the account; a name can be 100 characters with no spaces, so it
// stays on one line, cut short with an ellipsis and given in full as a tooltip.
// subtitleDetail follows it (such as the current role) and is never cut.
const props = withDefaults(defineProps<{ title: string; titleId: string; subtitle?: string; subtitleDetail?: string; wide?: boolean }>(), {
  subtitle: '',
  subtitleDetail: '',
  wide: false,
});
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const dialog = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  await nextTick();
  // Start keyboard users inside the dialog, on its first field when there is one.
  const first = dialog.value?.querySelector<HTMLElement>('select, input, textarea, .admin-modal__body button');
  (first ?? dialog.value)?.focus();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="admin-modal" role="presentation">
    <section
      ref="dialog"
      class="admin-modal__dialog ui-card"
      :class="{ 'admin-modal__dialog--wide': props.wide }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="props.titleId"
      tabindex="-1"
    >
      <header class="admin-modal__head">
        <div class="admin-modal__heading">
          <h2 :id="props.titleId" class="ui-section-title admin-modal__title">{{ props.title }}</h2>
          <p v-if="props.subtitle" class="admin-modal__subtitle" data-testid="admin-modal-subtitle">
            <span class="admin-modal__subject" :title="props.subtitle">{{ props.subtitle }}</span>
            <span v-if="props.subtitleDetail" class="admin-modal__detail">{{ props.subtitleDetail }}</span>
          </p>
        </div>
        <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm admin-modal__close" :aria-label="t('common.states.close')" @click="emit('close')">
          <span aria-hidden="true">&times;</span>
        </button>
      </header>
      <div class="admin-modal__body ui-stack">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="admin-modal__foot">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>

<style scoped>
.admin-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: color-mix(in srgb, var(--ink) 50%, transparent);
}

.admin-modal__dialog {
  width: min(520px, 100%);
  min-width: 0;
  max-height: calc(100vh - 2 * var(--space-4));
  overflow: auto;
  box-shadow: var(--shadow-2);
  /* Names and emails typed at sign-up can be long words: break them rather than
     let them push the dialog wider than the screen. */
  overflow-wrap: anywhere;
}

.admin-modal__dialog--wide {
  width: min(760px, 100%);
}

.admin-modal__dialog:focus-visible {
  box-shadow: var(--shadow-2), var(--focus-ring);
}

.admin-modal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.admin-modal__heading {
  flex: 1 1 auto;
  min-width: 0;
}

.admin-modal__title {
  margin: 0;
}

.admin-modal__subtitle {
  display: flex;
  min-width: 0;
  margin: var(--space-1) 0 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.admin-modal__subject {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-modal__detail {
  flex: none;
  white-space: nowrap;
}

.admin-modal__detail::before {
  content: '·';
  margin: 0 var(--space-1);
}

.admin-modal__close {
  flex: none;
  font-size: var(--text-xl);
  min-width: 32px;
}

.admin-modal__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--rule);
}
</style>
