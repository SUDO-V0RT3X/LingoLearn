import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import MyLearningScreen from '@/features/learner_experience/presentation/screens/MyLearningScreen/MyLearningScreen.vue'
import { TestAttemptDataSource } from '@/features/learner_experience/datasources/learnerDataSource'
import { themeStore } from '@/features/shared/state/themeStore'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { $AttemptHistoryRow, $MyLearning, $TestBestRow } from '@/features/learner_experience/models/learnerTypes'
import { i18n } from '@/i18n'

const attempt = (over: Partial<$AttemptHistoryRow> = {}): $AttemptHistoryRow => ({
  attemptId: 1, contentId: 4, title: 'Greetings test', level: 2, score: 4, total: 5,
  percent: 80, passed: true, submittedAt: '2026-10-10T09:00:00.000Z', ...over,
})

const best = (over: Partial<$TestBestRow> = {}): $TestBestRow => ({
  contentId: 4, title: 'Greetings test', level: 2, bestPercent: 80, passed: true, attempts: 2,
  lastSubmittedAt: '2026-10-10T09:00:00.000Z', ...over,
})

const learning = (over: Partial<$MyLearning> = {}): $MyLearning => ({
  currentLevel: 2, testsPassedAtLevel: 3, testsRequired: 6, readyForChallenge: false,
  testsCompleted: 4, testsPassed: 3, averagePercent: 72,
  history: [
    attempt(),
    attempt({ attemptId: 3, score: 1, percent: 20, passed: false }),
    attempt({ attemptId: 2, contentId: 5, title: 'Animals test', score: 1, percent: 20, passed: false }),
  ],
  bestResults: [best(), best({ contentId: 5, title: 'Animals test', bestPercent: 20, passed: false, attempts: 1 })],
  continueReading: [], ...over,
})

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/explore', name: 'explore', component: blank },
      { path: '/read/:contentId', name: 'reader', component: blank },
      { path: '/challenge-intro', name: 'challengeIntro', component: blank },
    ],
  })
}

