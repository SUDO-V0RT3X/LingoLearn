<script setup lang="ts">
//Shown for any address the app doesn't have, instead of a blank page.
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <main class="ui-page ui-page--narrow">
    <section class="ui-card ui-empty">
      <p class="ui-eyebrow">{{ t('common.notFound.eyebrow') }}</p>
      <h1 class="ui-empty__title">{{ t('common.notFound.title') }}</h1>
      <p>{{ t('common.notFound.body') }}</p>
      <RouterLink :to="{ name: 'home' }" class="ui-btn ui-btn--primary">{{ t('common.notFound.action') }}</RouterLink>
    </section>
  </main>
</template>
