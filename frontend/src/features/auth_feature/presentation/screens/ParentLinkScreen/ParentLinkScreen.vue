<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { APP_NAME } from '@/core/brand'
import { LINK_CODE_INPUT_MAX, MAX_ACTIVE_GUARDIANS } from '@/core/limits'
import { formatLongDate, localizeServerMessage } from '@/i18n'
import { localizeValidity, clearValidity } from '@/features/shared/presentation/forms/localizedValidity'
import { authStore, type LinkedGuardian, type PublicUser } from '@/features/auth_feature/state/authStore'
import { isLinkCode, normalizeLinkCode } from '@/features/auth_feature/functions/linkCode'
import LinkCodeDisplay from '@/features/auth_feature/presentation/components/LinkCodeDisplay.vue'
import { themeStore } from '@/features/shared/state/themeStore'
import { learnerGateTarget } from '@/features/shared/state/placementGate'
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource'

// One screen, two sides of the same link:
//   - a learner under 13 generates a short-lived code and shows it to their guardian;
//   - a guardian (or an administrator, for support) types that code in, and
//     sees the children already linked, each with a way into their report.
// A child learner gets the same flow in friendlier words and colours.
// A guardian link is for a child. A linked child sees every grown-up they are
// linked to, goes on to learn, and may make another code to link one more
// grown-up (up to the limit). A learner who was linked as a child and has since
// turned 13 keeps those links and sees them here, read only, with no code to
// make; any other learner aged 13 or more has no business here and goes home.
type Action = 'load' | 'redeem' | 'generate'
// What a learner sees, from the server's access check: nothing yet, the code
// screen (under 13, not linked), their link (under 13, linked: 'joined'), their
// existing link (13 or older, linked: read only), or a retry.
type LearnerView = 'loading' | 'code' | 'joined' | 'linked' | 'failed'

// While a code is showing, how often to ask whether a guardian has typed it in.
const LINK_CHECK_MS = 4000

const state = authStore()
const theme = themeStore()
const router = useRouter()
const { t } = useI18n()
const learnerView = ref<LearnerView>('loading')

const linkCodeInput = ref('')
const lastAction = ref<Action | null>(null)
// The success line after a redemption: the newly linked child's name, or '' for
// the generic wording. null means no message is showing.
const linkedName = ref<string | null>(null)
const linkedMessage = computed(() => {
  if (linkedName.value === null) return ''
  return linkedName.value
    ? t('identity.parentLink.linkedMessage', { name: linkedName.value })
    : t('identity.parentLink.linkedGeneric')
})
// Set when the children list itself failed to load, so the list shows its own retry.
// Holds the server's message (localised at render), or true for our own wording.
const loadError = ref<string | boolean>(false)
const loadErrorText = computed(() => {
  if (!loadError.value) return ''
  return typeof loadError.value === 'string' ? localizeServerMessage(loadError.value) : t('identity.parentLink.loadFailed')
})
// Set when a typed code is not 6 letters and digits, so nothing is sent.
const codeInputError = ref('')
const redeemError = computed(() => codeInputError.value || errorFor('redeem'))
const now = ref(Date.now())
let clock: number | undefined
let linkCheck: number | undefined
// Whether a look for the guardian's link is under way, and whether the last one
// the learner asked for found none yet.
const isCheckingLink = ref(false)
const checkedNotLinked = ref(false)
const isContinuing = ref(false)
// A linked child making a code for one more grown-up, and the name of the
// grown-up who has just used it ('' when unknown; null when none yet).
const addingGuardian = ref(false)
const newGuardianName = ref<string | null>(null)

const currentUser = computed(() => state.currentUser)
const isLearner = computed(() => currentUser.value?.role === 'learner')
const isGuardian = computed(() => currentUser.value?.role === 'guardian')
const canRedeemCodes = computed(() => isGuardian.value || currentUser.value?.role === 'administrator')
const isChild = computed(() => isLearner.value && theme.isChild)

/** The error to show beside the action that caused it. */
function errorFor(action: Action): string {
  return lastAction.value === action ? localizeServerMessage(state.error?.message) : ''
}

