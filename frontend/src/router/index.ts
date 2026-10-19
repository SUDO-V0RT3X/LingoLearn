import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import SignInScreen from '@/features/auth_feature/presentation/screens/SignInScreen/SignInScreen.vue'
import ParentLinkScreen from '@/features/auth_feature/presentation/screens/ParentLinkScreen/ParentLinkScreen.vue'
import ChildProgressReportScreen from '@/features/auth_feature/presentation/screens/ChildProgressReportScreen/ChildProgressReportScreen.vue'
import AdminUsersScreen from '@/features/admin_users_feature/presentation/screens/AdminUsersScreen/AdminUsersScreen.vue'
import NotFoundScreen from '@/features/shared/presentation/screens/NotFoundScreen.vue'
import { homeRouteNameFor } from '@/features/shared/presentation/shell/navigation'
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource'
import { learnerGateTarget, placementRouteTarget, redirectForLearningPage } from '@/features/shared/state/placementGate'
import { APP_NAME } from '@/core/brand'
import { i18n } from '@/i18n'
import { authStore } from '@/features/auth_feature/state/authStore'
import LearnerSetupScreen from '@/features/onboarding_feature/presentation/screens/LearnerSetupScreen/LearnerSetupScreen.vue'
import ContentBuilderScreen from '@/features/content_builder/presentation/ContentBuilderScreen.vue';
import ContentSubmitScreen from '@/features/content_builder/presentation/ContentSubmitScreen.vue';
import AuthorDashboardScreen from '@/features/media_feature/presentation/screens/AuthorDashboardScreen/AuthorDashboardScreen.vue'
import AudioUploadScreen from '@/features/media_feature/presentation/screens/AudioUploadScreen/AudioUploadScreen.vue'
import ReviewQueueScreen from '@/features/review_queue_feature/presentation/screens/ReviewQueueScreen/ReviewQueueScreen.vue'
import ReviewDetailScreen from '@/features/review_detail_feature/presentation/screens/ReviewDetailScreen/ReviewDetailScreen.vue'
import ExploreScreen from '@/features/learner_experience/presentation/screens/ExploreScreen/ExploreScreen.vue'
import ReaderScreen from '@/features/learner_experience/presentation/screens/ReaderScreen/ReaderScreen.vue'
import TestScreen from '@/features/learner_experience/presentation/screens/TestScreen/TestScreen.vue'
import MyLearningScreen from '@/features/learner_experience/presentation/screens/MyLearningScreen/MyLearningScreen.vue'
import PlacementTestScreen from '@/features/onboarding_feature/presentation/screens/PlacementTestScreen/PlacementTestScreen.vue'
import ChallengeIntroScreen from '@/features/progress_feature/presentation/screens/ChallengeIntroScreen/ChallengeIntroScreen.vue' 
import TaxonomyAdminScreen from '@/features/media_feature/presentation/screens/TaxonomyAdminScreen/TaxonomyAdminScreen.vue'

import ChallengePlayScreen from '@/features/progress_feature/presentation/screens/ChallengePlayScreen/ChallengePlayScreen.vue'

// Flat route table. A route is protected by its own meta:
//   meta: { requiresAuth: true }                      any signed-in user
//   meta: { requiresAuth: true, roles: ['author'] }   only those roles
//Never rendered: /home always redirects in its beforeEnter.
const Redirecting = { render: () => null }

/**
 * Where a signed-in user starts. Staff and guardians go straight to their main
 * screen. A learner who hasn't saved their setup goes to setup, one who hasn't
 * been placed goes to the placement test, and everyone else starts on Explore.
 */
async function resolveHome() {
  const role = authStore().currentUser?.role
  if (!role) return { name: 'signIn' }
  if (role !== 'learner') return { name: homeRouteNameFor(role) }
  const settings = await OnboardingDataSource.getSettings()
  if (!settings.data) return { name: 'learnerSetup' }
  // Anyone set up but never placed (a child who was waiting for a guardian, or a
  // learner who left after setup) finds their level before exploring.
  const userId = authStore().currentUser?.id
  return (userId && (await learnerGateTarget(userId))) || { name: 'explore' }
}

/**
 * The placement test happens once: a learner who already has a level goes to
 * Explore. Before it, the same steps as every learning screen: setup, then a
 * guardian link for a child, so an unlinked child never sees the intro.
 */
