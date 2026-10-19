<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supportedLocales, type SupportedLocale } from '@/i18n'
import { chooseLanguage } from '@/features/shared/state/localePreference'
import { forgetPlacement } from '@/features/shared/state/placementGate'
import { APP_NAME } from '@/core/brand'
import { authStore } from '@/features/auth_feature/state/authStore'
import { themeStore } from '@/features/shared/state/themeStore'
import { testRunnerStore } from '@/features/learner_experience/presentation/state/testRunnerStore'
import { challengePlayStore } from '@/features/progress_feature/presentation/screens/ChallengePlayScreen/state/challengePlayStore'
import { navFor, ROLE_LABEL_KEYS } from './navigation'

//The bar across the top of every screen: the product, the signed-in user's own
//places, and signing out. What it offers depends only on the user's role (and,
//for a learner, whether they are a child). On a narrow screen the places, the
//language switch and signing out fold into one menu behind a button.
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const auth = authStore()
const theme = themeStore()
const testRunner = testRunnerStore()
const challenge = challengePlayStore()

const user = computed(() => auth.currentUser)
//While a learner is part way through a test, the header's links are locked so a
//stray click cannot walk away from unsubmitted answers.
const testInProgress = computed(() =>
    route.name === 'test'
    && (!testRunner.hasLoaded
        || testRunner.isLoading
        || (testRunner.questions.length > 0 && testRunner.result == null && testRunner.loadError == null))
)
//The level-up challenge is locked the same way: while it is starting, while its
//questions are showing, and while the answers are on their way. Its result, or a
//refusal or failure to start, unlocks the header again.
const challengeInProgress = computed(() =>
    route.name === 'challengePlay'
    && (challenge.phase === 'loading' || challenge.phase === 'playing' || challenge.phase === 'submitting')
)
const headerLocked = computed(() => testInProgress.value || challengeInProgress.value)
const lockedHint = computed(() =>
    challengeInProgress.value ? t('common.nav.lockedDuringChallenge') : t('common.nav.lockedDuringTest'))

const links = computed(() => {
    if (!user.value) return []
    return navFor(user.value.role, theme.isChild).filter(item => router.hasRoute(item.to.name))
})
const displayName = computed(() =>
    user.value?.firstName || user.value?.name || user.value?.username || user.value?.email || '')
const roleLabel = computed(() => {
    if (!user.value) return ''
    return theme.isChild ? t('common.roles.youngLearner') : t(ROLE_LABEL_KEYS[user.value.role])
})
const initial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || '?')
//The English/isiZulu switch is for whoever has no other place to choose:
//signed-out visitors (so sign-up can be read in isiZulu), guardians and staff.
//A learner chooses in their settings, and only while learning isiZulu (a
//learner of English reads the app in English), so their header has none.
const showLanguageSwitch = computed(() => user.value?.role !== 'learner')

//The folded menu on a narrow screen.
const navOpen = ref(false)
const headerEl = ref<HTMLElement | null>(null)
const menuButton = ref<HTMLButtonElement | null>(null)

function closeMenus(): void {
    navOpen.value = false
}

function toggleNav(): void {
    navOpen.value = !navOpen.value
}

//Escape closes the menu and puts focus back on its button.
function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !navOpen.value) return
    navOpen.value = false
    void nextTick(() => menuButton.value?.focus())
}

//A press anywhere outside the header closes the menu.
function onPointerDown(event: PointerEvent): void {
    if (!navOpen.value) return
    if (headerEl.value && event.target instanceof Node && headerEl.value.contains(event.target)) return
    closeMenus()
}

onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    document.addEventListener('pointerdown', onPointerDown)
    if (typeof ResizeObserver !== 'undefined' && innerEl.value) {
        resizeObserver = new ResizeObserver(() => fitLinks())
        resizeObserver.observe(innerEl.value)
    }
    //The window's own event too: it fires even where the observer is late.
    window.addEventListener('resize', fitLinks)
    void refit()
})
onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('pointerdown', onPointerDown)
    resizeObserver?.disconnect()
    window.removeEventListener('resize', fitLinks)
})

//Following a link (or being sent somewhere) closes the menus.
watch(() => route.fullPath, closeMenus)

