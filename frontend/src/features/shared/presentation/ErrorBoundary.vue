<script setup lang="ts">
// Front-end error boundary (hard requirement). onErrorCaptured catches render
// and lifecycle errors from any descendant screen; app.config.errorHandler in
// main.ts logs anything that escapes.
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const error = ref<Error | null>(null)
const route = useRoute()
const { t } = useI18n()

onErrorCaptured((err) => {
  console.error('Unhandled render error:', err)
  error.value = err instanceof Error ? err : new Error(String(err))
  return false // stop propagation; we've handled it
})

// Moving to another page clears the error, so one broken screen never traps the user.
watch(() => route.fullPath, () => { error.value = null })
</script>

<template>
  <main v-if="error" role="alert" class="ui-page ui-page--narrow">
    <section class="ui-card ui-empty">
      <p class="ui-eyebrow">{{ t('common.errorBoundary.eyebrow') }}</p>
      <h1 class="ui-empty__title">{{ t('common.errorBoundary.title') }}</h1>
      <p>{{ t('common.errorBoundary.body') }}</p>
      <div class="ui-row" style="justify-content: center">
        <button type="button" class="ui-btn ui-btn--primary" @click="error = null">{{ t('common.errorBoundary.retry') }}</button>
        <RouterLink :to="{ name: 'home' }" class="ui-btn">{{ t('common.errorBoundary.home') }}</RouterLink>
      </div>
    </section>
  </main>
  <slot v-else />
</template>
