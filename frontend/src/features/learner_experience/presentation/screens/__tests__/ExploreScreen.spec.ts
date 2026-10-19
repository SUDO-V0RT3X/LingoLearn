import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ExploreScreen from '@/features/learner_experience/presentation/screens/ExploreScreen/ExploreScreen.vue'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource'
import { TestAttemptDataSource } from '@/features/learner_experience/datasources/learnerDataSource'
import { themeStore } from '@/features/shared/state/themeStore'
import { authStore } from '@/features/auth_feature/state/authStore'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { $ApprovedContentFilter, $ContentSummary } from '@/features/shared/models/contentType'
import type { LearnerAccess, OnboardingSettings } from '@/features/onboarding_feature/models/OnboardingTypes'
import type { $MyLearning } from '@/features/learner_experience/models/learnerTypes'
import { i18n } from '@/i18n'

//A row as getApprovedContent returns it: a record without its pages, plus the author's name.
const summary = (over: Partial<$ContentSummary> = {}): $ContentSummary => ({
  contentId: 1, authorId: 3, authorName: 'Ana Author', title: 'Greetings', language: 'zulu',
  childFriendly: true, status: 'approved', version: 1, level: 1, chosenTags: [], kind: 'story',
  updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: '2026-09-15T09:00:00.000Z', locked: false, ...over,
})

const APPROVED = [
  summary({ contentId: 1, title: 'Level one book', level: 1, chosenTags: ['food'] }),
  summary({ contentId: 2, title: 'Level three book', level: 3, authorName: 'Bea Writer', locked: true }),
  summary({ contentId: 3, title: 'Book with a test', level: 1, kind: 'quiz' }),
]

//The onboarding row for a learner learning isiZulu. The access policy is a separate call.
const settings = (over: Partial<OnboardingSettings> = {}): OnboardingSettings => ({
  user_id: 7, target_language: 'zulu', date_of_birth: '2000-01-01', interface_language: 'english',
  daily_goal: 15, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...over,
})
const ADULT: LearnerAccess = { isUnder13: false, hasActiveParentLink: false, canAccessContent: true, contentAudience: 'general' }
const CHILD: LearnerAccess = { isUnder13: true, hasActiveParentLink: true, canAccessContent: true, contentAudience: 'child' }

const learning = (over: Partial<$MyLearning> = {}): $MyLearning => ({
  currentLevel: 1, testsPassedAtLevel: 0, testsRequired: 6, readyForChallenge: false,
  testsCompleted: 0, testsPassed: 0, averagePercent: 0, history: [], bestResults: [], continueReading: [], ...over,
})

const failure = (message: string, statusCode = 500) =>
  new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode })

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/explore', name: 'explore', component: blank },
      { path: '/read/:contentId', name: 'reader', component: blank },
      { path: '/my-learning', name: 'myLearning', component: blank },
      { path: '/learner-setup', name: 'learnerSetup', component: blank },
      { path: '/parent-linking', name: 'parentLinking', component: blank },
    ],
  })
}

