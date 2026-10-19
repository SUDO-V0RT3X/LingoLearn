<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { groupLinkCode } from '@/features/auth_feature/functions/linkCode'

// A learner's live guardian link code, made to be read aloud or copied: big
// monospace characters in two groups of three ("ABC 234"), the time left, and
// a copy button that says when it worked. The value copied is the plain 6
// characters. A child gets bright tiles; an adult plain ones.
// Slot "actions" sits beside the copy button; the default slot goes underneath.

const props = defineProps<{ code: string; countdown: string; isChild: boolean }>()
const { t } = useI18n()

// How long the button says "Copied" before it offers to copy again.
const COPIED_MS = 2500

const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
let copiedTimer: number | undefined

const groups = computed(() => groupLinkCode(props.code))
// Read out one character at a time, so a screen reader spells the code.
const spokenCode = computed(() => groups.value.map((group) => group.split('').join(' ')).join(', '))

async function copyCode() {
  window.clearTimeout(copiedTimer)
  try {
    await navigator.clipboard.writeText(props.code)
    copyState.value = 'copied'
    copiedTimer = window.setTimeout(() => { copyState.value = 'idle' }, COPIED_MS)
  } catch {
    copyState.value = 'failed'
  }
}

// A new code has not been copied yet.
watch(() => props.code, () => {
  window.clearTimeout(copiedTimer)
  copyState.value = 'idle'
})

onBeforeUnmount(() => window.clearTimeout(copiedTimer))
</script>

<template>
  <div class="link-code" :class="{ 'link-code--child': isChild }">
    <p class="link-code__label">{{ isChild ? t('identity.parentLink.codeLabelChild') : t('identity.parentLink.codeHeading') }}</p>
    <p class="link-code__tiles" role="img" data-testid="link-code" :aria-label="t('identity.parentLink.codeAria', { code: spokenCode })">
      <span v-for="(group, groupIndex) in groups" :key="groupIndex" class="link-code__group" aria-hidden="true">
        <span
          v-for="(character, index) in group.split('')"
          :key="index"
          class="link-code__tile"
          :class="`link-code__tile--${((groupIndex * 3 + index) % 5) + 1}`"
        >{{ character }}</span>
      </span>
    </p>
    <I18nT :keypath="isChild ? 'identity.parentLink.expiresChild' : 'identity.parentLink.expires'" tag="p" class="link-code__expiry" scope="global">
      <template #time><strong>{{ countdown }}</strong></template>
    </I18nT>
    <div class="ui-row link-code__actions">
      <button
        type="button"
        class="ui-btn ui-btn--sm link-code__copy"
        :class="{ 'link-code__copy--done': copyState === 'copied' }"
        data-testid="copy-code"
        @click="copyCode"
      >
        <svg v-if="copyState === 'copied'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
        {{ copyState === 'copied' ? t('identity.parentLink.copied') : t('identity.parentLink.copy') }}
      </button>
      <slot name="actions" />
    </div>
    <p class="ui-sr-only" role="status">{{ copyState === 'copied' ? t('identity.parentLink.copiedStatus') : '' }}</p>
    <p v-if="copyState === 'failed'" class="ui-hint link-code__hint">{{ t('identity.parentLink.copyFailed') }}</p>
    <slot />
  </div>
</template>

<style scoped>
.link-code {
  display: grid;
  justify-items: center;
  gap: var(--space-2);
}

.link-code p {
  margin: 0;
}

.link-code__label {
  color: var(--ink-3);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Two groups of three, with a wider gap between them: "ABC 234". */
.link-code__tiles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2) var(--space-5);
}

.link-code__group {
  display: flex;
  gap: var(--space-2);
}

.link-code__tile {
  display: grid;
  place-items: center;
  width: 52px;
  height: 64px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: 700;
  line-height: 1;
}

.link-code__expiry {
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.link-code__expiry strong {
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}

.link-code__actions {
  justify-content: center;
}

.link-code__copy {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.link-code__copy--done {
  border-color: var(--success);
  background: var(--success-soft);
  color: var(--success);
}

.link-code__hint {
  max-width: 40ch;
}

/* A child's tiles take the bright tones, still in the same monospace letters. */
.link-code--child .link-code__tile {
  width: 58px;
  height: 74px;
  border: 0;
  color: var(--on-primary);
  box-shadow: 0 4px 0 color-mix(in srgb, var(--ink) 18%, transparent);
  animation: link-code-pop 0.4s ease both;
}

.link-code--child .link-code__tile--1 { background: var(--tone-1); }
.link-code--child .link-code__tile--2 { background: var(--tone-2); }
.link-code--child .link-code__tile--3 { background: var(--tone-3); }
.link-code--child .link-code__tile--4 { background: var(--tone-4); }
.link-code--child .link-code__tile--5 { background: var(--tone-5); }

.link-code--child .link-code__group:last-child .link-code__tile { animation-delay: 0.15s; }

.link-code--child .link-code__copy {
  min-height: 44px;
  font-size: var(--text-md);
}

@keyframes link-code-pop {
  from { transform: translateY(8px) scale(0.9); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@media (max-width: 480px) {
  .link-code__tiles {
    gap: var(--space-2) var(--space-3);
  }

  .link-code__group {
    gap: 6px;
  }

  .link-code__tile,
  .link-code--child .link-code__tile {
    width: 40px;
    height: 54px;
    font-size: var(--text-2xl);
  }
}
</style>
