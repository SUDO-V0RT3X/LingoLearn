import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { authStore, type PublicUser } from '@/features/auth_feature/state/authStore'
import { AuthDataSource } from '@/features/auth_feature/datasources/authDataSource'
import { themeStore } from '@/features/shared/state/themeStore'
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource'
import type { LearnerAccess } from '@/features/onboarding_feature/models/OnboardingTypes'
import { i18n } from '@/i18n'
import { learnerGateTarget } from '@/features/shared/state/placementGate'
import ParentLinkScreen from '../ParentLinkScreen.vue'

vi.mock('@/features/auth_feature/datasources/authDataSource', () => ({
  AuthDataSource: {
    createLinkCode: vi.fn(),
    redeemParentLink: vi.fn(),
    getChildren: vi.fn(),
    getMyGuardians: vi.fn(),
  },
}))

vi.mock('@/features/shared/state/placementGate', () => ({ learnerGateTarget: vi.fn() }))

vi.mock('@/features/onboarding_feature/datasources/onboardingDataSource', () => ({
  OnboardingDataSource: { getAccess: vi.fn() },
}))

// The server's access check for a learner: a child (under 13), an adult, and an
// adult who was linked to a guardian as a child and has since turned 13.
const childAccess: LearnerAccess = { isUnder13: true, hasActiveParentLink: false, canAccessContent: false, contentAudience: 'child' }
const adultAccess: LearnerAccess = { isUnder13: false, hasActiveParentLink: false, canAccessContent: true, contentAudience: 'general' }
const agedOutAccess: LearnerAccess = { ...adultAccess, hasActiveParentLink: true }
// A child whose guardian has redeemed their code.
const linkedChildAccess: LearnerAccess = { ...childAccess, hasActiveParentLink: true, canAccessContent: true }
const oneGuardian = { firstName: 'One', lastName: 'Guardian', linkedAt: '2026-10-01T09:00:00.000Z' }
const twoGuardian = { firstName: 'Two', lastName: 'Guardian', linkedAt: '2026-10-02T09:00:00.000Z' }
const threeGuardian = { firstName: 'Three', lastName: 'Guardian', linkedAt: '2026-10-12T10:00:30.000Z' }
const fourGuardian = { firstName: 'Four', lastName: 'Guardian', linkedAt: '2026-10-03T09:00:00.000Z' }

const guardian: PublicUser = {
  id: 2, username: null, firstName: 'Gia', lastName: 'Guardian', name: 'Gia Guardian',
  email: 'gia@example.test', role: 'guardian', requiresGuardianLink: false,
}
const learner: PublicUser = {
  id: 5, username: 'lebo', firstName: 'Lebo', lastName: 'Learner', name: 'Lebo Learner',
  email: null, role: 'learner', requiresGuardianLink: false,
}
const linkedLebo = { ...learner, linkedAt: '2026-10-01T09:00:00.000Z' }

function failure(message: string, statusCode = 404) {
  return { data: null, error: new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode }) }
}

async function mountAs(user: PublicUser) {
  authStore().currentUser = user
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/parent-linking', name: 'parentLinking', component: ParentLinkScreen },
      { path: '/guardian/children/:childId/report', name: 'childProgressReport', component: { render: () => null } },
      { path: '/home', name: 'home', component: { render: () => null } },
      { path: '/placement', name: 'placementTest', component: { render: () => null } },
    ],
  })
  await router.push('/parent-linking')
  await router.isReady()
  const wrapper = mount(ParentLinkScreen, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: childAccess, error: null })
  vi.mocked(AuthDataSource.getMyGuardians).mockResolvedValue({ data: [oneGuardian], error: null })
  vi.mocked(learnerGateTarget).mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  delete document.documentElement.dataset.theme
  i18n.global.locale.value = 'english'
})

