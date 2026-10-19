import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ChallengeIntroScreen from '../screens/ChallengeIntroScreen/ChallengeIntroScreen.vue'
import ChallengePlayScreen from '../screens/ChallengePlayScreen/ChallengePlayScreen.vue'
import { challengePlayStore } from '../screens/ChallengePlayScreen/state/challengePlayStore'
import { ProgressDataSource } from '../../datasources/progressDataSource'
import { themeStore } from '@/features/shared/state/themeStore'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'
import type { ChallengeOutcome, EligibilityReport, StartedChallenge } from '../../models/ProgressTypes'
import { i18n } from '@/i18n'

const report = (over: Partial<EligibilityReport> = {}): EligibilityReport => ({
  currentLevel: 1, targetLevel: 2, testsPassed: 1, testsRequired: 3, passMark: 70,
  eligible: false, reason: 'requirement_not_met', cooldownUntil: null, secondsRemaining: 0, inProgress: false,
  ...over,
})

//What the server sends: questions without their answers.
const started: StartedChallenge = {
  challengeId: 41,
  targetLevel: 2,
  resumed: false,
  answers: [],
  questions: [
    new $ContentBlock(ContentBlockTypes.multipleChoice, { title: '', question: 'Hello?', options: ['Sawubona', 'Hamba'] } as never),
    new $ContentBlock(ContentBlockTypes.fillBlank, { title: '', sentence: 'Ngi[] kahle' } as never),
  ],
}

const passed: ChallengeOutcome = { passed: true, score: 2, total: 2, percent: 100, passMark: 70, newLevel: 2, cooldownUntil: null }
const failedOutcome: ChallengeOutcome = {
  passed: false, score: 0, total: 2, percent: 0, passMark: 70, newLevel: 1,
  cooldownUntil: new Date(Date.now() + 24 * 3600_000).toISOString(),
}

const refusal = (statusCode: number, message: string) =>
  new $DataSourceResponse<StartedChallenge>(null, new Exception({ exceptionType: ExceptionType.FORBIDDEN, message, statusCode }))

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/challenge-intro', name: 'challengeIntro', component: blank },
      { path: '/challenge/play', name: 'challengePlay', component: blank },
      { path: '/explore', name: 'explore', component: blank },
    ],
  })
}

async function mountScreen(component: typeof ChallengeIntroScreen | typeof ChallengePlayScreen) {
  const router = makeRouter()
  const wrapper = mount(component, { global: { plugins: [router] } })
  await router.isReady()
  await flushPromises()
  return wrapper
}