//Whether the links fold into the menu even on a wider screen: they do as soon
//as they would not fit beside the language switch and the profile (long
//isiZulu names, a child's bigger links, an administrator's four places).
//Phones always fold (CSS, below 720px); this covers everything in between.
const compact = ref(false)
const innerEl = ref<HTMLElement | null>(null)
const navEl = ref<HTMLElement | null>(null)
//How wide the bar must be to show everything on one line, from the last time
//it was laid out in full.
let fullWidthNeeded = 0
let resizeObserver: ResizeObserver | null = null

function fitLinks(): void {
    const inner = innerEl.value
    const nav = navEl.value
    if (!inner || !nav || !user.value) {
        compact.value = false
        return
    }
    if (!compact.value) {
        const overflow = nav.scrollWidth - nav.clientWidth
        if (overflow > 1) {
            fullWidthNeeded = inner.clientWidth + overflow
            compact.value = true
        }
    } else if (inner.clientWidth > fullWidthNeeded) {
        //Room again: lay it out in full and check.
        compact.value = false
        void nextTick(fitLinks)
    }
}

//New words (a language switch) or new links: measure again from the full layout.
async function refit(): Promise<void> {
    compact.value = false
    fullWidthNeeded = 0
    await nextTick()
    fitLinks()
}
watch([locale, () => links.value.map(link => link.label).join(), () => theme.isChild, roleLabel], () => { void refit() })

function switchLanguage(next: SupportedLocale) {
    if (next !== locale.value) void chooseLanguage(next, user.value)
}
const signingOut = ref(false)

async function signOut() {
    signingOut.value = true
    try {
        await auth.logout()
    } finally {
        forgetPlacement()
        signingOut.value = false
        closeMenus()
        await router.push({ name: 'signIn' })
    }
}
</script>

