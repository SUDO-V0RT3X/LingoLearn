<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { APP_NAME } from '@/core/brand'
import { ACCOUNT_LIMITS, NAME_PATTERN, USERNAME_PATTERN } from '@/core/limits'
import { localizeServerMessage } from '@/i18n'
import { authStore, type SignUpInput, type UserRole } from '@/features/auth_feature/state/authStore'
import { clearValidity, localizeValidity } from '@/features/shared/presentation/forms/localizedValidity'

type AuthMode = 'signIn' | 'signUp'

const router = useRouter()
const state = authStore()
const { t } = useI18n()

// Only the roles anyone may create for themselves. Author, moderator and
// administrator accounts are seeded by an administrator (npm run seed:staff).
const roleOptions = computed<Array<{ value: UserRole; label: string; description: string }>>(() => [
  { value: 'learner', label: t('common.roles.learner'), description: t('identity.signIn.learnerDescription') },
  { value: 'guardian', label: t('common.roles.guardian'), description: t('identity.signIn.guardianDescription') },
])

const highlights = computed(() => [
  t('identity.signIn.highlight1'),
  t('identity.signIn.highlight2'),
  t('identity.signIn.highlight3'),
])

const mode = ref<AuthMode>('signIn')
const isSubmitting = ref(false)
// What went wrong, kept as a message key (our own wording) or the server's text,
// so the alert follows the interface language even if it changes afterwards.
const errorSource = ref<{ key: string } | { server: string } | null>(null)
const errorMessage = computed(() => {
  const source = errorSource.value
  if (!source) return ''
  return 'key' in source ? t(source.key) : localizeServerMessage(source.server)
})
const passwordsMismatch = computed(() => errorSource.value !== null && 'key' in errorSource.value
  && errorSource.value.key === 'identity.signIn.passwordsMismatch')
const showPassword = ref(false)

const signInForm = reactive({
  identifier: '',
  password: '',
})

const signUpForm = reactive({
  username: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'learner' as UserRole,
})

const isLearnerSignup = computed(() => mode.value === 'signUp' && signUpForm.role === 'learner')
const heading = computed(() => (mode.value === 'signIn' ? t('identity.signIn.headingSignIn') : t('identity.signIn.headingSignUp')))
const subtitle = computed(() =>
  mode.value === 'signIn'
    ? t('identity.signIn.subtitleSignIn', { app: APP_NAME })
    : t('identity.signIn.subtitleSignUp'),
)
const actionText = computed(() => {
  if (isSubmitting.value) return mode.value === 'signIn' ? t('identity.signIn.signingIn') : t('identity.signIn.creatingAccount')
  return mode.value === 'signIn' ? t('identity.signIn.signIn') : t('identity.signIn.createAccount')
})
const passwordType = computed(() => (showPassword.value ? 'text' : 'password'))
// Fields the server named in its last refusal, so they can be marked invalid.
const invalidFields = computed(() => new Set((state.error?.issues ?? []).map((issue) => issue.field)))

watch(mode, () => {
  showPassword.value = false
  clearError()
})

watch(() => signUpForm.role, () => {
  clearError()
})

function clearError() {
  errorSource.value = null
  state.clearError()
}

function setMode(nextMode: AuthMode) {
  mode.value = nextMode
}

/**
 * Performs the same basic email shape check that the backend applies for
 * non-learner accounts. Learners sign up with usernames only, so this helper is
 * only used when the selected role needs an email address for identity.
 */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim().toLowerCase())
}

/**
 * Converts the reactive form fields into the account creation payload expected
 * by the auth store. It keeps learner signup separate from the other roles so a
 * learner sends first name, last name, username, and password, while guardians
 * send first name, last name, email, and password.
 */
function buildSignUpInput(): SignUpInput | null {
  if (signUpForm.password !== signUpForm.confirmPassword) {
    errorSource.value = { key: 'identity.signIn.passwordsMismatch' }
    return null
  }

  if (signUpForm.role === 'learner') {
    return {
      role: 'learner',
      firstName: signUpForm.firstName,
      lastName: signUpForm.lastName,
      username: signUpForm.username,
      password: signUpForm.password,
    }
  }

  if (!isValidEmail(signUpForm.email)) {
    errorSource.value = { key: 'identity.signIn.invalidEmail' }
    return null
  }

  return {
    role: signUpForm.role,
    firstName: signUpForm.firstName,
    lastName: signUpForm.lastName,
    email: signUpForm.email,
    password: signUpForm.password,
  } as SignUpInput
}

/**
 * Runs the submit flow for the active tab and centralises the loading, error,
 * and redirect behaviour. Successful sign-in and successful signup both create
 * a session through the store, then send the user to their own home page.
 */