describe('ParentLinkScreen, guardian', () => {
  it('nominal: lists linked children with a View progress link to their report', async () => {
    vi.mocked(AuthDataSource.getChildren).mockResolvedValue({ data: [linkedLebo], error: null })
    const { wrapper } = await mountAs(guardian)

    expect(wrapper.find('h1').text()).toBe('My children')
    expect(wrapper.text()).toContain('Lebo Learner')
    const link = wrapper.findAll('a').find((a) => a.text() === 'View progress')
    expect(link?.attributes('href')).toBe('/guardian/children/5/report')
  })

  it('boundary: shows a friendly empty state when nobody is linked', async () => {
    vi.mocked(AuthDataSource.getChildren).mockResolvedValue({ data: [], error: null })
    const { wrapper } = await mountAs(guardian)
    expect(wrapper.text()).toContain('No children linked yet')
  })

  it('invalid: shows a load failure with a working retry', async () => {
    vi.mocked(AuthDataSource.getChildren)
      .mockResolvedValueOnce(failure('Failed to load linked children. Please try again.', 500))
      .mockResolvedValueOnce({ data: [linkedLebo], error: null })
    const { wrapper } = await mountAs(guardian)

    expect(wrapper.get('[role="alert"]').text()).toContain('Failed to load linked children')
    await wrapper.findAll('button').find((b) => b.text() === 'Try again')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Lebo Learner')
  })

  it('nominal: redeems a code, names the new child and clears the field', async () => {
    vi.mocked(AuthDataSource.getChildren)
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [linkedLebo], error: null })
    vi.mocked(AuthDataSource.redeemParentLink).mockResolvedValue({ data: { child: learner, linkedAt: linkedLebo.linkedAt }, error: null })
    const { wrapper } = await mountAs(guardian)

    await wrapper.get('input[name="link-code"]').setValue('abc234')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(AuthDataSource.redeemParentLink).toHaveBeenCalledWith('ABC234', null)
    expect(wrapper.get('.ui-alert--success').text()).toContain('Lebo Learner is now linked')
    expect((wrapper.get('input[name="link-code"]').element as HTMLInputElement).value).toBe('')
  })

  it('invalid: keeps an expired code in the field and says why', async () => {
    vi.mocked(AuthDataSource.getChildren).mockResolvedValue({ data: [], error: null })
    vi.mocked(AuthDataSource.redeemParentLink).mockResolvedValue(failure('Code expired', 410))
    const { wrapper } = await mountAs(guardian)

    await wrapper.get('input[name="link-code"]').setValue('OLD234')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Code expired')
    expect((wrapper.get('input[name="link-code"]').element as HTMLInputElement).value).toBe('OLD234')
    // The list is unaffected by a failed redemption.
    expect(wrapper.text()).toContain('No children linked yet')
  })
})

describe('ParentLinkScreen, learner', () => {
  it('nominal: generates a code and shows it with a countdown', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue({
      data: { code: 'ABC234', expiresAt: '2026-10-12T10:10:00.000Z' }, error: null,
    })
    const { wrapper } = await mountAs(learner)
    expect(wrapper.find('h1').text()).toBe('Link a guardian')

    await wrapper.findAll('button').find((b) => b.text().includes('Generate code'))!.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.link-code__tile').map((t) => t.text()).join('')).toBe('ABC234')
    expect(wrapper.text()).toContain('Expires in 10:00')
    await vi.advanceTimersByTimeAsync(61_000)
    expect(wrapper.text()).toContain('Expires in 8:59')
  })

  it('boundary: once the code runs out it says so and offers a new one', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue({
      data: { code: 'ABC234', expiresAt: '2026-10-12T10:00:05.000Z' }, error: null,
    })
    const { wrapper } = await mountAs(learner)
    await wrapper.findAll('button').find((b) => b.text().includes('Generate code'))!.trigger('click')
    await flushPromises()

    await vi.advanceTimersByTimeAsync(6_000)
    expect(wrapper.text()).toContain('That code has expired')
    expect(wrapper.find('.link-code__tile').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Generate code'))).toBe(true)
  })

  it('speaks to a child in friendly words', async () => {
    themeStore().setAudience('child')
    const { wrapper } = await mountAs(learner)
    expect(wrapper.find('h1').text()).toBe('Link your grown-up')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Get my code'))).toBe(true)
    expect(wrapper.classes()).toContain('parent-link--child')
  })

  it('invalid: shows a generation failure', async () => {
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue(failure('Failed to create link code. Please try again.', 500))
    const { wrapper } = await mountAs(learner)
    await wrapper.findAll('button').find((b) => b.text().includes('Generate code'))!.trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Failed to create link code')
  })
})