//A screen left mounted would keep its leave guard listening to the window.
enableAutoUnmount(afterEach)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  vi.spyOn(ProgressDataSource, 'saveChallengeAnswers').mockResolvedValue(
    new $DataSourceResponse({ challengeId: 41, answered: 1 }, null))
})

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('ChallengeIntroScreen', () => {
  it('shows progress toward the required tests and what is left, with no start button', async () => {
    vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(new $DataSourceResponse(report(), null))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    expect(wrapper.get('[data-testid="tests-count"]').text()).toBe('1 of 3')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('1')
    expect(wrapper.get('[data-testid="status-locked"]').text()).toContain('Pass 2 more quizzes')
    // One circle per required test, whatever the rule is.
    expect(wrapper.findAll('.tests__step')).toHaveLength(3)
    expect(wrapper.findAll('.tests__step--done')).toHaveLength(1)
    expect(wrapper.find('[data-testid="start-challenge"]').exists()).toBe(false)
  })

  it('offers the challenge when eligible, with the pass mark', async () => {
    vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(
      new $DataSourceResponse(report({ testsPassed: 3, eligible: true, reason: null }), null))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    expect(wrapper.get('[data-testid="status-ready"]').text()).toContain('70%')
    expect(wrapper.get('[data-testid="start-challenge"]').attributes('href')).toBe('/challenge/play')
  })

  it('says "resume" when a challenge is already under way', async () => {
    vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(
      new $DataSourceResponse(report({ testsPassed: 3, eligible: true, reason: null, inProgress: true }), null))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    expect(wrapper.get('[data-testid="start-challenge"]').text()).toBe('Resume the challenge')
  })

  it('counts down an active cooldown', async () => {
    const cooldownUntil = new Date(Date.now() + 2 * 3600_000).toISOString()
    vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(
      new $DataSourceResponse(report({ testsPassed: 3, reason: 'cooldown_active', cooldownUntil, secondsRemaining: 7200 }), null))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    expect(wrapper.get('[data-testid="status-cooldown"]').text()).toMatch(/1h 59m|2h 0m/)
    wrapper.unmount()
  })

  it('celebrates the top level instead of showing tests', async () => {
    vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(
      new $DataSourceResponse(report({ currentLevel: 6, targetLevel: null, passMark: null, reason: 'max_level' }), null))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    expect(wrapper.find('[data-testid="status-top"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tests-count"]').exists()).toBe(false)
  })

  it('shows the error with a way to try again, without crashing', async () => {
    const check = vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(new $DataSourceResponse<EligibilityReport>(null,
      new Exception({ exceptionType: ExceptionType.FAILED, message: 'Network error', statusCode: 0 })))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    expect(wrapper.get('[role="alert"]').text()).toContain('Network error')
    await wrapper.get('[role="alert"] button').trigger('click')
    expect(check).toHaveBeenCalledTimes(2)
  })
})

