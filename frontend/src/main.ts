import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import { i18n } from './i18n'

const app = createApp(App)

// Server-side has request/error logging; this is the client-side counterpart
// for anything that escapes the ErrorBoundary.
app.config.errorHandler = (err, _instance, info) => {
  console.error('Vue error:', err, info)
}

const pinia = createPinia()

app.use(pinia)

app.use(router)
// Translations. The learner's stored interface language replaces the local
// choice once they sign in (onboarding slice).
app.use(i18n)

app.mount('#app')