describe('ParentLinkScreen, a linked child', () => {
  it('nominal: shows who they are linked to, offers no code, and goes on to the placement test', async () => {
    themeStore().setAudience('child')
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: linkedChildAccess, error: null })
    vi.mocked(learnerGateTarget).mockResolvedValue({ name: 'placementTest' })
    const { wrapper, router } = await mountAs(learner)

    expect(wrapper.find('h1').text()).toBe('You’re linked!')
    expect(wrapper.get('[data-testid="guardian-linked"]').text()).toContain('You’re linked to One Guardian.')
    expect(wrapper.findAll('button').some((b) => /Get my code|Generate code/.test(b.text()))).toBe(false)

    await wrapper.get('[data-testid="lets-go"]').trigger('click')
    await flushPromises()
    expect(learnerGateTarget).toHaveBeenCalledWith(learner.id)
    expect(router.currentRoute.value.name).toBe('placementTest')
  })

  it('boundary: a placed child goes home, and a missing name still says they are linked', async () => {
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: linkedChildAccess, error: null })
    vi.mocked(AuthDataSource.getMyGuardians).mockResolvedValue(failure('Failed to load your guardian. Please try again.', 500))
    const { wrapper, router } = await mountAs(learner)

    expect(wrapper.get('[data-testid="guardian-linked"]').text()).toContain('You’re linked to your grown-up.')
    await wrapper.get('[data-testid="lets-go"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('nominal: notices by itself when the guardian types the code in', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    themeStore().setAudience('child')
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue({
      data: { code: 'ABC234', expiresAt: '2026-10-12T10:10:00.000Z' }, error: null,
    })
    const { wrapper } = await mountAs(learner)
    await wrapper.findAll('button').find((b) => b.text().includes('Get my code'))!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('This page will change by itself')

    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: linkedChildAccess, error: null })
    await vi.advanceTimersByTimeAsync(5_000)
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('You’re linked!')
    expect(wrapper.text()).toContain('You’re linked to One Guardian.')
    expect(wrapper.find('.link-code__tile').exists()).toBe(false)
  })

  it('invalid: the check button says when the code has not been typed in yet', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    themeStore().setAudience('child')
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue({
      data: { code: 'ABC234', expiresAt: '2026-10-12T10:10:00.000Z' }, error: null,
    })
    const { wrapper } = await mountAs(learner)
    await wrapper.findAll('button').find((b) => b.text().includes('Get my code'))!.trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="check-link"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Not yet! Ask your grown-up to type the code in')
    expect(wrapper.find('.link-code__tile').exists()).toBe(true)
  })

  it('shows the linked state in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    themeStore().setAudience('child')
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: linkedChildAccess, error: null })
    const { wrapper } = await mountAs(learner)
    expect(wrapper.find('h1').text()).toBe('Uxhunyiwe!')
    expect(wrapper.text()).toContain('Uxhunywe ku-One Guardian.')
    expect(wrapper.get('[data-testid="lets-go"]').text()).toBe('Asihambe')
    expect(wrapper.text()).not.toContain('linked')
  })
})