async function submitAuthForm() {
  if (isSubmitting.value) return
  clearError()
  isSubmitting.value = true

  try {
    const success = mode.value === 'signIn'
      ? await state.login({
          identifier: signInForm.identifier,
          password: signInForm.password,
        })
      : await submitSignUp()

    if (!success) {
      if (errorSource.value) return
      errorSource.value = state.error?.message ? { server: state.error.message } : { key: 'common.states.genericError' }
      return
    }

    await router.push({ name: 'home' })
  } catch (error) {
    errorSource.value = error instanceof Error && error.message ? { server: error.message } : { key: 'common.states.genericError' }
  } finally {
    isSubmitting.value = false
  }
}

/**
 * Builds a valid signup request before calling the store. Returning false lets
 * the shared submit handler show the validation message without also attempting
 * a login-style error fallback.
 */
async function submitSignUp(): Promise<boolean> {
  const input = buildSignUpInput()
  if (!input) return false
  return state.signUp(input)
}
</script>

<template>
  <main class="auth">
    <aside class="auth__brand" aria-hidden="true">
      <div class="auth__brand-inner">
        <span class="auth__mark">
          <svg viewBox="0 0 32 32" width="44" height="44">
            <rect width="32" height="32" rx="9" class="auth__mark-bg" />
            <path d="M9 21.5c0-5.8 4.2-10.5 10.5-11-.3 5.9-4.2 10.6-10.5 11z" class="auth__mark-leaf" />
            <path d="M9 21.5c2.6-2.9 5.4-5.1 8.4-6.6" class="auth__mark-vein" />
          </svg>
        </span>
        <p class="auth__brand-name">{{ APP_NAME }}</p>
        <p class="auth__brand-tagline">{{ t('common.appTagline') }}</p>
        <ul class="auth__highlights">
          <li v-for="item in highlights" :key="item">{{ item }}</li>
        </ul>
      </div>
    </aside>

    <section class="auth__panel" aria-labelledby="auth-title">
      <div class="auth__card ui-card">
        <p class="auth__compact-brand">{{ APP_NAME }}</p>
        <header class="auth__header">
          <h1 id="auth-title" class="ui-title auth__title">{{ heading }}</h1>
          <p class="ui-subtitle">{{ subtitle }}</p>
        </header>

        <div class="auth__tabs" role="tablist" :aria-label="t('identity.signIn.tabsLabel')">
          <button
            id="auth-tab-sign-in"
            type="button"
            role="tab"
            class="auth__tab"
            :class="{ 'auth__tab--active': mode === 'signIn' }"
            :aria-selected="mode === 'signIn'"
            aria-controls="auth-form"
            @click="setMode('signIn')"
          >
            {{ t('identity.signIn.signIn') }}
          </button>
          <button
            id="auth-tab-sign-up"
            type="button"
            role="tab"
            class="auth__tab"
            :class="{ 'auth__tab--active': mode === 'signUp' }"
            :aria-selected="mode === 'signUp'"
            aria-controls="auth-form"
            @click="setMode('signUp')"
          >
            {{ t('identity.signIn.createAccount') }}
          </button>
        </div>

        <form
          id="auth-form"
          class="auth__form"
          role="tabpanel"
          :aria-labelledby="mode === 'signIn' ? 'auth-tab-sign-in' : 'auth-tab-sign-up'"
          @submit.prevent="submitAuthForm"
          @invalid.capture="localizeValidity"
          @input="clearValidity"
          @change="clearValidity"
        >
          <fieldset v-if="mode === 'signUp'" class="auth__roles">
            <legend class="ui-label">{{ t('identity.signIn.accountType') }}</legend>
            <label
              v-for="role in roleOptions"
              :key="role.value"
              class="auth__role"
              :class="{ 'auth__role--selected': signUpForm.role === role.value }"
            >
              <input v-model="signUpForm.role" type="radio" name="role" :value="role.value" @change="clearError">
              <span class="auth__role-label">{{ role.label }}</span>
              <span class="auth__role-description">{{ role.description }}</span>
            </label>
          </fieldset>

          <div v-if="mode === 'signUp'" class="auth__row">
            <div class="ui-field">
              <label class="ui-label" for="auth-first-name">{{ t('identity.signIn.firstName') }}</label>
              <input
                v-model.trim="signUpForm.firstName"
                class="ui-input"
                type="text"
                id="auth-first-name"
                name="first-name"
                autocomplete="given-name"
                :minlength="ACCOUNT_LIMITS.nameMin"
                :maxlength="ACCOUNT_LIMITS.nameMax"
                :pattern="NAME_PATTERN"
                :data-pattern-message="t('identity.signIn.nameRule')"
                required
                :aria-invalid="invalidFields.has('firstName')"
                @input="clearError"
              />
            </div>
            <div class="ui-field">
              <label class="ui-label" for="auth-last-name">{{ t('identity.signIn.lastName') }}</label>
              <input
                v-model.trim="signUpForm.lastName"
                class="ui-input"
                type="text"
                id="auth-last-name"
                name="last-name"
                autocomplete="family-name"
                :minlength="ACCOUNT_LIMITS.nameMin"
                :maxlength="ACCOUNT_LIMITS.nameMax"
                :pattern="NAME_PATTERN"
                :data-pattern-message="t('identity.signIn.nameRule')"
                required
                :aria-invalid="invalidFields.has('lastName')"
                @input="clearError"
              />
            </div>
          </div>

          <div v-if="isLearnerSignup" class="ui-field">
            <label class="ui-label" for="auth-username">{{ t('identity.signIn.username') }}</label>
            <input
              v-model.trim="signUpForm.username"
              class="ui-input"
              type="text"
              id="auth-username"
              name="username"
              autocomplete="username"
              :minlength="ACCOUNT_LIMITS.usernameMin"
              :maxlength="ACCOUNT_LIMITS.usernameMax"
              :pattern="USERNAME_PATTERN"
              :data-pattern-message="t('identity.signIn.usernameRule')"
              required
              :aria-invalid="invalidFields.has('username')"
              aria-describedby="username-hint"
              @input="clearError"
            />
            <span id="username-hint" class="ui-hint">{{ t('identity.signIn.usernameHint') }}</span>
          </div>

          <div v-if="mode === 'signIn'" class="ui-field">
            <label class="ui-label" for="auth-identifier">{{ t('identity.signIn.identifier') }}</label>
            <input
              v-model.trim="signInForm.identifier"
              class="ui-input"
              type="text"
              id="auth-identifier"
              name="identifier"
              autocomplete="username"
              :maxlength="Math.max(ACCOUNT_LIMITS.emailMax, ACCOUNT_LIMITS.usernameMax)"
              required
              aria-describedby="identifier-hint"
              @input="clearError"
            />
            <span id="identifier-hint" class="ui-hint">{{ t('identity.signIn.identifierHint') }}</span>
          </div>

          <div v-if="mode === 'signUp' && !isLearnerSignup" class="ui-field">
            <label class="ui-label" for="auth-email">{{ t('identity.signIn.email') }}</label>
            <input
              v-model.trim="signUpForm.email"
              class="ui-input"
              type="email"
              id="auth-email"
              name="email"
              autocomplete="email"
              :minlength="ACCOUNT_LIMITS.emailMin"
              :maxlength="ACCOUNT_LIMITS.emailMax"
              required
              :aria-invalid="invalidFields.has('email')"
              @input="clearError"
            />
          </div>

          <div class="ui-field">
            <span class="auth__label-row">
              <label class="ui-label" for="auth-password">{{ t('identity.signIn.password') }}</label>
              <button
                type="button"
                class="auth__reveal"
                :aria-pressed="showPassword"
                aria-controls="auth-password"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? t('identity.signIn.hide') : t('identity.signIn.show') }}
              </button>
            </span>
            <input
              v-if="mode === 'signIn'"
              id="auth-password"
              v-model="signInForm.password"
              class="ui-input"
              :type="passwordType"
              name="password"
              autocomplete="current-password"
              :maxlength="ACCOUNT_LIMITS.passwordMax"
              required
              @input="clearError"
            />
            <input
              v-else
              id="auth-password"
              v-model="signUpForm.password"
              class="ui-input"
              :type="passwordType"
              name="password"
              autocomplete="new-password"
              :minlength="ACCOUNT_LIMITS.passwordMin"
              :maxlength="ACCOUNT_LIMITS.passwordMax"
              required
              :aria-invalid="invalidFields.has('password')"
              aria-describedby="password-hint"
              @input="clearError"
            />
            <span v-if="mode === 'signUp'" id="password-hint" class="ui-hint">{{ t('identity.signIn.passwordHint') }}</span>
          </div>

          <div v-if="mode === 'signUp'" class="ui-field">
            <label class="ui-label" for="auth-confirm-password">{{ t('identity.signIn.confirmPassword') }}</label>
            <input
              v-model="signUpForm.confirmPassword"
              class="ui-input"
              :type="passwordType"
              id="auth-confirm-password"
              name="confirm-password"
              autocomplete="new-password"
              :maxlength="ACCOUNT_LIMITS.passwordMax"
              required
              :aria-invalid="passwordsMismatch"
              @input="clearError"
            />
          </div>

          <p v-if="errorMessage" class="ui-alert ui-alert--error" role="alert">{{ errorMessage }}</p>

          <button class="ui-btn ui-btn--primary ui-btn--lg auth__submit" type="submit" :disabled="isSubmitting">
            <span v-if="isSubmitting" class="ui-spinner auth__spinner" aria-hidden="true" />
            {{ actionText }}
          </button>
        </form>

        <p class="auth__switch">
          <template v-if="mode === 'signIn'">
            {{ t('identity.signIn.newTo', { app: APP_NAME }) }}
            <button type="button" class="auth__link" @click="setMode('signUp')">{{ t('identity.signIn.createAnAccount') }}</button>
          </template>
          <template v-else>
            {{ t('identity.signIn.haveAccount') }}
            <button type="button" class="auth__link" @click="setMode('signIn')">{{ t('identity.signIn.signIn') }}</button>
          </template>
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.auth {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  min-height: calc(100vh - var(--header-height));
}