/** A child's name as the guardian knows them. */
function childName(child: PublicUser): string {
  const fullName = child.name?.trim() || [child.firstName, child.lastName].filter(Boolean).join(' ')
  return fullName || child.username || t('common.roles.learner')
}

function childInitial(child: PublicUser): string {
  return childName(child).charAt(0).toUpperCase() || '?'
}

function linkedOn(value: string): string {
  return formatLongDate(value)
}

// ------------------------------------------------------------ learner side

function guardianName(guardian: LinkedGuardian): string {
  return [guardian.firstName, guardian.lastName].filter(Boolean).join(' ').trim()
}

/**
 * Who the learner is linked to: "You're linked to <name>." for one grown-up,
 * how many for several (the list below names them), or the generic line when
 * the names could not be loaded.
 */
const guardianSummary = computed(() => {
  const guardians = state.guardians
  if (guardians.length > 1) {
    return isChild.value
      ? t('identity.parentLink.linkedToManyChild', { count: guardians.length })
      : t('identity.parentLink.linkedToMany', { count: guardians.length })
  }
  const name = guardians[0] ? guardianName(guardians[0]) : ''
  return name ? t('identity.parentLink.linkedTo', { name }) : t('identity.parentLink.linkedToGeneric')
})

/** Whether the learner may link one more grown-up (the server checks again). */
const canLinkAnother = computed(() => state.guardians.length < MAX_ACTIVE_GUARDIANS)

/**
 * Works out what this learner may see. Linked: who they are linked to (a
 * child then goes on to learn; 13 or older, the link is read only). Under 13
 * and not linked: the code screen. 13 or older with no link, or setup not
 * finished (refused with 403/404): home, which sends them on to setup if they
 * need it. The server refuses a code to anyone but a child anyway; this keeps
 * the screen from offering one.
 */
async function loadLearnerAccess() {
  learnerView.value = 'loading'
  const response = await OnboardingDataSource.getAccess()
  const access = response.data
  if (access?.hasActiveParentLink) {
    await state.loadMyGuardians()
    learnerView.value = access.isUnder13 ? 'joined' : 'linked'
    // A code for another grown-up still showing from before carries on.
    addingGuardian.value = access.isUnder13 && codeIsLive.value
  } else if (access?.isUnder13) learnerView.value = 'code'
  else if (access || response.error?.statusCode === 403 || response.error?.statusCode === 404) await router.replace({ name: 'home' })
  else learnerView.value = 'failed'
}

/**
 * Looks whether a guardian has typed the code in yet; once one has, the
 * screen shows who. Runs every few seconds while a code is showing, and when
 * the learner presses the check button (fromButton), who is told if not yet.
 */
async function checkForLink(fromButton = false) {
  if (isCheckingLink.value) return
  isCheckingLink.value = true
  const response = await OnboardingDataSource.getAccess()
  isCheckingLink.value = false
  if (response.data?.hasActiveParentLink) {
    await state.loadMyGuardians()
    checkedNotLinked.value = false
    learnerView.value = response.data.isUnder13 ? 'joined' : 'linked'
  } else if (fromButton) {
    checkedNotLinked.value = true
  }
}

/**
 * Looks whether another grown-up has typed in the code a linked child made:
 * the list of grown-ups has grown. Runs every few seconds while that code is
 * showing, and when the child presses the check button (fromButton).
 */
async function checkForAnotherGuardian(fromButton = false) {
  if (isCheckingLink.value) return
  isCheckingLink.value = true
  const before = state.guardians.length
  const loaded = await state.loadMyGuardians()
  isCheckingLink.value = false
  if (loaded && state.guardians.length > before) {
    const newest = state.guardians[state.guardians.length - 1]
    newGuardianName.value = newest ? guardianName(newest) : ''
    addingGuardian.value = false
    checkedNotLinked.value = false
  } else if (fromButton) {
    checkedNotLinked.value = true
  }
}

/** A linked child asks for a code to link one more grown-up. */
async function startLinkingAnother() {
  newGuardianName.value = null
  checkedNotLinked.value = false
  addingGuardian.value = true
  await generateCode()
}

function stopLinkingAnother() {
  addingGuardian.value = false
  checkedNotLinked.value = false
  if (lastAction.value === 'generate') state.clearError()
}