describe('ParentLinkScreen, a learner who is not a child', () => {
  it('sends an adult with no guardian link home, offering no code', async () => {
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: adultAccess, error: null })
    const { wrapper, router } = await mountAs(learner)

    expect(router.currentRoute.value.name).toBe('home')
    expect(wrapper.findAll('button').some((b) => /Generate code|Get my code/.test(b.text()))).toBe(false)
    expect(AuthDataSource.createLinkCode).not.toHaveBeenCalled()
  })

  it('sends a learner who has not finished setup home (which leads on to setup)', async () => {
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue(failure('learner setup must be completed before accessing content', 403))
    const { router } = await mountAs(learner)
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('shows an adult linked as a child their link, read only, with no code to make', async () => {
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: agedOutAccess, error: null })
    const { wrapper, router } = await mountAs(learner)

    expect(router.currentRoute.value.name).toBe('parentLinking')
    expect(wrapper.find('h1').text()).toBe('Your guardian link')
    expect(wrapper.get('[data-testid="guardian-link-read-only"]').text()).toContain('New guardian links are only for learners under 13')
    expect(wrapper.get('[data-testid="guardian-link-read-only"]').text()).toContain('You’re linked to One Guardian.')
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(AuthDataSource.createLinkCode).not.toHaveBeenCalled()
  })

  it('invalid: a failed access check offers a retry rather than a code', async () => {
    vi.mocked(OnboardingDataSource.getAccess)
      .mockResolvedValueOnce(failure('Network error', 0))
      .mockResolvedValueOnce({ data: childAccess, error: null })
    const { wrapper } = await mountAs(learner)

    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t check your account')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Generate code'))).toBe(false)
    await wrapper.findAll('button').find((b) => b.text() === 'Try again')!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text().includes('Generate code'))).toBe(true)
  })

  it('shows the read-only link in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: agedOutAccess, error: null })
    const { wrapper } = await mountAs(learner)
    expect(wrapper.find('h1').text()).toBe('Ukuxhumana kwakho nomnakekeli')
    expect(wrapper.text()).not.toContain('Your guardian link')
  })

  it('shows the server refusing a code (the learner turned 13 meanwhile) in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue(failure('only a learner under 13 can be linked to a guardian', 409))
    themeStore().setAudience('child')
    const { wrapper } = await mountAs(learner)
    await wrapper.findAll('button').find((b) => b.text().includes('Thola ikhodi yami'))!.trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Umfundi oneminyaka engaphansi kweyi-13 kuphela ongaxhunywa nomnakekeli.')
  })
})

describe('ParentLinkScreen, in isiZulu', () => {
  it('shows a guardian their children, steps and a refused code in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    vi.mocked(AuthDataSource.getChildren).mockResolvedValue({ data: [linkedLebo], error: null } as never)
    vi.mocked(AuthDataSource.redeemParentLink).mockResolvedValue(failure('Code expired', 410) as never)
    const { wrapper } = await mountAs(guardian)

    expect(wrapper.find('h1').text()).toBe('Izingane zami')
    expect(wrapper.text()).toContain('Buka intuthuko')
    expect(wrapper.text()).toContain('Thola ikhodi yami')
    expect(wrapper.text()).not.toContain('View progress')
    expect(wrapper.text()).not.toContain('Link a child')

    await wrapper.get('input[name="link-code"]').setValue('OLD234')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Ikhodi iphelelwe yisikhathi')
  })

  it('shows a child learner the playful code screen and countdown in isiZulu', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue({
      data: { code: 'ABC234', expiresAt: '2026-10-12T10:10:00.000Z' }, error: null,
    })
    i18n.global.locale.value = 'zulu'
    themeStore().setAudience('child')
    const { wrapper } = await mountAs(learner)

    expect(wrapper.find('h1').text()).toBe('Xhuma umzali wakho')
    expect(wrapper.text()).not.toContain('Get my code')
    await wrapper.findAll('button').find((b) => b.text().includes('Thola ikhodi yami'))!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Ikhodi yakho eyimfihlo')
    expect(wrapper.text()).toContain('Shesha! Isikhathi esisele: 10:00')
    expect(wrapper.text()).toContain('Kopisha ikhodi')
    expect(wrapper.text()).not.toContain('Hurry')
  })
})

