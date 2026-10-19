import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import TestScreen from '@/features/learner_experience/presentation/screens/TestScreen/TestScreen.vue'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { TestAttemptDataSource } from '@/features/learner_experience/datasources/learnerDataSource'
import { themeStore } from '@/features/shared/state/themeStore'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes, type $ContentRecord } from '@/features/shared/models/contentType'
import type { $TestResult } from '@/features/learner_experience/models/learnerTypes'
import { i18n } from '@/i18n'

//Content as a learner receives it: the answers already taken out by the server.
const choice = new $ContentBlock(ContentBlockTypes.multipleChoice,
  { title: 'Greetings', question: 'How do you say hello?', options: ['Hamba kahle', 'Sawubona'] } as never)
const gap = new $ContentBlock(ContentBlockTypes.fillBlank,
  { title: 'Greetings', sentence: 'You say [] in the morning.' } as never)

const record = (over: Partial<$ContentRecord> = {}): $ContentRecord => ({
  contentId: 9, authorId: 3, title: 'Greetings test', language: 'zulu', childFriendly: true,
  status: 'approved', version: 1, level: 1, chosenTags: [], kind: 'quiz',
  content: [[choice], [gap]], updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: null, ...over,
})

const result = (over: Partial<$TestResult> = {}): $TestResult => ({
  attemptId: 1, contentId: 9, total: 2, score: 1, percent: 50, passed: false, passMark: 70, countsTowardLevelUp: true,
  questions: [{ correct: true }, { correct: false }], ...over,
})

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/test/:contentId', name: 'test', component: blank },
      { path: '/read/:contentId', name: 'reader', component: blank },
      { path: '/explore', name: 'explore', component: blank },
      { path: '/my-learning', name: 'myLearning', component: blank },
    ],
  })
}

//A screen left mounted would keep its leave guard listening to the window.
enableAutoUnmount(afterEach)