/* ------------------------------------------------------------- brand side */

.auth__brand {
  position: relative;
  display: flex;
  align-items: center;
  padding: var(--space-7) var(--space-6);
  overflow: hidden;
  background: var(--primary);
  color: var(--on-primary);
}

/* Two soft rings in the brand colours, for depth. */
.auth__brand::before,
.auth__brand::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.auth__brand::before {
  width: 420px;
  height: 420px;
  right: -160px;
  bottom: -140px;
  border: 56px solid color-mix(in srgb, var(--accent) 30%, transparent);
}

.auth__brand::after {
  width: 200px;
  height: 200px;
  left: -70px;
  top: -60px;
  background: color-mix(in srgb, var(--on-primary) 8%, transparent);
}

.auth__brand-inner {
  position: relative;
  z-index: 1;
  max-width: 420px;
  margin-left: auto;
}

.auth__mark-bg {
  fill: var(--on-primary);
}

.auth__mark-leaf {
  fill: var(--primary);
}

.auth__mark-vein {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.auth__brand-name {
  margin: var(--space-4) 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 600;
  line-height: 1.1;
}

.auth__brand-tagline {
  margin: 0;
  font-size: var(--text-lg);
  opacity: 0.88;
}

.auth__highlights {
  display: grid;
  gap: var(--space-3);
  margin: var(--space-6) 0 0;
  padding: 0;
  list-style: none;
}

.auth__highlights li {
  position: relative;
  padding-left: var(--space-6);
  font-size: var(--text-md);
}

.auth__highlights li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.2em;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
}