<template>
  <header ref="headerEl" class="app-header" :class="{ 'app-header--signed-in': user, 'app-header--compact': user && compact }">
    <div ref="innerEl" class="app-header__inner">
      <component
        :is="headerLocked ? 'span' : RouterLink"
        v-bind="headerLocked ? {} : { to: user ? { name: 'home' } : { name: 'signIn' } }"
        class="app-header__brand"
        :aria-label="t('common.nav.home', { app: APP_NAME })"
      >
        <span class="app-header__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="32" height="32">
            <rect width="32" height="32" rx="9" class="app-header__mark-bg" />
            <path d="M9 21.5c0-5.8 4.2-10.5 10.5-11-.3 5.9-4.2 10.6-10.5 11z" class="app-header__mark-leaf" />
            <path d="M9 21.5c2.6-2.9 5.4-5.1 8.4-6.6" class="app-header__mark-vein" />
          </svg>
        </span>
        <span class="app-header__name">{{ APP_NAME }}</span>
      </component>

      <nav v-if="links.length" ref="navEl" class="app-header__nav app-header__wide" :aria-label="t('common.nav.main')" data-testid="header-nav">
        <template v-for="link in links" :key="link.label">
          <span
            v-if="headerLocked"
            class="app-header__link app-header__link--locked"
            aria-disabled="true"
            :title="lockedHint"
          >{{ t(link.label) }}</span>
          <RouterLink v-else :to="link.to" class="app-header__link">{{ t(link.label) }}</RouterLink>
        </template>
      </nav>

      <div
        v-if="showLanguageSwitch"
        class="app-header__language app-header__wide"
        role="group"
        :aria-label="t('common.language.label')"
        data-testid="header-language"
      >
        <button
          v-for="option in supportedLocales"
          :key="option"
          type="button"
          class="app-header__language-option"
          :aria-pressed="locale === option"
          @click="switchLanguage(option)"
        >{{ t(`common.language.${option}`) }}</button>
      </div>

      <!-- Who is signed in (a plain display, not a control), and signing out. -->
      <div v-if="user" class="app-header__user app-header__wide">
        <div class="app-header__profile" :title="`${displayName} · ${roleLabel}`" data-testid="header-profile">
          <span class="ui-sr-only">{{ t('common.account.signedInAs', { name: `${displayName} (${roleLabel})` }) }}</span>
          <span class="app-header__avatar" aria-hidden="true">{{ initial }}</span>
          <span class="app-header__who" aria-hidden="true">
            <span class="app-header__display-name">{{ displayName }}</span>
            <span class="app-header__role">{{ roleLabel }}</span>
          </span>
        </div>
        <button
          type="button"
          class="ui-btn ui-btn--sm app-header__signout"
          :disabled="signingOut"
          data-testid="sign-out"
          @click="signOut"
        >{{ signingOut ? t('common.account.signingOut') : t('common.account.signOut') }}</button>
      </div>

      <!-- Narrow screens: everything above, folded behind one button. -->
      <button
        v-if="user"
        ref="menuButton"
        type="button"
        class="app-header__menu-button app-header__narrow"
        :aria-label="navOpen ? t('common.nav.closeMenu') : t('common.nav.openMenu')"
        :aria-expanded="navOpen"
        aria-controls="app-header-panel"
        data-testid="header-menu-button"
        @click="toggleNav"
      >
        <span class="app-header__avatar app-header__avatar--small" aria-hidden="true">{{ initial }}</span>
        <svg class="app-header__menu-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path v-if="navOpen" d="M6 6l12 12M18 6L6 18" />
          <path v-else d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </div>

    <div v-if="user && navOpen" id="app-header-panel" class="app-header__panel app-header__narrow" data-testid="header-panel">
      <div class="app-header__panel-who">
        <span class="app-header__avatar" aria-hidden="true">{{ initial }}</span>
        <span class="app-header__who app-header__who--panel">
          <span class="app-header__display-name">{{ displayName }}</span>
          <span class="app-header__role">{{ roleLabel }}</span>
        </span>
      </div>

      <nav v-if="links.length" class="app-header__panel-nav" :aria-label="t('common.nav.main')">
        <template v-for="link in links" :key="link.label">
          <span
            v-if="headerLocked"
            class="app-header__panel-link app-header__link--locked"
            aria-disabled="true"
          >{{ t(link.label) }}</span>
          <RouterLink v-else :to="link.to" class="app-header__panel-link">{{ t(link.label) }}</RouterLink>
        </template>
        <p v-if="headerLocked" class="app-header__panel-hint">{{ lockedHint }}</p>
      </nav>

      <div class="app-header__panel-row">
        <div
          v-if="showLanguageSwitch"
          class="app-header__language"
          role="group"
          :aria-label="t('common.language.label')"
          data-testid="header-panel-language"
        >
          <button
            v-for="option in supportedLocales"
            :key="option"
            type="button"
            class="app-header__language-option"
            :aria-pressed="locale === option"
            @click="switchLanguage(option)"
          >{{ t(`common.language.${option}`) }}</button>
        </div>
        <button type="button" class="ui-btn ui-btn--sm app-header__panel-signout" :disabled="signingOut" @click="signOut">
          {{ signingOut ? t('common.account.signingOut') : t('common.account.signOut') }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: saturate(1.2) blur(8px);
  border-bottom: 1px solid var(--rule);
}

/* A little wider than the page, so long link names (isiZulu, a child's bigger
   links) still fit on one line on a laptop. */
.app-header__inner {
  max-width: calc(var(--page-width) + 160px);
  height: var(--header-height);
  margin: 0 auto;
  padding: 0 var(--space-5);
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.app-header__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink);
  text-decoration: none;
  flex-shrink: 0;
}

.app-header__mark-bg { fill: var(--primary); }
.app-header__mark-leaf { fill: var(--accent); }
.app-header__mark-vein { fill: none; stroke: var(--primary); stroke-width: 1.4; stroke-linecap: round; }

.app-header__name {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.app-header__nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  min-width: 0;
}

.app-header__link {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius);
  color: var(--ink-2);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.app-header__link:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.app-header__link--locked {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-header__link.router-link-active {
  color: var(--primary);
  background: var(--primary-soft);
}

.app-header__language {
  display: inline-flex;
  margin-left: auto;
  padding: 2px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  flex-shrink: 0;
}

.app-header__language-option {
  padding: 4px 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
}

.app-header__language-option[aria-pressed='true'] {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-1);
}