describe('TestScreen', () => {
  let router: ReturnType<typeof makeRouter>

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    router = makeRouter()
    await router.push('/test/9')
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(record(), null))
    vi.spyOn(TestAttemptDataSource, 'submit').mockResolvedValue(new $DataSourceResponse(result(), null))
  })

  async function mountScreen() {
    const wrapper = mount(TestScreen, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  //Answers both questions: the second option, then a typed word.
  //Any mounted wrapper holding the test screen: on its own, or inside a RouterView.
  async function answerBoth(wrapper: Pick<VueWrapper, 'findAll' | 'get'>) {
    await wrapper.findAll('input[type="radio"]')[1].trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('input.question-block__gap').setValue('sawubona')
  }

  it('nominal: shows one question at a time with a progress count, Next only once answered', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.get('[data-testid="question-count"]').text()).toBe('Question 1 of 2')
    expect(wrapper.text()).toContain('How do you say hello?')
    expect(wrapper.get('[data-testid="next"]').attributes('disabled')).toBeDefined()

    await wrapper.findAll('input[type="radio"]')[1].trigger('change')
    expect(wrapper.get('[data-testid="next"]').attributes('disabled')).toBeUndefined()
  })

  it('is forward-only: no way back to an earlier question', async () => {
    const wrapper = await mountScreen()
    await wrapper.findAll('input[type="radio"]')[0].trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="question-count"]').text()).toBe('Question 2 of 2')
    expect(wrapper.text()).not.toContain('How do you say hello?')
    expect(wrapper.findAll('button').map((button) => button.text().toLowerCase()))
      .not.toContain(expect.stringMatching(/back|previous/))
  })

  it('sends every answer at the end and shows the result without the right answers', async () => {
    const wrapper = await mountScreen()
    await answerBoth(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(TestAttemptDataSource.submit).toHaveBeenCalledWith(9, [1, 'sawubona'])
    const results = wrapper.get('[data-testid="test-results"]')
    expect(results.get('[data-testid="score"]').text()).toContain('1 of 2 right')
    expect(results.get('[data-testid="pass-badge"]').text()).toContain('Not passed')
    expect(results.get('[data-testid="pass-badge"]').text()).toContain('70%')
    expect(results.findAll('[data-testid="question-result"]').map((row) => row.text()))
      .toEqual(['Question 1Right', 'Question 2Not right'])
    //Nothing that could give away an answer is on the results.
    expect(results.text()).not.toMatch(/Hamba kahle|Sawubona/)
  })

  it('a child gets stars for their score', async () => {
    themeStore().setAudience('child')
    vi.mocked(TestAttemptDataSource.submit).mockResolvedValue(new $DataSourceResponse(
      result({ score: 2, percent: 100, passed: true, questions: [{ correct: true }, { correct: true }] }), null))
    const wrapper = await mountScreen()
    await answerBoth(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const stars = wrapper.findAll('[data-testid="star"]')
    expect(stars).toHaveLength(5)
    expect(stars.filter((star) => star.attributes('data-filled') === 'true')).toHaveLength(5)
    expect(wrapper.text()).toContain('Perfect score!')
    themeStore().setAudience('general')
  })

  it('retry starts again at the first question', async () => {
    const wrapper = await mountScreen()
    await answerBoth(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="question-count"]').text()).toBe('Question 1 of 2')
  })

  it('keeps the answers and offers to send again when marking fails', async () => {
    vi.mocked(TestAttemptDataSource.submit).mockResolvedValue(new $DataSourceResponse<$TestResult>(
      null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'Network error', statusCode: 0 })))
    const wrapper = await mountScreen()
    await answerBoth(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="submit-error"]').text()).toMatch(/can’t reach/)
    expect(wrapper.get('[data-testid="submit"]').text()).toBe('Send again')
  })

  it('invalid input: content above the learner\'s level shows why, not a crash', async () => {
    vi.mocked(ContentDataSource.getContent).mockResolvedValue(new $DataSourceResponse<$ContentRecord>(
      null, new Exception({ exceptionType: ExceptionType.FORBIDDEN, message: 'this content is above your level', statusCode: 403 })))
    const wrapper = await mountScreen()
    expect(wrapper.get('[data-testid="test-error"]').text()).toContain('above your level for now')
  })

  it('content with no questions says there is no test', async () => {
    vi.mocked(ContentDataSource.getContent).mockResolvedValue(new $DataSourceResponse(
      record({ content: [[new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'Just reading' })]], kind: 'story' }), null))
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="no-questions"]').exists()).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('in isiZulu: the question count, buttons and results are in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = await mountScreen()
    expect(wrapper.get('[data-testid="question-count"]').text()).toBe('Umbuzo 1 kwangu-2')
    expect(wrapper.get('[data-testid="next"]').text()).toContain('Okulandelayo')
    expect(wrapper.text()).toContain('Awukwazi ukubuyela emuva uma usuqhubekile.')

    await answerBoth(wrapper)
    expect(wrapper.get('[data-testid="submit"]').text()).toBe('Qeda, ngibone amamaki ami')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const results = wrapper.get('[data-testid="test-results"]').text()
    expect(results).toContain('Awuphumelelanga kulokhu')
    expect(results).toContain('1 kwangu-2 kulungile')
    expect(results).toContain('Udinga u-70% ukuze uphumelele.')
    expect(results).not.toContain('Not passed')
    expect(results).not.toContain('Question 1')
  })

  //Passed, full marks: only what the result says about levelling up differs.
  const passedResult = (countsTowardLevelUp: boolean) => result({
    score: 2, percent: 100, passed: true, countsTowardLevelUp, questions: [{ correct: true }, { correct: true }],
  })

  it('a pass at the learner\'s level says it counts toward the level-up challenge', async () => {
    vi.mocked(TestAttemptDataSource.submit).mockResolvedValue(new $DataSourceResponse(passedResult(true), null))
    const wrapper = await mountScreen()
    await answerBoth(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="result-message"]').text()).toContain('counts toward your level-up challenge')
  })

  it('a pass below the learner\'s level is practice, and does not claim to count', async () => {
    vi.mocked(TestAttemptDataSource.submit).mockResolvedValue(new $DataSourceResponse(passedResult(false), null))
    const wrapper = await mountScreen()
    await answerBoth(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const message = wrapper.get('[data-testid="result-message"]').text()
    expect(message).not.toContain('counts toward your level-up challenge')
    expect(message).toContain('only quizzes at your level count toward levelling up')
  })

  it('a child\'s practice pass says so too, in isiZulu as well', async () => {
    themeStore().setAudience('child')
    i18n.global.locale.value = 'zulu'
    vi.mocked(TestAttemptDataSource.submit).mockResolvedValue(new $DataSourceResponse(passedResult(false), null))
    const wrapper = await mountScreen()
    await answerBoth(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="result-message"]').text()).toContain('Uzijwayeze kahle!')
    themeStore().setAudience('general')
  })

  it('never offers the transcript of a listening question', async () => {
    const listening = new $ContentBlock(ContentBlockTypes.listenChoose,
      { title: 'Listen', fileUrl: '/uploads/audio/a.mp3', transcript: 'Sawubona', options: ['Hello', 'Bye'] } as never)
    vi.mocked(ContentDataSource.getContent).mockResolvedValue(new $DataSourceResponse(record({ content: [[listening]] }), null))
    const wrapper = await mountScreen()
    expect(wrapper.find('audio').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Show transcript')
    expect(wrapper.text()).not.toContain('Sawubona')
  })

  describe('leaving part-way', () => {
    //The test screen as the router shows it, so its leave guard is live.
    async function mountRouted() {
      const blank = { template: '<div />' }
      const routed = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/test/:contentId', name: 'test', component: TestScreen },
          { path: '/explore', name: 'explore', component: blank },
          { path: '/my-learning', name: 'myLearning', component: blank },
          { path: '/read/:contentId', name: 'reader', component: blank },
        ],
      })
      await routed.push('/test/9')
      const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [routed] }, attachTo: document.body })
      await flushPromises()
      return { wrapper, routed }
    }

    function unloadIsWarned(): boolean {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    it('before the first answer there is nothing to lose, so nothing is asked', async () => {
      const { wrapper, routed } = await mountRouted()
      expect(unloadIsWarned()).toBe(false)
      await routed.push('/explore')
      expect(routed.currentRoute.value.name).toBe('explore')
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    })

    it('once answering, leaving asks first: Stay keeps the test and its answers, Leave goes', async () => {
      const { wrapper, routed } = await mountRouted()
      await wrapper.findAll('input[type="radio"]')[1].trigger('change')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(unloadIsWarned()).toBe(true)

      void routed.push('/explore')
      await flushPromises()
      const dialog = wrapper.get('[role="alertdialog"]')
      expect(dialog.text()).toContain('Leave this test?')
      expect(dialog.attributes('aria-modal')).toBe('true')
      expect(document.activeElement?.getAttribute('data-testid')).toBe('leave-guard-stay')

      await wrapper.get('[data-testid="leave-guard-stay"]').trigger('click')
      await flushPromises()
      expect(routed.currentRoute.value.name).toBe('test')
      expect(wrapper.get('[data-testid="question-count"]').text()).toBe('Question 2 of 2')

      // Escape is the same as Stay.
      void routed.push('/explore')
      await flushPromises()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(routed.currentRoute.value.name).toBe('test')

      void routed.push('/explore')
      await flushPromises()
      await wrapper.get('[data-testid="leave-guard-leave"]').trigger('click')
      await flushPromises()
      expect(routed.currentRoute.value.name).toBe('explore')
    })

    it('in isiZulu, the question is asked in isiZulu', async () => {
      i18n.global.locale.value = 'zulu'
      const { wrapper, routed } = await mountRouted()
      await wrapper.findAll('input[type="radio"]')[1].trigger('change')
      void routed.push('/explore')
      await flushPromises()
      expect(wrapper.get('[role="alertdialog"]').text()).toContain('Uyasishiya lesi sivivinyo?')
      expect(wrapper.get('[data-testid="leave-guard-stay"]').text()).toBe('Hlala uqedele')
    })

    it('once the results are showing, leaving is not blocked', async () => {
      const { wrapper, routed } = await mountRouted()
      await answerBoth(wrapper)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.find('[data-testid="test-results"]').exists()).toBe(true)

      expect(unloadIsWarned()).toBe(false)
      await routed.push('/my-learning')
      expect(routed.currentRoute.value.name).toBe('myLearning')
    })
  })

})