.auth__highlights li::after {
  content: '';
  position: absolute;
  left: 6px;
  top: calc(0.2em + 4px);
  width: 5px;
  height: 9px;
  border: solid var(--primary);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* -------------------------------------------------------------- form side */

.auth__panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-7) var(--space-5);
}

.auth__card {
  width: min(100%, 440px);
  padding: var(--space-6);
  box-shadow: var(--shadow-2);
}

.auth__compact-brand {
  display: none;
  margin: 0 0 var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--primary);
}

.auth__header {
  margin-bottom: var(--space-5);
}

.auth__title {
  font-size: var(--text-2xl);
}

.auth__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
  margin-bottom: var(--space-5);
  padding: var(--space-1);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.auth__tab {
  min-height: 38px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-weight: 600;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.auth__tab:hover {
  color: var(--ink);
}

.auth__tab--active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-1);
}

.auth__form {
  display: grid;
  gap: var(--space-4);
}

.auth__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.auth__roles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.auth__roles legend {
  margin-bottom: var(--space-2);
}

.auth__role {
  position: relative;
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.auth__role:hover {
  border-color: var(--primary);
}

.auth__role:focus-within {
  box-shadow: var(--focus-ring);
}

.auth__role input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.auth__role--selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.auth__role-label {
  font-weight: 700;
}

.auth__role-description {
  font-size: var(--text-xs);
  color: var(--ink-2);
}

.auth__label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.auth__reveal,
.auth__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.auth__reveal {
  font-size: var(--text-xs);
}

.auth__reveal:hover,
.auth__link:hover {
  text-decoration: underline;
}

.auth__submit {
  width: 100%;
  margin-top: var(--space-1);
}

.auth__spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
  border-color: color-mix(in srgb, var(--on-primary) 35%, transparent);
  border-top-color: var(--on-primary);
}

.auth__switch {
  margin: var(--space-5) 0 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--ink-2);
}

@media (max-width: 900px) {
  .auth {
    grid-template-columns: 1fr;
  }

  .auth__brand {
    display: none;
  }

  .auth__compact-brand {
    display: block;
  }

  .auth__panel {
    align-items: flex-start;
    padding: var(--space-5) var(--space-4);
  }
}

@media (max-width: 480px) {
  .auth__card {
    padding: var(--space-5);
  }

  .auth__row,
  .auth__roles {
    grid-template-columns: 1fr;
  }
}
</style>