/** On to the next step for a newly linked child: the placement test if they have no level yet, or home. */
async function continueLearning() {
  const userId = currentUser.value?.id
  if (!userId || isContinuing.value) return
  isContinuing.value = true
  const target = await learnerGateTarget(userId)
  isContinuing.value = false
  await router.push(target ?? { name: 'home' })
}

const secondsLeft = computed(() => {
  if (!state.linkCodeExpiresAt) return 0
  const expiresAt = Date.parse(state.linkCodeExpiresAt)
  if (Number.isNaN(expiresAt)) return 0
  return Math.max(0, Math.floor((expiresAt - now.value) / 1000))
})
const codeIsLive = computed(() => Boolean(state.linkCode) && secondsLeft.value > 0)
const codeHasExpired = computed(() => Boolean(state.linkCode) && secondsLeft.value === 0)
const countdown = computed(() => {
  const minutes = Math.floor(secondsLeft.value / 60)
  const seconds = String(secondsLeft.value % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
})

/**
 * Asks the backend for this learner's code. The backend hands back the same
 * code while it is still valid, so pressing again never invalidates one the
 * guardian is typing.
 */
async function generateCode() {
  lastAction.value = 'generate'
  await state.createLinkCode()
  now.value = Date.now()
}

// ----------------------------------------------------------- guardian side

/** Loads the linked children, remembering that a failure belongs to the list. */
async function loadChildren() {
  lastAction.value = 'load'
  loadError.value = false
  const loaded = await state.loadChildren()
  if (!loaded) loadError.value = state.error?.message || true
}

/**
 * Redeems the typed code. A child may read it out as "ABC 234" or "abc-234",
 * so spaces, dashes and case are let go of before it is checked and sent. The
 * field is only cleared once the backend confirms the link, so a mistyped or
 * expired code stays visible to correct.
 */
async function redeemCode() {
  const code = normalizeLinkCode(linkCodeInput.value)
  if (!code || state.isLoading) return
  if (!isLinkCode(code)) {
    codeInputError.value = t('identity.parentLink.codeInvalid')
    return
  }

  codeInputError.value = ''
  lastAction.value = 'redeem'
  linkedName.value = null
  const before = new Set(state.children.map((child) => child.id))
  const redeemed = await state.redeemParentLink(code)
  if (!redeemed) return

  linkCodeInput.value = ''
  loadError.value = false
  const added = state.children.find((child) => !before.has(child.id))
  linkedName.value = added ? childName(added) : ''
}

function onCodeInput() {
  linkedName.value = null
  codeInputError.value = ''
  if (lastAction.value === 'redeem') state.clearError()
}

onMounted(async () => {
  clock = window.setInterval(() => { now.value = Date.now() }, 1000)
  if (canRedeemCodes.value) await loadChildren()
  else if (isLearner.value) {
    linkCheck = window.setInterval(() => {
      if (!codeIsLive.value) return
      if (learnerView.value === 'code') void checkForLink()
      else if (learnerView.value === 'joined' && addingGuardian.value) void checkForAnotherGuardian()
    }, LINK_CHECK_MS)
    await loadLearnerAccess()
  }
})

onBeforeUnmount(() => {
  window.clearInterval(clock)
  window.clearInterval(linkCheck)
})
</script>

<template>
  <main class="ui-page parent-link" :class="{ 'parent-link--child': isChild }">
    <!-- Guardians and administrators: linked children, then a code to add one. -->
    <template v-if="canRedeemCodes">
      <header class="ui-page__head">
        <div>
          <p class="ui-eyebrow">{{ isGuardian ? t('identity.parentLink.eyebrowFamily') : t('identity.parentLink.eyebrowAdmin') }}</p>
          <h1 class="ui-title">{{ isGuardian ? t('common.nav.myChildren') : t('identity.parentLink.titleAdmin') }}</h1>
          <p class="ui-subtitle">
            {{ isGuardian ? t('identity.parentLink.subtitleGuardian') : t('identity.parentLink.subtitleAdmin') }}
          </p>
        </div>
        <button type="button" class="ui-btn ui-btn--ghost" :disabled="state.isLoading" @click="loadChildren">{{ t('identity.parentLink.refresh') }}</button>
      </header>

      <div class="parent-link__layout">
        <section aria-labelledby="children-heading" class="parent-link__children">
          <h2 id="children-heading" class="ui-sr-only">{{ t('identity.parentLink.linkedChildren') }}</h2>

          <div v-if="!state.hasLoadedChildren && !loadError" class="ui-card ui-empty" role="status">
            <span class="ui-spinner parent-link__spinner" aria-hidden="true" />
            <p>{{ t('identity.parentLink.loadingChildren') }}</p>
          </div>

          <div v-else-if="!state.hasLoadedChildren" class="ui-card parent-link__state" role="alert">
            <p class="ui-alert ui-alert--error">{{ loadErrorText }}</p>
            <button type="button" class="ui-btn" @click="loadChildren">{{ t('common.states.retry') }}</button>
          </div>

          <div v-else-if="state.children.length === 0" class="ui-card ui-empty">
            <p class="ui-empty__title">{{ t('identity.parentLink.emptyTitle') }}</p>
            <p>{{ t('identity.parentLink.emptyBody', { app: APP_NAME }) }}</p>
          </div>

          <ul v-else class="parent-link__list">
            <li v-for="(child, index) in state.children" :key="child.id" class="ui-card parent-link__child">
              <span class="parent-link__avatar" :class="`parent-link__avatar--${(index % 5) + 1}`" aria-hidden="true">{{ childInitial(child) }}</span>
              <div class="parent-link__child-body">
                <p class="parent-link__child-name">{{ childName(child) }}</p>
                <p class="parent-link__child-meta">
                  <span v-if="child.username">@{{ child.username }}</span>
                  <span v-if="linkedOn(child.linkedAt)">{{ t('identity.parentLink.linkedOn', { date: linkedOn(child.linkedAt) }) }}</span>
                </p>
              </div>
              <RouterLink
                v-if="isGuardian"
                :to="{ name: 'childProgressReport', params: { childId: String(child.id) } }"
                class="ui-btn ui-btn--primary ui-btn--sm"
              >
                {{ t('identity.parentLink.viewProgress') }}
              </RouterLink>
              <span v-else class="ui-badge ui-badge--brand">{{ t('common.roles.learner') }}</span>
            </li>
          </ul>
        </section>

        <aside class="ui-card parent-link__redeem" aria-labelledby="redeem-heading">
          <h2 id="redeem-heading" class="ui-section-title">{{ t('identity.parentLink.linkChild') }}</h2>
          <ol class="parent-link__steps">
            <I18nT keypath="identity.parentLink.step1" tag="li" scope="global">
              <template #app>{{ APP_NAME }}</template>
              <template #page><strong>{{ t('common.nav.myGrownUp') }}</strong></template>
            </I18nT>
            <I18nT keypath="identity.parentLink.step2" tag="li" scope="global">
              <template #button><strong>{{ t('identity.parentLink.getMyCode') }}</strong></template>
            </I18nT>
            <li>{{ t('identity.parentLink.step3') }}</li>
          </ol>
          <form
            class="ui-stack parent-link__form"
            @submit.prevent="redeemCode"
            @invalid.capture="localizeValidity"
            @input="clearValidity"
            @change="clearValidity"
          >
            <label class="ui-field">
              <span class="ui-label">{{ t('identity.parentLink.codeLabel') }}</span>
              <input
                v-model="linkCodeInput"
                class="ui-input parent-link__code-input"
                name="link-code"
                :maxlength="LINK_CODE_INPUT_MAX"
                required
                placeholder="ABC 234"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                aria-describedby="link-code-hint"
                :aria-invalid="Boolean(redeemError)"
                @input="onCodeInput"
              />
              <span id="link-code-hint" class="ui-hint">{{ t('identity.parentLink.codeHint') }}</span>
            </label>
            <button class="ui-btn ui-btn--primary" type="submit" :disabled="state.isLoading || !linkCodeInput.trim()">
              {{ state.isLoading && lastAction === 'redeem' ? t('identity.parentLink.linking') : t('identity.parentLink.linkButton') }}
            </button>
            <p v-if="redeemError" class="ui-alert ui-alert--error" role="alert">{{ redeemError }}</p>
            <p v-if="linkedMessage" class="ui-alert ui-alert--success" role="status">{{ linkedMessage }}</p>
          </form>
        </aside>
      </div>
    </template>

    <!-- Learners: first the access check, then the code screen or the existing link. -->
    <section v-else-if="isLearner && learnerView === 'loading'" class="ui-card ui-empty" role="status">
      <span class="ui-spinner parent-link__spinner" aria-hidden="true" />
      <p>{{ t('identity.parentLink.checking') }}</p>
    </section>

    <div v-else-if="isLearner && learnerView === 'failed'" class="ui-card parent-link__state" role="alert">
      <p class="ui-alert ui-alert--error">{{ t('identity.parentLink.accessFailed') }}</p>
      <button type="button" class="ui-btn" @click="loadLearnerAccess">{{ t('common.states.retry') }}</button>
    </div>

    <!-- Under 13 and linked: who they're linked to, then on to learning. A child gets the playful version. -->
    <template v-else-if="isLearner && learnerView === 'joined'">
      <header class="ui-page__head parent-link__learner-head">
        <div>
          <p v-if="!isChild" class="ui-eyebrow">{{ t('identity.parentLink.eyebrowAccount') }}</p>
          <h1 class="ui-title">{{ isChild ? t('identity.parentLink.joinedTitleChild') : t('identity.parentLink.joinedTitle') }}</h1>
        </div>
      </header>

      <section class="ui-card parent-link__joined" data-testid="guardian-linked">
        <span class="parent-link__joined-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <p class="parent-link__joined-name">{{ guardianSummary }}</p>
        <ul v-if="state.guardians.length > 1" class="parent-link__guardians" data-testid="guardian-list">
          <li v-for="(guardian, index) in state.guardians" :key="`${guardian.linkedAt}-${index}`" class="parent-link__guardian">
            <span class="parent-link__avatar parent-link__avatar--sm" :class="`parent-link__avatar--${(index % 5) + 1}`" aria-hidden="true">{{ guardianName(guardian).charAt(0).toUpperCase() || '?' }}</span>
            <span class="parent-link__guardian-name">{{ guardianName(guardian) || t('identity.parentLink.grownUp') }}</span>
            <span v-if="linkedOn(guardian.linkedAt)" class="parent-link__guardian-meta">{{ t('identity.parentLink.linkedOn', { date: linkedOn(guardian.linkedAt) }) }}</span>
          </li>
        </ul>
        <p class="parent-link__joined-body">{{ isChild ? t('identity.parentLink.joinedBodyChild') : t('identity.parentLink.joinedBody') }}</p>
        <p v-if="newGuardianName !== null" class="ui-alert ui-alert--success" role="status" data-testid="another-linked">
          {{ newGuardianName ? t('identity.parentLink.anotherLinked', { name: newGuardianName }) : t('identity.parentLink.anotherLinkedGeneric') }}
        </p>
        <button
          type="button"
          class="ui-btn ui-btn--primary ui-btn--lg"
          :class="{ 'parent-link__big-button': isChild }"
          :disabled="isContinuing"
          data-testid="lets-go"
          @click="continueLearning"
        >
          {{ t('identity.parentLink.letsGo') }}
        </button>

        <!-- One more grown-up: the same code as the first time, made on request. -->
        <section v-if="addingGuardian" class="parent-link__another" aria-labelledby="another-heading" data-testid="link-another-panel">
          <h2 id="another-heading" class="parent-link__another-title">
            {{ isChild ? t('identity.parentLink.linkAnotherChild') : t('identity.parentLink.linkAnother') }}
          </h2>
          <p class="parent-link__another-body">{{ isChild ? t('identity.parentLink.anotherStepsChild') : t('identity.parentLink.anotherSteps') }}</p>

          <LinkCodeDisplay v-if="codeIsLive && state.linkCode" :code="state.linkCode" :countdown="countdown" :is-child="isChild">
            <template #actions>
              <button type="button" class="ui-btn ui-btn--sm ui-btn--ghost" :disabled="isCheckingLink" data-testid="check-another" @click="checkForAnotherGuardian(true)">
                {{ isCheckingLink ? t('identity.parentLink.checkingLink') : isChild ? t('identity.parentLink.checkLinkedChild') : t('identity.parentLink.checkLinked') }}
              </button>
            </template>
            <p class="ui-hint parent-link__waiting" role="status">
              {{ checkedNotLinked
                ? (isChild ? t('identity.parentLink.notLinkedYetChild') : t('identity.parentLink.notLinkedYet'))
                : (isChild ? t('identity.parentLink.waitingChild') : t('identity.parentLink.waiting')) }}
            </p>
          </LinkCodeDisplay>

          <template v-else-if="codeHasExpired">
            <p class="ui-alert ui-alert--warning">{{ isChild ? t('identity.parentLink.expiredChild') : t('identity.parentLink.expired') }}</p>
            <button type="button" class="ui-btn ui-btn--primary" :disabled="state.isLoading" @click="generateCode">
              {{ isChild ? t('identity.parentLink.getMyCode') : t('identity.parentLink.generateCode') }}
            </button>
          </template>

          <span v-else-if="state.isLoading" class="ui-spinner parent-link__spinner" aria-hidden="true" />

          <p v-if="errorFor('generate')" class="ui-alert ui-alert--error" role="alert">{{ errorFor('generate') }}</p>
          <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" data-testid="stop-another" @click="stopLinkingAnother">
            {{ t('identity.parentLink.notNow') }}
          </button>
        </section>
        <button
          v-else-if="canLinkAnother"
          type="button"
          class="ui-btn ui-btn--ghost"
          data-testid="link-another"
          @click="startLinkingAnother"
        >
          {{ isChild ? t('identity.parentLink.linkAnotherChild') : t('identity.parentLink.linkAnother') }}
        </button>
        <p v-else class="ui-hint" data-testid="guardian-limit">
          {{ isChild ? t('identity.parentLink.guardianLimitChild', { max: MAX_ACTIVE_GUARDIANS }) : t('identity.parentLink.guardianLimit', { max: MAX_ACTIVE_GUARDIANS }) }}
        </p>
      </section>
    </template>

    <!-- 13 or older, linked as a child: the link stays, read only, with no new code. -->
    <template v-else-if="isLearner && learnerView === 'linked'">
      <header class="ui-page__head parent-link__learner-head">
        <div>
          <p class="ui-eyebrow">{{ t('identity.parentLink.eyebrowAccount') }}</p>
          <h1 class="ui-title">{{ t('identity.parentLink.titleLinked') }}</h1>
          <p class="ui-subtitle">{{ t('identity.parentLink.subtitleLinked') }}</p>
        </div>
      </header>

      <section class="ui-card parent-link__linked" data-testid="guardian-link-read-only">
        <span class="ui-badge ui-badge--brand">{{ t('identity.parentLink.linkedBadge') }}</span>
        <p v-if="state.guardians.length" class="parent-link__joined-name">{{ guardianSummary }}</p>
        <ul v-if="state.guardians.length > 1" class="parent-link__guardians" data-testid="guardian-list">
          <li v-for="(guardian, index) in state.guardians" :key="`${guardian.linkedAt}-${index}`" class="parent-link__guardian">
            <span class="parent-link__avatar parent-link__avatar--sm" :class="`parent-link__avatar--${(index % 5) + 1}`" aria-hidden="true">{{ guardianName(guardian).charAt(0).toUpperCase() || '?' }}</span>
            <span class="parent-link__guardian-name">{{ guardianName(guardian) || t('identity.parentLink.grownUp') }}</span>
            <span v-if="linkedOn(guardian.linkedAt)" class="parent-link__guardian-meta">{{ t('identity.parentLink.linkedOn', { date: linkedOn(guardian.linkedAt) }) }}</span>
          </li>
        </ul>
        <p>{{ t('identity.parentLink.linkedNoCode') }}</p>
        <p class="ui-hint">{{ t('identity.parentLink.linkedEnd') }}</p>
      </section>
    </template>

    <!-- Under 13: generate a code for a guardian. A child gets the playful version. -->
    <template v-else-if="isLearner">
      <header class="ui-page__head parent-link__learner-head">
        <div>
          <p v-if="!isChild" class="ui-eyebrow">{{ t('identity.parentLink.eyebrowAccount') }}</p>
          <h1 class="ui-title">{{ isChild ? t('identity.parentLink.titleChild') : t('identity.parentLink.titleLearner') }}</h1>
          <p class="ui-subtitle">
            {{ isChild ? t('identity.parentLink.subtitleChild') : t('identity.parentLink.subtitleLearner') }}
          </p>
        </div>
      </header>

      <section class="ui-card parent-link__generate" aria-labelledby="code-heading">
        <h2 id="code-heading" class="ui-sr-only">{{ t('identity.parentLink.codeHeading') }}</h2>

        <ol class="parent-link__steps" :class="{ 'parent-link__steps--child': isChild }">
          <li>{{ isChild ? t('identity.parentLink.childStep1') : t('identity.parentLink.learnerStep1') }}</li>
          <li>{{ isChild ? t('identity.parentLink.childStep2') : t('identity.parentLink.learnerStep2') }}</li>
          <li>{{ isChild ? t('identity.parentLink.childStep3') : t('identity.parentLink.learnerStep3') }}</li>
        </ol>

        <LinkCodeDisplay v-if="codeIsLive && state.linkCode" :code="state.linkCode" :countdown="countdown" :is-child="isChild">
          <template #actions>
            <button type="button" class="ui-btn ui-btn--sm ui-btn--ghost" :disabled="isCheckingLink" data-testid="check-link" @click="checkForLink(true)">
              {{ isCheckingLink ? t('identity.parentLink.checkingLink') : isChild ? t('identity.parentLink.checkLinkedChild') : t('identity.parentLink.checkLinked') }}
            </button>
          </template>
          <p class="ui-hint parent-link__waiting" role="status">
            {{ checkedNotLinked
              ? (isChild ? t('identity.parentLink.notLinkedYetChild') : t('identity.parentLink.notLinkedYet'))
              : (isChild ? t('identity.parentLink.waitingChild') : t('identity.parentLink.waiting')) }}
          </p>
        </LinkCodeDisplay>

        <p v-else-if="codeHasExpired" class="ui-alert ui-alert--warning">
          {{ isChild ? t('identity.parentLink.expiredChild') : t('identity.parentLink.expired') }}
        </p>

        <p v-if="errorFor('generate')" class="ui-alert ui-alert--error" role="alert">{{ errorFor('generate') }}</p>

        <button
          v-if="!codeIsLive"
          class="ui-btn ui-btn--primary"
          :class="['ui-btn--lg', { 'parent-link__big-button': isChild }]"
          type="button"
          :disabled="state.isLoading"
          @click="generateCode"
        >
          <span v-if="state.isLoading" class="ui-spinner parent-link__button-spinner" aria-hidden="true" />
          {{ isChild ? t('identity.parentLink.getMyCode') : t('identity.parentLink.generateCode') }}
        </button>
      </section>
    </template>

    <section v-else class="ui-card ui-empty">
      <p class="ui-empty__title">{{ t('identity.parentLink.unavailableTitle') }}</p>
      <p>{{ t('identity.parentLink.unavailableBody') }}</p>
      <RouterLink :to="{ name: 'home' }" class="ui-btn ui-btn--primary">{{ t('common.errorBoundary.home') }}</RouterLink>
    </section>
  </main>
</template>

<style scoped>
/* ------------------------------------------------------------ guardian */

.parent-link__layout {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);
  gap: var(--space-5);
  align-items: start;
}

