<script setup lang="ts">
import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { applyTitle, titleKeyFor } from '@/router'
import ErrorBoundary from '@/features/shared/presentation/ErrorBoundary.vue'
import AppHeader from '@/features/shared/presentation/shell/AppHeader.vue'
import AppToast from '@/features/shared/presentation/shell/AppToast.vue'
import { authStore } from '@/features/auth_feature/state/authStore'
import { themeStore } from '@/features/shared/state/themeStore'
import { applySavedLanguageFor } from '@/features/shared/state/localePreference'

// The shell: the header, then whichever screen the route shows. Whenever the
// signed-in user changes, the theme is worked out again (a child learner gets
// the child theme) and the account's saved interface language is applied.
const auth = authStore()
const theme = themeStore()
const route = useRoute()
const { locale } = useI18n()

watch(() => auth.currentUser, (user) => {
  void theme.refreshFor(user)
  void applySavedLanguageFor(user)
}, { immediate: true })

// The tab title follows a language switch too, and the theme (a child's tab
// uses their header's words).
watch([locale, () => theme.isChild], () => applyTitle(titleKeyFor(route.meta)))
</script>

<template>
  <!-- Focused steps, such as the placement test, show no header. -->
  <AppHeader v-if="!route.meta.hideHeader" />
  <ErrorBoundary>
    <RouterView />
  </ErrorBoundary>
  <AppToast />
</template>