describe('MyLearningScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    delete document.documentElement.dataset.theme
  })

  async function mountWith(response: $DataSourceResponse<$MyLearning>) {
    vi.spyOn(TestAttemptDataSource, 'getMyLearning').mockResolvedValue(response)
    const wrapper = mount(MyLearningScreen, { global: { plugins: [makeRouter()] } })
    await flushPromises()
    return wrapper
  }

  it('nominal: shows the level, progress toward the challenge, statistics and history', async () => {
    const wrapper = await mountWith(new $DataSourceResponse(learning(), null))

    expect(wrapper.get('[data-testid="level-card"]').text()).toContain('Level 2 · A1+')
    expect(wrapper.get('[data-testid="challenge-count"]').text()).toBe('3 / 6')
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')
    expect(wrapper.text()).toContain('Pass 3 more quizzes at Level 2')
    expect(wrapper.get('[data-testid="stat-completed"]').text()).toBe('4')
    expect(wrapper.get('[data-testid="stat-passed"]').text()).toBe('3')
    expect(wrapper.get('[data-testid="stat-average"]').text()).toBe('72%')

    // Labelled as what they are: per distinct test, the average of each one's best score.
    expect(wrapper.text()).toContain('Different quizzes taken')
    expect(wrapper.text()).toContain('Average best score')
    expect(wrapper.text()).toContain('Your best score on each quiz, averaged.')

    // An adult's history is every attempt, labelled so, each title linking to the reader.
    const rows = wrapper.findAll('[data-testid="history-row"]')
    expect(rows).toHaveLength(3)
    expect(wrapper.text()).toContain('Every attempt, newest first')
    expect(rows[0].text()).toContain('Greetings test')
    expect(rows[0].text()).toContain('4/5 · 80%')
    expect(rows[0].get('a').attributes('href')).toBe('/read/4')
    expect(rows[2].text()).toContain('Not passed')
    expect(rows[2].get('a').attributes('href')).toBe('/read/5')
    expect(wrapper.find('[data-testid="challenge-cta"]').exists()).toBe(false)
  })

  it('offers the level-up challenge once the learner is ready', async () => {
    const wrapper = await mountWith(new $DataSourceResponse(
      learning({ testsPassedAtLevel: 6, readyForChallenge: true }), null))
    const cta = wrapper.get('[data-testid="challenge-cta"]')
    expect(cta.attributes('href')).toBe('/challenge-intro')
    expect(wrapper.text()).toContain('move up to Level 3')
  })

  it('boundary: at the top level there is no challenge to work toward', async () => {
    const wrapper = await mountWith(new $DataSourceResponse(
      learning({ currentLevel: 6, testsPassedAtLevel: 6, readyForChallenge: false }), null))
    expect(wrapper.find('[data-testid="challenge-count"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('top level')
  })

  it('a learner with no tests yet is pointed at Explore', async () => {
    const wrapper = await mountWith(new $DataSourceResponse(
      learning({ testsPassedAtLevel: 0, testsCompleted: 0, testsPassed: 0, averagePercent: 0, history: [] }), null))
    expect(wrapper.find('[data-testid="history-empty"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="history-row"]')).toHaveLength(0)
  })

  it('lists part-read content to continue', async () => {
    const wrapper = await mountWith(new $DataSourceResponse(learning({
      continueReading: [{ contentId: 7, title: 'Halfway', page: 0, totalPages: 3, updatedAt: '2026-10-11T00:00:00.000Z' }],
    }), null))
    expect(wrapper.get('[data-testid="continue-reading"]').attributes('href')).toBe('/read/7')
  })

  it('invalid input: a failed load shows an error with a retry, not a blank page', async () => {
    const wrapper = await mountWith(new $DataSourceResponse<$MyLearning>(
      null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'Failed to load your learning. Please try again.', statusCode: 500 })))
    expect(wrapper.get('[data-testid="my-learning-error"]').text()).toContain('Failed to load your learning')

    vi.mocked(TestAttemptDataSource.getMyLearning).mockResolvedValue(new $DataSourceResponse(learning(), null))
    await wrapper.get('[data-testid="my-learning-error"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="level-card"]').exists()).toBe(true)
  })

  it('a child sees "My stars" with stars toward the next level', async () => {
    themeStore().setAudience('child')
    const wrapper = await mountWith(new $DataSourceResponse(learning(), null))

    expect(wrapper.text()).toContain('My stars')
    const levelStars = wrapper.get('[data-testid="level-card"]').findAll('[data-testid="star"]')
    expect(levelStars).toHaveLength(6)
    expect(levelStars.filter((star) => star.attributes('data-filled') === 'true')).toHaveLength(3)
    expect(wrapper.find('table').exists()).toBe(false)

    // One card per quiz with the best try, not one per attempt, each opening the story.
    const cards = wrapper.findAll('[data-testid="history-row"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('Greetings test')
    expect(cards[0].text()).toContain('Passed')
    expect(cards[0].text()).toContain('Tried 2 times')
    expect(cards[0].get('a').attributes('href')).toBe('/read/4')
    expect(cards[1].text()).toContain('Not passed yet')
    expect(cards[1].text()).toContain('Tried once')
    expect(cards[1].get('a').attributes('href')).toBe('/read/5')
    expect(wrapper.text()).not.toContain('Try again')
  })

  it('in isiZulu: the level card, statistics and history are in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = await mountWith(new $DataSourceResponse(learning(), null))
    const text = wrapper.text()
    expect(text).toContain('Intuthuko yakho')
    expect(wrapper.get('[data-testid="level-card"]').text()).toContain('Izinga 2 · A1+')
    expect(text).toContain('Phumelela izivivinyo ezingu-3 ezisele ezingeni 2')
    expect(text).toContain('Isilinganiso samamaki')
    expect(text).toContain('Umlando wezivivinyo')
    expect(text).toContain('Awuphumelelanga')
    expect(text).not.toContain('Test history')
    expect(text).not.toContain('Pass 3 more tests')
  })

  it('in isiZulu: one test to go uses the singular', async () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = await mountWith(new $DataSourceResponse(learning({ testsPassedAtLevel: 5 }), null))
    expect(wrapper.text()).toContain('Phumelela isivivinyo esingu-1 esisele ezingeni 2')
  })

})