async function leavePlacementIfPlaced() {
  const userId = authStore().currentUser?.id
  return (userId && (await placementRouteTarget(userId))) || true
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: () => (authStore().currentUser ? { name: 'home' } : { name: 'signIn' }) },
  { path: '/sign-in', name: 'signIn', component: SignInScreen, meta: { title: 'common.titles.signIn' } },
  { path: '/home', name: 'home', component: Redirecting, meta: { requiresAuth: true }, beforeEnter: resolveHome },
  // The old placeholder page; anything still linking here lands on the user's home.
  { path: '/onboarding', name: 'onboarding', redirect: { name: 'home' } },
  { path: '/parent-linking', name: 'parentLinking', component: ParentLinkScreen, meta: { requiresAuth: true, roles: ['learner', 'guardian', 'administrator'], title: 'common.titles.family' } },
  { path: '/learner-setup', name: 'learnerSetup', component: LearnerSetupScreen, meta: { requiresAuth: true, roles: ['learner'], title: 'common.titles.learnerSetup' } },
  { path: '/placement-test', name: 'placementTest', component: PlacementTestScreen, meta: { requiresAuth: true, roles: ['learner'], hideHeader: true, title: 'common.titles.placementTest' }, beforeEnter: leavePlacementIfPlaced },
  { path: '/content-builder', name: 'contentBuilder', component: ContentBuilderScreen, meta: { requiresAuth: true, roles: ['author', 'administrator'], title: 'common.titles.contentBuilder' } },
  { path: '/content-builder/:contentId(\\d+)', name: 'contentBuilderDraft', component: ContentBuilderScreen, meta: { requiresAuth: true, roles: ['author', 'administrator'], title: 'common.titles.contentBuilder' } },
  { path: '/content-builder/submit', name: 'contentSubmit', component: ContentSubmitScreen, meta: { requiresAuth: true, roles: ['author', 'administrator'], title: 'common.titles.submit' } },
  { path: '/author-dashboard', name: 'authorDashboard', component: AuthorDashboardScreen, meta: { requiresAuth: true, roles: ['author', 'administrator'], title: 'common.titles.myContent' } },
  { path: '/upload-audio', name: 'uploadAudio', component: AudioUploadScreen, meta: { requiresAuth: true, roles: ['author', 'administrator'], title: 'common.titles.audioLibrary' } },
  { path: '/admin/taxonomy', name: 'adminTaxonomy', component: TaxonomyAdminScreen, meta: { requiresAuth: true, roles: ['administrator'], title: 'common.titles.taxonomy' } },
  { path: '/admin/tags', redirect: { name: 'adminTaxonomy' } },
  { path: '/review-queue', name: 'reviewQueue', component: ReviewQueueScreen, meta: { requiresAuth: true, roles: ['moderator', 'administrator'], title: 'common.titles.reviewQueue' } },
  { path: '/review-queue/:id(\\d+)', name: 'reviewDetail', component: ReviewDetailScreen, meta: { requiresAuth: true, roles: ['moderator', 'administrator'], title: 'common.titles.review' } },
  { path: '/explore', name: 'explore', component: ExploreScreen, meta: { requiresAuth: true, roles: ['learner'], requiresPlacement: true, title: 'common.titles.explore' } },
  { path: '/read/:contentId(\\d+)', name: 'reader', component: ReaderScreen, meta: { requiresAuth: true, roles: ['learner'], requiresPlacement: true, title: 'common.titles.reading' } },
  { path: '/test/:contentId(\\d+)', name: 'test', component: TestScreen, meta: { requiresAuth: true, roles: ['learner'], requiresPlacement: true, title: 'common.titles.test' } },
  // A child's header calls this page My stars, so their tab does too.
  { path: '/my-learning', name: 'myLearning', component: MyLearningScreen, meta: { requiresAuth: true, roles: ['learner'], requiresPlacement: true, title: 'common.titles.myLearning', childTitle: 'common.titles.myStars' } },
  // { path: '/<yours>', name: '<yours>', component: <YourScreen> },   // ← add your slice here
  // The level-up challenge: the intro (eligibility) and the challenge itself. /challenge on its own goes to the intro.
  { path: '/challenge-intro', name: 'challengeIntro', component: ChallengeIntroScreen, meta: { requiresAuth: true, roles: ['learner'], requiresPlacement: true, title: 'common.titles.levelUp' } },
  { path: '/challenge', redirect: { name: 'challengeIntro' } },
  { path: '/challenge/play', name: 'challengePlay', component: ChallengePlayScreen, meta: { requiresAuth: true, roles: ['learner'], requiresPlacement: true, title: 'common.titles.challenge' } },
  { path: '/admin/users', name: 'adminUsers', component: AdminUsersScreen, meta: { requiresAuth: true, roles: ['administrator'], title: 'common.titles.users' } },
  { path: '/guardian/children/:childId(\\d+)/report', name: 'childProgressReport', component: ChildProgressReportScreen, meta: { requiresAuth: true, roles: ['guardian'], title: 'common.titles.progressReport' } },
  { path: '/:pathMatch(.*)*', name: 'notFound', component: NotFoundScreen, meta: { title: 'common.titles.notFound' } },
]
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * Sends anyone without a live session to sign in, and anyone whose role the
 * route does not list to their own home. The server enforces the same
 * rules; this only keeps the UI honest.
 */
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const state = authStore()
  if (!await state.restoreServerSession()) return { name: 'signIn' }

  const roles = to.meta.roles as string[] | undefined
  if (roles && !roles.includes(state.currentUser?.role ?? '')) return { name: 'home' }

  // Every learning screen waits until the learner is set up, linked (if a child)
  // and placed.
  const user = state.currentUser
  // Sent back to setup, the setup screen says why: it reads `from`.
  if (to.meta.requiresPlacement && user?.role === 'learner') {
    const gate = await redirectForLearningPage(user.id, String(to.name ?? ''))
    if (gate) return gate
  }

  return true
})

// The browser tab shows the screen's title (a translation key), when it has one,
// then the product.
router.afterEach((to) => applyTitle(titleKeyFor(to.meta)))

/**
 * The title key for a route: its child wording (meta.childTitle) when the child
 * theme is on, so the tab matches what a child's header calls the page.
 */
export function titleKeyFor(meta: Record<string | number | symbol, unknown>): string | undefined {
  const childTitle = meta.childTitle as string | undefined
  if (childTitle && document.documentElement.dataset.theme === 'child') return childTitle
  return meta.title as string | undefined
}

/** Sets the browser tab's title from a route's title key, in the current language. */
export function applyTitle(titleKey: string | undefined): void {
  // Typed loosely: vue-i18n's fully typed t() is too deep for TypeScript here (TS2589).
  const t = (i18n.global as unknown as { t: (key: string) => string }).t
  document.title = titleKey ? `${t(titleKey)} · ${APP_NAME}` : APP_NAME
}
export default router