.parent-link__spinner {
  margin: 0 auto var(--space-3);
}

.parent-link__state {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
}

.parent-link__state p {
  margin: 0;
}

.parent-link__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.parent-link__child {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
}

.parent-link__avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-pill);
  color: var(--on-primary);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
}

.parent-link__avatar--1 { background: var(--tone-1); }
.parent-link__avatar--2 { background: var(--tone-2); }
.parent-link__avatar--3 { background: var(--tone-3); }
.parent-link__avatar--4 { background: var(--tone-4); }
.parent-link__avatar--5 { background: var(--tone-5); }

.parent-link__avatar--sm {
  width: 32px;
  height: 32px;
  font-size: var(--text-md);
}

.parent-link__child-body {
  flex: 1;
  min-width: 0;
}

.parent-link__child-name {
  margin: 0;
  font-weight: 700;
}

.parent-link__child-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 2px 0 0;
  color: var(--ink-3);
  font-size: var(--text-sm);
}

.parent-link__redeem {
  position: sticky;
  top: calc(var(--header-height) + var(--space-4));
}

.parent-link__steps {
  display: grid;
  gap: var(--space-2);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
  counter-reset: step;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.parent-link__steps li {
  position: relative;
  padding-left: calc(24px + var(--space-3));
  counter-increment: step;
}

.parent-link__steps li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}