describe('ParentLinkScreen, a readable code', () => {
  const liveCode = { data: { code: 'ABC234', expiresAt: '2026-10-12T10:10:00.000Z' }, error: null }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  async function showCode() {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue(liveCode)
    themeStore().setAudience('child')
    const { wrapper } = await mountAs(learner)
    await wrapper.findAll('button').find((b) => b.text().includes('Get my code'))!.trigger('click')
    await flushPromises()
    return wrapper
  }

  it('nominal: shows the code in two groups of three, spelled out for a screen reader', async () => {
    const wrapper = await showCode()
    expect(wrapper.findAll('.link-code__group').map((group) => group.text())).toEqual(['ABC', '234'])
    expect(wrapper.get('[data-testid="link-code"]').attributes('aria-label')).toBe('Code A B C, 2 3 4')
  })

  it('nominal: copies the plain 6 characters and says so, then offers to copy again', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = await showCode()

    await wrapper.get('[data-testid="copy-code"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('ABC234')
    expect(wrapper.get('[data-testid="copy-code"]').text()).toBe('Copied!')
    expect(wrapper.text()).toContain('The code is copied.')

    await vi.advanceTimersByTimeAsync(3_000)
    expect(wrapper.get('[data-testid="copy-code"]').text()).toBe('Copy code')
  })

  it('invalid: when copying fails it says to read the code out instead', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    const wrapper = await showCode()

    await wrapper.get('[data-testid="copy-code"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Couldn’t copy. Read the code out instead.')
    expect(wrapper.get('[data-testid="copy-code"]').text()).toBe('Copy code')
  })
})