describe('ChallengePlayScreen', () => {
  it('shows one question at a time with a progress bar, and never a way to mark itself', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    expect(wrapper.text()).toContain('Question 1 of 2')
    expect(wrapper.findAll('[data-testid="challenge-question"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Hello?')
    expect(wrapper.text()).not.toMatch(/demo mode|marked correct|incorrect/i)
    expect(wrapper.get('[data-testid="next-question"]').text()).toBe('Skip this one')
  })

  it('moves forward only, then sends the answers and shows the new level', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    const submit = vi.spyOn(ProgressDataSource, 'submitChallenge').mockResolvedValue(new $DataSourceResponse(passed, null))
    const wrapper = await mountScreen(ChallengePlayScreen)

    await wrapper.findAll('input[type="radio"]')[0].trigger('change')
    expect(wrapper.get('[data-testid="next-question"]').text()).toBe('Next question')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    expect(wrapper.text()).toContain('Question 2 of 2')
    expect(wrapper.text()).not.toContain('Previous')

    await wrapper.get('input[type="text"]').setValue('philile')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()

    expect(submit).toHaveBeenCalledWith(41, [0, 'philile'])
    expect(wrapper.get('[data-testid="challenge-result"]').text()).toContain("You’re now level 2")
  })

  it('a failed challenge shows the score against the pass mark and the cooldown', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    vi.spyOn(ProgressDataSource, 'submitChallenge').mockResolvedValue(new $DataSourceResponse(failedOutcome, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()

    const result = wrapper.get('[data-testid="challenge-result"]').text()
    expect(result).toContain('Not this time')
    expect(result).toContain('70%')
    expect(result).toMatch(/Try again in\s*23h 59m|Try again in\s*24h 0m/)
    wrapper.unmount()
  })

  it('a child gets a celebration when they pass', async () => {
    themeStore().setAudience('child')
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    vi.spyOn(ProgressDataSource, 'submitChallenge').mockResolvedValue(new $DataSourceResponse(passed, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain("Hooray! You’re now level 2!")
    expect(wrapper.findAll('.result__piece').length).toBeGreaterThan(0)
  })

  it('a refused start explains why instead of showing questions', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(
      refusal(403, 'you can try the challenge again once your cooldown is over'))
    const wrapper = await mountScreen(ChallengePlayScreen)
    const blocked = wrapper.get('[data-testid="play-blocked"]').text()
    expect(blocked).toContain("You can’t take the challenge right now")
    expect(blocked).toContain('You can try the challenge again once your cooldown is over.')
    expect(wrapper.find('[data-testid="challenge-question"]').exists()).toBe(false)
  })

  it('a level without enough questions says it is not ready yet', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(refusal(409, 'not enough questions'))
    const wrapper = await mountScreen(ChallengePlayScreen)
    expect(wrapper.get('[data-testid="play-blocked"]').text()).toContain('not ready yet')
  })

  it('a failed submit keeps the answers so it can be sent again', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    const submit = vi.spyOn(ProgressDataSource, 'submitChallenge')
      .mockResolvedValueOnce(new $DataSourceResponse<ChallengeOutcome>(null,
        new Exception({ exceptionType: ExceptionType.FAILED, message: 'Network error', statusCode: 0 })))
      .mockResolvedValueOnce(new $DataSourceResponse(passed, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    await wrapper.findAll('input[type="radio"]')[1].trigger('change')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Network error')
    expect(wrapper.get('[data-testid="next-question"]').text()).toBe('Try sending again')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenLastCalledWith(41, [1, null])
    expect(challengePlayStore().phase).toBe('result')
  })
})

describe('ChallengePlayScreen: leaving and resuming', () => {
  //The play screen as the router shows it, so its leave guard is live.
  async function mountRouted() {
    const blank = { template: '<div />' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/challenge/play', name: 'challengePlay', component: ChallengePlayScreen },
        { path: '/challenge-intro', name: 'challengeIntro', component: blank },
        { path: '/explore', name: 'explore', component: blank },
      ],
    })
    await router.push('/challenge/play')
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, router }
  }

  it('saves each answer moved past, so the challenge can be resumed', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    const save = vi.mocked(ProgressDataSource.saveChallengeAnswers)
    const wrapper = await mountScreen(ChallengePlayScreen)
    await wrapper.findAll('input[type="radio"]')[1].trigger('change')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    expect(save).toHaveBeenCalledWith(41, [1])
  })

  it('resuming carries on at the next question with the earlier answers kept', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(
      new $DataSourceResponse({ ...started, resumed: true, answers: [1] }, null))
    const submit = vi.spyOn(ProgressDataSource, 'submitChallenge').mockResolvedValue(new $DataSourceResponse(passed, null))
    const wrapper = await mountScreen(ChallengePlayScreen)

    expect(wrapper.text()).toContain('Question 2 of 2')
    expect(wrapper.get('[data-testid="welcome-back"]').text()).toContain('carry on from question 2')
    await wrapper.get('input[type="text"]').setValue('philile')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith(41, [1, 'philile'])
  })

  it('asks before leaving part-way, and staying keeps the learner on the question', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    const { wrapper, router } = await mountRouted()

    void router.push('/explore')
    await flushPromises()
    const dialog = wrapper.get('[role="alertdialog"]')
    expect(dialog.text()).toContain('Leave the challenge?')
    expect(document.activeElement?.getAttribute('data-testid')).toBe('leave-guard-stay')

    await wrapper.get('[data-testid="leave-guard-stay"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('challengePlay')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Question 1 of 2')

    void router.push('/explore')
    await flushPromises()
    await wrapper.get('[data-testid="leave-guard-leave"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('explore')
    wrapper.unmount()
  })

  it('warns before the tab is refreshed or closed mid-challenge, but not once the result is shown', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    vi.spyOn(ProgressDataSource, 'submitChallenge').mockResolvedValue(new $DataSourceResponse(passed, null))
    const { wrapper, router } = await mountRouted()

    const midway = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(midway)
    expect(midway.defaultPrevented).toBe(true)

    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="challenge-result"]').exists()).toBe(true)

    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
    await router.push('/explore')
    expect(router.currentRoute.value.name).toBe('explore')
    wrapper.unmount()
  })

  it('never offers the transcript of a listening question', async () => {
    const listening = new $ContentBlock(ContentBlockTypes.listenChoose,
      { title: '', fileUrl: '/uploads/audio/a.mp3', transcript: 'Sawubona', options: ['Hello', 'Bye'] } as never)
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(
      new $DataSourceResponse({ ...started, questions: [listening] }, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    expect(wrapper.find('audio').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Show transcript')
    expect(wrapper.text()).not.toContain('Sawubona')
  })
})

describe('the level-up challenge in isiZulu', () => {
  beforeEach(() => { i18n.global.locale.value = 'zulu' })

  it('the intro screen reads in isiZulu', async () => {
    vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(new $DataSourceResponse(report(), null))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    expect(wrapper.text()).toContain('Inselelo yokukhuphuka izinga')
    expect(wrapper.text()).toContain('Izinga 1 · A1')
    expect(wrapper.get('[data-testid="tests-count"]').text()).toBe('1 kwangu-3')
    expect(wrapper.get('[data-testid="status-locked"]').text()).toContain('Phumelela ezinye izivivinyo ezingu-2')
    expect(wrapper.text()).not.toMatch(/Level-up challenge|Pass 2 more quizzes|How the challenge works/)
  })

  it('the cooldown counts down in isiZulu', async () => {
    const cooldownUntil = new Date(Date.now() + 2 * 3600_000).toISOString()
    vi.spyOn(ProgressDataSource, 'checkEligibility').mockResolvedValue(
      new $DataSourceResponse(report({ testsPassed: 3, reason: 'cooldown_active', cooldownUntil, secondsRemaining: 7200 }), null))
    const wrapper = await mountScreen(ChallengeIntroScreen)
    const status = wrapper.get('[data-testid="status-cooldown"]').text()
    expect(status).toMatch(/Amahora: (1|2) · Imizuzu: \d+ · Imizuzwana: \d+/)
    expect(status).toContain('Zama futhi maduze')
    wrapper.unmount()
  })

  it('questions and the next button read in isiZulu', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    expect(wrapper.text()).toContain('Umbuzo 1 kwangu-2')
    expect(wrapper.get('[data-testid="next-question"]').text()).toBe('Yeqa lona')
    expect(wrapper.text()).not.toContain('Question 1')
  })

  it("a refused start gives the server's reason in isiZulu", async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(
      refusal(403, 'you can try the challenge again once your cooldown is over'))
    const wrapper = await mountScreen(ChallengePlayScreen)
    const blocked = wrapper.get('[data-testid="play-blocked"]').text()
    expect(blocked).toContain('Awukwazi ukwenza inselelo njengamanje')
    expect(blocked).toContain('Ungazama inselelo futhi uma isikhathi sokuphumula sesiphelile.')
    expect(blocked).not.toContain('cooldown')
  })

  it('a child who passes is celebrated in isiZulu', async () => {
    themeStore().setAudience('child')
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    vi.spyOn(ProgressDataSource, 'submitChallenge').mockResolvedValue(new $DataSourceResponse(passed, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()
    const result = wrapper.get('[data-testid="challenge-result"]').text()
    expect(result).toContain('Halala! Manje usezingeni 2!')
    expect(result).toContain('Uthole 100%')
    expect(result).not.toMatch(/Hooray|You scored/)
  })

  it('a failed challenge shows the score and the wait in isiZulu', async () => {
    vi.spyOn(ProgressDataSource, 'startChallenge').mockResolvedValue(new $DataSourceResponse(started, null))
    vi.spyOn(ProgressDataSource, 'submitChallenge').mockResolvedValue(new $DataSourceResponse(failedOutcome, null))
    const wrapper = await mountScreen(ChallengePlayScreen)
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await wrapper.get('[data-testid="next-question"]').trigger('click')
    await flushPromises()
    const result = wrapper.get('[data-testid="challenge-result"]').text()
    expect(result).toContain('Akuphumelelanga kulokhu')
    expect(result).toContain('Udinga u-70% ukuze uphumelele.')
    expect(result).toMatch(/Amahora: (23|24)/)
    expect(result).not.toMatch(/Not this time|Try again in/)
    wrapper.unmount()
  })
})