.app-header__user {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-left: auto;
  flex-shrink: 0;
}

/* After the language switch, the switch already holds the right edge. */
.app-header__language + .app-header__user {
  margin-left: 0;
}

.app-header__profile {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.app-header__signout {
  white-space: nowrap;
}

.app-header__avatar {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 700;
  font-size: var(--text-sm);
}

.app-header__avatar--small {
  width: 28px;
  height: 28px;
  font-size: var(--text-xs);
}

.app-header__who {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.15;
  min-width: 0;
}

.app-header__display-name {
  font-size: var(--text-sm);
  font-weight: 600;
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header__role {
  font-size: var(--text-xs);
  color: var(--ink-3);
  white-space: nowrap;
}

/* ---- the folded menu, for narrow screens ---- */
.app-header__narrow {
  display: none;
}

.app-header__menu-button {
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  min-height: 40px;
  padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
  border: 1px solid var(--rule);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.app-header__menu-button[aria-expanded='true'] {
  background: var(--surface-2);
}

.app-header__menu-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.app-header__panel {
  flex-direction: column;
  gap: var(--space-4);
  max-height: calc(100vh - var(--header-height));
  overflow-y: auto;
  padding: var(--space-4) var(--space-4) var(--space-5);
  border-top: 1px solid var(--rule);
  background: var(--surface);
  box-shadow: var(--shadow-2);
}

.app-header__panel-who {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.app-header__panel-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.app-header__panel-link {
  display: block;
  padding: var(--space-3);
  border-radius: var(--radius);
  color: var(--ink);
  font-weight: 600;
  text-decoration: none;
}

.app-header__panel-link:hover {
  background: var(--surface-2);
}

.app-header__panel-link.router-link-active {
  color: var(--primary);
  background: var(--primary-soft);
}

.app-header__panel-hint {
  margin: var(--space-1) 0 0;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--ink-2);
}

.app-header__panel-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--rule);
}

.app-header__panel-row .app-header__language {
  margin-left: 0;
}

/* With no language switch (a learner), signing out keeps to the right. */
.app-header__panel-signout {
  margin-left: auto;
}

.app-header__panel-row .app-header__language-option {
  padding: 6px 14px;
  font-size: var(--text-sm);
}

/* Child theme: a rainbow edge and chunkier, colourful links. */
:root[data-theme='child'] .app-header {
  border-bottom: 0;
  background: var(--surface);
}

:root[data-theme='child'] .app-header::after {
  content: '';
  display: block;
  height: 5px;
  background: linear-gradient(90deg, var(--tone-1), var(--tone-2), var(--tone-3), var(--tone-4), var(--tone-5));
}

:root[data-theme='child'] .app-header__link,
:root[data-theme='child'] .app-header__panel-link {
  font-size: var(--text-md);
  font-weight: 700;
}

:root[data-theme='child'] .app-header__avatar {
  background: var(--tone-5);
}

:root[data-theme='child'] .app-header__menu-button {
  border-width: 2px;
}

:root[data-theme='child'] .app-header__signout {
  min-height: 36px;
  font-size: var(--text-sm);
}

/* Between a phone and a full desktop, who is signed in shows as the avatar
   alone (hover shows the name; screen readers still hear it), so the links fit. */
@media (max-width: 1180px) {
  .app-header--signed-in .app-header__who {
    display: none;
  }

  .app-header--signed-in .app-header__panel .app-header__who {
    display: flex;
  }

  .app-header__inner {
    gap: var(--space-4);
  }
}

/* Folded: the links, language and signing out move into the menu. Always on a
   phone; wider, whenever the links would not fit (see fitLinks). */
.app-header--compact .app-header__wide {
  display: none;
}

.app-header--compact .app-header__narrow {
  display: flex;
}

@media (max-width: 720px) {
  .app-header--signed-in .app-header__wide {
    display: none;
  }

  .app-header--signed-in .app-header__narrow {
    display: flex;
  }
}

@media (max-width: 720px) {
  .app-header__inner {
    gap: var(--space-3);
    padding: 0 var(--space-3);
  }
}

@media (max-width: 360px) {
  .app-header__name {
    display: none;
  }
}
</style>