describe('ParentLinkScreen, a guardian typing a code read out', () => {
  async function typeCode(value: string) {
    vi.mocked(AuthDataSource.getChildren).mockResolvedValue({ data: [], error: null })
    vi.mocked(AuthDataSource.redeemParentLink).mockResolvedValue({ data: { child: learner, linkedAt: linkedLebo.linkedAt }, error: null })
    const { wrapper } = await mountAs(guardian)
    await wrapper.get('input[name="link-code"]').setValue(value)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    return wrapper
  }

  it.each(['abc 234', 'ABC-234', ' a-b-c 2 3 4 '])('nominal: sends %j as ABC234', async (value) => {
    await typeCode(value)
    expect(AuthDataSource.redeemParentLink).toHaveBeenCalledWith('ABC234', null)
  })

  it('boundary: leaves room for separators in the box', async () => {
    vi.mocked(AuthDataSource.getChildren).mockResolvedValue({ data: [], error: null })
    const { wrapper } = await mountAs(guardian)
    const input = wrapper.get('input[name="link-code"]')
    expect(input.attributes('maxlength')).toBe('11')
    expect(input.attributes('pattern')).toBeUndefined()
    expect(wrapper.text()).toContain('Spaces and dashes are fine')
  })

  it('invalid: says what a code looks like, and sends nothing, when it is not 6 letters and numbers', async () => {
    const wrapper = await typeCode('AB 23')
    expect(AuthDataSource.redeemParentLink).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toBe('A link code is 6 letters and numbers, like ABC 234.')

    await wrapper.get('input[name="link-code"]').setValue('AB 234')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('invalid: says it in isiZulu too', async () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = await typeCode('AB.234')
    expect(wrapper.get('[role="alert"]').text()).toBe('Ikhodi yokuxhuma inezinhlamvu nezinombolo ezingu-6, njengokuthi ABC 234.')
  })

  it('invalid: shows the server refusing the same guardian twice', async () => {
    vi.mocked(AuthDataSource.getChildren).mockResolvedValue({ data: [linkedLebo], error: null })
    vi.mocked(AuthDataSource.redeemParentLink).mockResolvedValue(failure('this learner is already linked to your account', 409))
    const { wrapper } = await mountAs(guardian)
    await wrapper.get('input[name="link-code"]').setValue('ABC234')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('this learner is already linked to your account')
  })
})

describe('ParentLinkScreen, a linked child adding another grown-up', () => {
  beforeEach(() => {
    themeStore().setAudience('child')
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: linkedChildAccess, error: null })
  })

  it('nominal: lists every grown-up and offers to link another', async () => {
    vi.mocked(AuthDataSource.getMyGuardians).mockResolvedValue({ data: [oneGuardian, twoGuardian], error: null })
    const { wrapper } = await mountAs(learner)

    const card = wrapper.get('[data-testid="guardian-linked"]')
    expect(card.text()).toContain('You’re linked to 2 grown-ups.')
    expect(wrapper.findAll('.parent-link__guardian-name').map((name) => name.text())).toEqual(['One Guardian', 'Two Guardian'])
    expect(wrapper.get('[data-testid="link-another"]').text()).toBe('Link another grown-up')
    expect(AuthDataSource.createLinkCode).not.toHaveBeenCalled()
  })

  it('nominal: makes a code for another grown-up, and notices when they type it in', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue({
      data: { code: 'XYZ789', expiresAt: '2026-10-12T10:10:00.000Z' }, error: null,
    })
    const { wrapper } = await mountAs(learner)
    expect(wrapper.get('[data-testid="guardian-linked"]').text()).toContain('You’re linked to One Guardian.')

    await wrapper.get('[data-testid="link-another"]').trigger('click')
    await flushPromises()
    expect(AuthDataSource.createLinkCode).toHaveBeenCalledOnce()
    const panel = wrapper.get('[data-testid="link-another-panel"]')
    expect(panel.findAll('.link-code__group').map((group) => group.text())).toEqual(['XYZ', '789'])
    expect(panel.text()).toContain('Show this code to your other grown-up')

    // Still the same grown-up: the code stays up.
    await vi.advanceTimersByTimeAsync(5_000)
    await flushPromises()
    expect(wrapper.find('[data-testid="link-another-panel"]').exists()).toBe(true)

    vi.mocked(AuthDataSource.getMyGuardians).mockResolvedValue({ data: [oneGuardian, threeGuardian], error: null })
    await vi.advanceTimersByTimeAsync(5_000)
    await flushPromises()
    expect(wrapper.find('[data-testid="link-another-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="another-linked"]').text()).toBe('Three Guardian is linked too!')
    expect(wrapper.text()).toContain('You’re linked to 2 grown-ups.')
    expect(authStore().linkCode).toBeNull()
  })

  it('invalid: the check button says when the other grown-up has not typed it in yet, and Not now closes the code', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00.000Z') })
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue({
      data: { code: 'XYZ789', expiresAt: '2026-10-12T10:10:00.000Z' }, error: null,
    })
    const { wrapper } = await mountAs(learner)
    await wrapper.get('[data-testid="link-another"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="check-another"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Not yet! Ask your grown-up to type the code in')

    await wrapper.get('[data-testid="stop-another"]').trigger('click')
    expect(wrapper.find('[data-testid="link-another-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="link-another"]').exists()).toBe(true)
  })

  it('boundary: with four grown-ups linked there is no button, only the reason', async () => {
    vi.mocked(AuthDataSource.getMyGuardians).mockResolvedValue({ data: [oneGuardian, twoGuardian, fourGuardian, threeGuardian], error: null })
    const { wrapper } = await mountAs(learner)
    expect(wrapper.find('[data-testid="link-another"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="guardian-limit"]').text()).toBe('You have 4 grown-ups linked. That’s the most you can have!')
  })

  it('invalid: shows the server refusing one grown-up too many, in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    vi.mocked(AuthDataSource.createLinkCode).mockResolvedValue(failure('a learner can have at most 4 linked guardians', 409))
    const { wrapper } = await mountAs(learner)
    expect(wrapper.get('[data-testid="link-another"]').text()).toBe('Xhuma omunye umuntu omdala')

    await wrapper.get('[data-testid="link-another"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Umfundi angaba nabanakekeli abangu-4 kuphela abaxhunyiwe.')
  })

  it('shows a learner who has turned 13 every grown-up, still with nothing to press', async () => {
    vi.mocked(OnboardingDataSource.getAccess).mockResolvedValue({ data: agedOutAccess, error: null })
    vi.mocked(AuthDataSource.getMyGuardians).mockResolvedValue({ data: [oneGuardian, twoGuardian], error: null })
    themeStore().setAudience('general')
    const { wrapper } = await mountAs(learner)

    expect(wrapper.get('[data-testid="guardian-link-read-only"]').text()).toContain('You’re linked to 2 guardians.')
    expect(wrapper.findAll('.parent-link__guardian-name').map((name) => name.text())).toEqual(['One Guardian', 'Two Guardian'])
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