.parent-link__form {
  gap: var(--space-3);
}

.parent-link__form p {
  margin: 0;
}

.parent-link__code-input {
  font-family: var(--font-mono);
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  text-align: center;
}

.parent-link__code-input::placeholder {
  color: var(--ink-3);
  opacity: 0.5;
}

/* ------------------------------------------------------------- learner */

.parent-link__linked {
  display: grid;
  justify-items: start;
  gap: var(--space-3);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-6);
}

.parent-link__linked p {
  margin: 0;
}

/* A newly linked learner: a tick, who they're linked to, and the way on. */
.parent-link__joined {
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-6);
  text-align: center;
}

.parent-link__joined p {
  margin: 0;
}

.parent-link__joined-mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-pill);
  background: var(--success-soft);
  color: var(--success);
}

.parent-link__joined-name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--ink);
}

.parent-link__joined-body {
  max-width: 44ch;
  color: var(--ink-2);
}

/* Every grown-up a learner is linked to, when there is more than one. */
.parent-link__guardians {
  display: grid;
  gap: var(--space-2);
  justify-self: stretch;
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;
}

.parent-link__guardian {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.parent-link__guardian-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  color: var(--ink);
}

.parent-link__guardian-meta {
  color: var(--ink-3);
  font-size: var(--text-sm);
}