describe('ExploreScreen', () => {
  let router: ReturnType<typeof makeRouter>

  beforeEach(() => {
    setActivePinia(createPinia())
    delete document.documentElement.dataset.theme
    router = makeRouter()
    vi.restoreAllMocks()
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(settings(), null))
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(ADULT, null))
    vi.spyOn(TestAttemptDataSource, 'getMyLearning').mockResolvedValue(new $DataSourceResponse(learning(), null))
    vi.spyOn(ContentDataSource, 'getApprovedContent').mockResolvedValue(new $DataSourceResponse(APPROVED, null))
  })

  async function mountScreen() {
    const wrapper = mount(ExploreScreen, { global: { plugins: [router] } })
    await router.isReady()
    await flushPromises()
    return wrapper
  }

  function cardTitles(wrapper: Awaited<ReturnType<typeof mountScreen>>): string[] {
    return wrapper.findAll('[data-testid="content-card"] .content-card__title').map((element) => element.text())
  }

  //The filter passed to the API on the most recent call.
  function lastFilter(): $ApprovedContentFilter {
    const calls = vi.mocked(ContentDataSource.getApprovedContent).mock.calls
    return calls[calls.length - 1][0] as $ApprovedContentFilter
  }

  it('lists the approved rows the server returned', async () => {
    const wrapper = await mountScreen()
    expect(cardTitles(wrapper)).toEqual(['Level one book', 'Level three book', 'Book with a test'])
    expect(wrapper.text()).toContain('3 results')
  })

  it('shows a dismissible notice that skipped placement starts at Level 1', async () => {
    await router.push({ name: 'explore', query: { placementSkipped: 'true' } })
    const wrapper = await mountScreen()

    expect(wrapper.get('[data-testid="placement-level-notice"]').text()).toContain('You will start at Level 1.')
    await wrapper.get('[data-testid="placement-level-notice"] button').trigger('click')
    expect(wrapper.find('[data-testid="placement-level-notice"]').exists()).toBe(false)
  })

  it("asks the server for the learner's own target language, never a hard-coded one", async () => {
    await mountScreen()
    expect(lastFilter().language).toBe('zulu')
  })

  it('sends no language filter when the learner has not chosen one yet', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings')
      .mockResolvedValue(new $DataSourceResponse(settings({ target_language: '' }), null))
    await mountScreen()
    expect(lastFilter().language).toBeUndefined()
  })

  it("nominal: starts at the learner's own level, and \"All levels\" widens the request", async () => {
    vi.spyOn(TestAttemptDataSource, 'getMyLearning')
      .mockResolvedValue(new $DataSourceResponse(learning({ currentLevel: 2 }), null))
    const wrapper = await mountScreen()

    expect(vi.mocked(ContentDataSource.getApprovedContent)).toHaveBeenCalledTimes(1)
    expect(lastFilter().level).toBe(2)
    expect(wrapper.get('[data-testid="current-level"]').text()).toContain('Level 2')
    expect(wrapper.get('[data-testid="level-filter"]').text()).toContain('(your level)')

    await wrapper.get('[data-testid="level-filter"]').setValue('all')
    await flushPromises()
    expect(lastFilter().level).toBeUndefined()
  })

  it('invalid input: shows every level, without crashing, when the learner\'s level cannot be loaded', async () => {
    vi.spyOn(TestAttemptDataSource, 'getMyLearning')
      .mockResolvedValue(new $DataSourceResponse<$MyLearning>(null, failure('Failed to load your learning.')))
    const wrapper = await mountScreen()
    expect(lastFilter().level).toBeUndefined()
    expect(wrapper.find('[data-testid="current-level"]').exists()).toBe(false)
    expect(cardTitles(wrapper)).toHaveLength(3)
  })

  it('picking one level narrows the request to that level', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="level-filter"]').setValue('3')
    await flushPromises()
    expect(lastFilter().level).toBe(3)
  })

  it('locks child-friendly on for an under-13 learner, from the access policy, and asks the server for it', async () => {
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(CHILD, null))
    const wrapper = await mountScreen()

    //Always on for a child: shown as a status, with nothing to press.
    expect(wrapper.find('[data-testid="child-friendly-toggle"]').exists()).toBe(false)
    const status = wrapper.get('[data-testid="child-friendly-status"]')
    expect(status.element.tagName).toBe('SPAN')
    expect(status.text()).toContain('always on')
    expect(lastFilter().childFriendlyOnly).toBe(true)
  })

  it('lets an older learner turn child-friendly on, which refetches from the server', async () => {
    const wrapper = await mountScreen()
    const toggle = wrapper.get('[data-testid="child-friendly-toggle"]')
    expect(toggle.attributes('aria-pressed')).toBe('false')
    expect(lastFilter().childFriendlyOnly).toBe(false)

    await toggle.trigger('click')
    await flushPromises()
    expect(lastFilter().childFriendlyOnly).toBe(true)
  })

  it('"Has test" keeps only content the server marked as a quiz', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="has-test-toggle"]').trigger('click')
    expect(cardTitles(wrapper)).toEqual(['Book with a test'])
  })

  it('search filters titles case-insensitively without another request', async () => {
    const wrapper = await mountScreen()
    const callsBefore = vi.mocked(ContentDataSource.getApprovedContent).mock.calls.length

    await wrapper.get('[data-testid="search"]').setValue('LEVEL ONE')
    expect(cardTitles(wrapper)).toEqual(['Level one book'])
    expect(vi.mocked(ContentDataSource.getApprovedContent).mock.calls.length).toBe(callsBefore)
  })

  it('search matches the author name and the topic tags as well as the title', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="search"]').setValue('bea')
    expect(cardTitles(wrapper)).toEqual(['Level three book'])
    await wrapper.get('[data-testid="search"]').setValue('food')
    expect(cardTitles(wrapper)).toEqual(['Level one book'])
  })

  it('shows the empty state with a reset when nothing matches', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="search"]').setValue('nothing matches this')
    expect(wrapper.find('[data-testid="empty-shelf"]').exists()).toBe(true)

    await wrapper.get('[data-testid="empty-shelf"] button').trigger('click')
    await flushPromises()
    expect(cardTitles(wrapper)).toHaveLength(APPROVED.length)
  })

  it('opening a card routes to the reader for that content', async () => {
    const wrapper = await mountScreen()
    await wrapper.findAll('[data-testid="content-card"]')[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('reader')
    expect(router.currentRoute.value.params.contentId).toBe('1')
  })

  it('shows locked content with what it takes to open it, and does not open it', async () => {
    const wrapper = await mountScreen()
    const locked = wrapper.findAll('[data-testid="content-card"]')[1]
    expect(locked.element.tagName).not.toBe('A')
    expect(locked.attributes('aria-disabled')).toBe('true')
    expect(locked.get('[data-testid="lock-note"]').text()).toBe('Reach level 3 to open')

    await locked.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).not.toBe('reader')
    //Open cards carry no lock note.
    expect(wrapper.findAll('[data-testid="lock-note"]')).toHaveLength(1)
  })

  it('offers "Continue reading" only when the learner has part-read something', async () => {
    let wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="continue-reading"]').exists()).toBe(false)

    vi.spyOn(TestAttemptDataSource, 'getMyLearning').mockResolvedValue(new $DataSourceResponse(learning({
      continueReading: [{ contentId: 4, title: 'Halfway story', page: 1, totalPages: 4, updatedAt: '2026-10-01T00:00:00.000Z' }],
    }), null))
    setActivePinia(createPinia())
    wrapper = await mountScreen()
    const item = wrapper.get('[data-testid="continue-reading"]')
    expect(item.text()).toContain('Halfway story')
    expect(item.text()).toContain('Page 2 of 4')
    expect(item.attributes('href')).toBe('/read/4')
  })

  it('shows a friendly error instead of an empty shelf when the list fails, and retries', async () => {
    vi.spyOn(ContentDataSource, 'getApprovedContent')
      .mockResolvedValue(new $DataSourceResponse<$ContentSummary[]>(null, failure('Failed to load content. Please try again.')))
    const wrapper = await mountScreen()
    expect(wrapper.get('[data-testid="catalogue-error"]').text()).toContain('Failed to load content')
    expect(wrapper.findAll('[data-testid="content-card"]')).toHaveLength(0)

    vi.mocked(ContentDataSource.getApprovedContent).mockResolvedValue(new $DataSourceResponse(APPROVED, null))
    await wrapper.get('[data-testid="catalogue-error"] button').trigger('click')
    await flushPromises()
    expect(cardTitles(wrapper)).toHaveLength(3)
  })

  it('sends a learner whose setup is unfinished to finish it', async () => {
    vi.spyOn(ContentDataSource, 'getApprovedContent').mockResolvedValue(new $DataSourceResponse<$ContentSummary[]>(
      null, failure('learner setup must be completed before accessing content', 403)))
    const wrapper = await mountScreen()
    const error = wrapper.get('[data-testid="catalogue-error"]')
    expect(error.text()).toContain('Finish setting up your account')
    expect(error.get('a').attributes('href')).toBe('/learner-setup')
  })

  it('speaks to a child in friendlier words', async () => {
    themeStore().setAudience('child')
    const wrapper = await mountScreen()
    expect(wrapper.get('h1').text()).toBe("Let’s read!")
    expect(wrapper.find('.explore--child').exists()).toBe(true)
  })

  it('in isiZulu: headings, filters, cards and lock notes are all in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = await mountScreen()
    const text = wrapper.text()
    expect(text).toContain('Thola okokufunda')
    expect(text).toContain('Wonke amazinga')
    expect(text).toContain('Izinga 1 · A1 (izinga lakho)')
    expect(text).toContain('Imiphumela engu-3')
    expect(text).toContain('Kubhalwe ngu-Bea Writer')
    expect(wrapper.get('[data-testid="lock-note"]').text()).toBe('Fika ezingeni 3 ukuze ukuvule')
    expect(wrapper.get('[data-testid="search"]').attributes('placeholder')).toBe('Amagama ezindaba, ababhali noma izihloko')
    expect(text).not.toContain('Find something to read')
    expect(text).not.toContain('Reach level')
    expect(text).not.toContain('All levels')
  })


  it('remembers the level filter after leaving and coming back, for this session', async () => {
    authStore().currentUser = { id: 7, username: 'l', firstName: 'L', lastName: 'L', name: 'L L', email: null, role: 'learner', requiresGuardianLink: false }
    const first = await mountScreen()
    await first.get('[data-testid="level-filter"]').setValue('3')
    await flushPromises()
    expect(lastFilter().level).toBe(3)
    first.unmount()

    //"Back to Explore": a fresh screen, the same store.
    const again = await mountScreen()
    expect((again.get('[data-testid="level-filter"]').element as HTMLSelectElement).value).toBe('3')
    expect(lastFilter().level).toBe(3)
  })

  it('shows topic tags as words, not slugs', async () => {
    vi.mocked(ContentDataSource.getApprovedContent).mockResolvedValue(new $DataSourceResponse(
      [summary({ chosenTags: ['daily-life', 'listening'] })], null))
    const wrapper = await mountScreen()
    const chips = wrapper.findAll('[data-testid="content-card"] .ui-chip').map((chip) => chip.text())
    expect(chips).toContain('Daily life')
    expect(chips).toContain('Listening')
    expect(chips).not.toContain('daily-life')
  })
})