/* A linked child making a code for one more grown-up. */
.parent-link__another {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  justify-self: stretch;
  padding-top: var(--space-4);
  border-top: 1px solid var(--rule);
}

.parent-link__another-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--ink);
}

.parent-link__another-body {
  max-width: 44ch;
  color: var(--ink-2);
}

.parent-link__waiting {
  margin: 0;
  max-width: 40ch;
}

.parent-link__generate {
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-6);
  text-align: center;
}

.parent-link__generate .parent-link__steps {
  justify-self: stretch;
  text-align: left;
}

.parent-link__button-spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

/* --------------------------------------------------------------- child */

.parent-link--child .parent-link__learner-head {
  justify-content: center;
  text-align: center;
}

.parent-link--child .parent-link__learner-head .ui-subtitle {
  margin-inline: auto;
  font-size: var(--text-lg);
}

.parent-link--child .parent-link__generate,
.parent-link--child .parent-link__joined {
  border-width: 3px;
  border-color: var(--accent);
}

.parent-link--child .parent-link__joined-mark {
  width: 80px;
  height: 80px;
  background: var(--tone-3);
  color: var(--on-primary);
  animation: tile-pop 0.4s ease both;
}

.parent-link--child .parent-link__joined-name {
  font-size: var(--text-2xl);
}

.parent-link__steps--child {
  font-size: var(--text-md);
  color: var(--ink);
}

.parent-link__steps--child li:nth-child(1)::before { background: var(--tone-1); color: var(--on-primary); }
.parent-link__steps--child li:nth-child(2)::before { background: var(--tone-3); color: var(--on-primary); }
.parent-link__steps--child li:nth-child(3)::before { background: var(--tone-4); color: var(--on-primary); }

.parent-link__big-button {
  min-height: 60px;
  padding: 0 var(--space-6);
  font-size: var(--text-xl);
}

@keyframes tile-pop {
  from { transform: translateY(8px) scale(0.9); opacity: 0; }
  to { transform: none; opacity: 1; }
}

@media (max-width: 860px) {
  .parent-link__layout {
    grid-template-columns: 1fr;
  }

  .parent-link__redeem {
    position: static;
  }
}

@media (max-width: 480px) {
  .parent-link__child {
    flex-wrap: wrap;
  }

  .parent-link__generate {
    padding: var(--space-5) var(--space-4);
  }
}
</style>
