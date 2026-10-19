import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ModeratorQuestionBlock from '../components/ModeratorQuestionBlock.vue'
import ReviewDetailScreen from '../screens/ReviewDetailScreen/ReviewDetailScreen.vue'
import ReviewQueueScreen from '@/features/review_queue_feature/presentation/screens/ReviewQueueScreen/ReviewQueueScreen.vue'
import { ReviewDetailDataSource } from '../../datasources/reviewDetailDataSource'
import { ReviewQueueDataSource } from '@/features/review_queue_feature/datasources/reviewQueueDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'
import type { ReviewDetailRow } from '../../models/ReviewDetailTypes'
import type { ReviewQueueRow } from '@/features/review_queue_feature/models/ReviewQueueTypes'
import { i18n } from '@/i18n'

const choice = new $ContentBlock(ContentBlockTypes.multipleChoice,
  { title: 'Greetings', question: 'How do you say hello?', options: ['Hamba kahle', 'Sawubona', ''], correctOption: 1 })
const gap = new $ContentBlock(ContentBlockTypes.fillBlank,
  { title: '', sentence: 'Ngi[] kahle', accepted: ['philile', 'Philile ', ''] })
const listen = new $ContentBlock(ContentBlockTypes.listenChoose,
  { title: '', fileUrl: '/uploads/audio/a.mp3', transcript: 'Yebo, ngiyabonga', options: ['No', 'Yes'], correctOption: 1 })

const detail = (over: Partial<ReviewDetailRow> = {}): ReviewDetailRow => ({
  id: 7, title: 'Greeting quiz', author: 'Ana Author', contentType: 'Test', level: 2, audience: 'Child-friendly',
  language: 'zulu', submittedAt: '2026-10-10T09:00:00.000Z', status: 'pending', version: 1, chosenTags: ['greetings'],
  content: [[new $ContentBlock(ContentBlockTypes.text, { title: 'Hello', text: 'Read this first.' }), choice], [gap]],
  decisions: [],
  ...over,
})

const queueRow = (over: Partial<ReviewQueueRow> = {}): ReviewQueueRow => ({
  id: 1, title: 'Market day', author: 'Ana Author', contentType: 'Lesson', level: 2, audience: 'General',
  language: 'english', submittedAt: new Date(Date.now() - 3600_000).toISOString(), ...over,
})

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/review-queue', name: 'reviewQueue', component: blank },
      { path: '/review-queue/:id', name: 'reviewDetail', component: blank },
    ],
  })
}

async function mountDetail() {
  const router = makeRouter()
  await router.push('/review-queue/7')
  const wrapper = mount(ReviewDetailScreen, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('ModeratorQuestionBlock', () => {
  it('marks the correct option of a multiple choice question', () => {
    const block = mount(ModeratorQuestionBlock, { props: { block: choice } })
    const correct = block.findAll('[data-correct="true"]')
    expect(correct).toHaveLength(1)
    expect(correct[0].text()).toContain('Sawubona')
    expect(correct[0].text()).toContain('Correct answer')
    expect(block.text()).toContain('How do you say hello?')
  })

  it('lists every accepted spelling of a gap, without blanks', () => {
    const block = mount(ModeratorQuestionBlock, { props: { block: gap } })
    expect(block.findAll('.mq__spelling').map(chip => chip.text())).toEqual(['philile', 'Philile'])
  })

  it('shows the transcript and the right answer of a listening question', () => {
    const block = mount(ModeratorQuestionBlock, { props: { block: listen } })
    expect(block.get('[data-testid="transcript"]').text()).toBe('Yebo, ngiyabonga')
    expect(block.get('[data-correct="true"]').text()).toContain('Yes')
    expect(block.find('audio').exists()).toBe(true)
  })

  it('flags a question that cannot be marked', () => {
    const broken = new $ContentBlock(ContentBlockTypes.multipleChoice,
      { title: '', question: 'Q', options: ['a', 'b'], correctOption: 5 })
    expect(mount(ModeratorQuestionBlock, { props: { block: broken } }).text()).toContain('No valid correct answer')
    const noSpelling = new $ContentBlock(ContentBlockTypes.fillBlank, { title: '', sentence: 'a []', accepted: [] })
    expect(mount(ModeratorQuestionBlock, { props: { block: noSpelling } }).text()).toContain('No accepted answer')
    const noGap = new $ContentBlock(ContentBlockTypes.fillBlank, { title: '', sentence: 'a ___', accepted: ['b'] })
    expect(mount(ModeratorQuestionBlock, { props: { block: noGap } }).text()).toContain('The sentence has no [] marking the gap.')
  })
})

describe('ReviewDetailScreen', () => {
  it('previews the pages with their answers and offers approve and reject only', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse(detail(), null))
    const wrapper = await mountDetail()
    expect(wrapper.text()).toContain('Read this first.')
    expect(wrapper.findAll('[data-testid="moderator-question"]')).toHaveLength(2)
    const buttons = wrapper.get('[data-testid="decision-panel"]').findAll('button').map(b => b.text())
    expect(buttons).toEqual(['Approve and publish', 'Reject'])
    expect(wrapper.text()).not.toMatch(/claim|request changes/i)
  })

  it('a rejection needs a reason before anything is sent', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse(detail(), null))
    const decide = vi.spyOn(ReviewDetailDataSource, 'decideContent').mockResolvedValue(new $DataSourceResponse(detail({
      status: 'rejected',
      decisions: [{ decision: 'rejected', reason: 'Add audio.', moderator: 'Mo Derator', decidedAt: '2026-10-11T09:00:00.000Z' }],
    }), null))
    const wrapper = await mountDetail()

    await wrapper.get('[data-testid="reject"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(decide).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('A reason is required')

    await wrapper.get('[data-testid="reject-reason"]').setValue('  Add audio.  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(decide).toHaveBeenCalledWith(7, 'rejected', 'Add audio.')
    expect(wrapper.get('[data-testid="decision-message"]').text()).toContain('Rejected')
    expect(wrapper.find('[data-testid="decision-panel"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Mo Derator')
  })

  it('approving sends no reason and shows the result', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse(detail(), null))
    const decide = vi.spyOn(ReviewDetailDataSource, 'decideContent').mockResolvedValue(
      new $DataSourceResponse(detail({ status: 'approved' }), null))
    const wrapper = await mountDetail()
    await wrapper.get('[data-testid="approve"]').trigger('click')
    await flushPromises()
    expect(decide).toHaveBeenCalledWith(7, 'approved', '')
    expect(wrapper.get('[data-testid="review-status"]').text()).toBe('Approved')
  })

  it('content its author reopened is read-only, with its history', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse(detail({
      status: 'draft',
      decisions: [{ decision: 'rejected', reason: 'Fix page two.', moderator: 'Mo Derator', decidedAt: '2026-10-11T09:00:00.000Z' }],
    }), null))
    const wrapper = await mountDetail()
    expect(wrapper.find('[data-testid="reopened-notice"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="decision-panel"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Fix page two.')
  })

  it('a failed decision keeps the content on screen and says why', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse(detail(), null))
    vi.spyOn(ReviewDetailDataSource, 'decideContent').mockResolvedValue(new $DataSourceResponse<ReviewDetailRow>(null,
      new Exception({ exceptionType: ExceptionType.CONFLICT, message: 'only pending content can be decided', statusCode: 409 })))
    const wrapper = await mountDetail()
    await wrapper.get('[data-testid="approve"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Greeting quiz')
    expect(wrapper.get('[data-testid="decision-panel"] [role="alert"]').text()).toContain('only pending content')
  })

  it('missing content gets a clear message instead of a blank page', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse<ReviewDetailRow>(null,
      new Exception({ exceptionType: ExceptionType.NOT_FOUND, message: 'content not found', statusCode: 404 })))
    const wrapper = await mountDetail()
    expect(wrapper.get('[data-testid="review-load-error"]').text()).toContain('This content does not exist')
  })
})

describe('ReviewQueueScreen', () => {
  async function mountQueue() {
    const router = makeRouter()
    await router.push('/review-queue')
    const wrapper = mount(ReviewQueueScreen, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('lists what is waiting with its level, type and audience', async () => {
    vi.spyOn(ReviewQueueDataSource, 'getReviewQueue').mockResolvedValue(new $DataSourceResponse([
      queueRow(),
      queueRow({ id: 2, title: 'Counting quiz', contentType: 'Test', audience: 'Child-friendly', level: 1 }),
    ], null))
    const wrapper = await mountQueue()
    const rows = wrapper.findAll('[data-testid="queue-row"]')
    expect(rows).toHaveLength(2)
    expect(wrapper.get('[data-testid="queue-summary"]').text()).toContain('2 waiting')
    expect(rows.map(row => row.text()).join(' ')).toContain('Child-friendly')
    expect(rows[0].get('a').attributes('href')).toMatch(/^\/review-queue\/\d$/)
  })

  it('says when the queue is empty', async () => {
    vi.spyOn(ReviewQueueDataSource, 'getReviewQueue').mockResolvedValue(new $DataSourceResponse([], null))
    const wrapper = await mountQueue()
    expect(wrapper.find('[data-testid="queue-empty"]').exists()).toBe(true)
  })

  it('filters by type, and offers to clear filters that match nothing', async () => {
    vi.spyOn(ReviewQueueDataSource, 'getReviewQueue').mockResolvedValue(new $DataSourceResponse([queueRow()], null))
    const wrapper = await mountQueue()
    await wrapper.get('#queue-type').setValue('Test')
    expect(wrapper.find('[data-testid="queue-no-match"]').exists()).toBe(true)
    await wrapper.get('[data-testid="queue-no-match"] button').trigger('click')
    expect(wrapper.findAll('[data-testid="queue-row"]')).toHaveLength(1)
  })

  it('shows a load failure with a way to retry', async () => {
    const load = vi.spyOn(ReviewQueueDataSource, 'getReviewQueue').mockResolvedValue(new $DataSourceResponse<ReviewQueueRow[]>(null,
      new Exception({ exceptionType: ExceptionType.FAILED, message: 'Failed to load review queue.', statusCode: 500 })))
    const wrapper = await mountQueue()
    expect(wrapper.get('[role="alert"]').text()).toContain('Failed to load review queue.')
    await wrapper.get('[role="alert"] button').trigger('click')
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('moderation in isiZulu', () => {
  beforeEach(() => { i18n.global.locale.value = 'zulu' })

  it('the queue reads in isiZulu, including the waiting time and the labels from the server', async () => {
    vi.spyOn(ReviewQueueDataSource, 'getReviewQueue').mockResolvedValue(new $DataSourceResponse([
      queueRow({ submittedAt: new Date(Date.now() - 3 * 86_400_000 - 60_000).toISOString() }),
      queueRow({ id: 2, contentType: 'Test', audience: 'Child-friendly' }),
    ], null))
    const router = makeRouter()
    await router.push('/review-queue')
    const wrapper = mount(ReviewQueueScreen, { global: { plugins: [router] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('Uhlu lokubuyekeza')
    expect(text).toContain('Okungu-2 kulinde isinqumo')
    expect(text).toContain('izinsuku ezingu-3')
    expect(text).toContain('Isivivinyo')
    expect(text).toContain('Kulungele izingane')
    expect(text).toContain('isiNgisi')
    expect(wrapper.findAll('[data-testid="queue-row"]')[0].text()).toContain('Buyekeza')
    expect(text).not.toContain('Review queue')
    expect(text).not.toContain('waiting for a decision')
    expect(text).not.toContain('Child-friendly')
  })

  it('a queue that failed to load says so in isiZulu', async () => {
    vi.spyOn(ReviewQueueDataSource, 'getReviewQueue').mockResolvedValue(new $DataSourceResponse<ReviewQueueRow[]>(null,
      new Exception({ exceptionType: ExceptionType.FAILED, message: 'Failed to load review queue. Please try again.', statusCode: 500 })))
    const router = makeRouter()
    await router.push('/review-queue')
    const wrapper = mount(ReviewQueueScreen, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Asikwazanga ukulayisha uhlu lokubuyekeza')
    expect(wrapper.get('[role="alert"] button').text()).toBe('Zama futhi')
  })

  it('the detail screen, its questions and its decisions read in isiZulu', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse(detail(), null))
    const wrapper = await mountDetail()
    const buttons = wrapper.get('[data-testid="decision-panel"]').findAll('button').map(b => b.text())
    expect(buttons).toEqual(['Gunyaza futhi ushicilele', 'Yenqaba'])
    expect(wrapper.get('[data-testid="review-status"]').text()).toBe('Kulinde ukubuyekezwa')
    expect(wrapper.text()).toContain('Impendulo efanele')
    expect(wrapper.text()).toContain('Izimpendulo ezamukelekayo')
    expect(wrapper.text()).toContain('Izinga 2 · A1+')
    expect(wrapper.text()).not.toMatch(/Approve and publish|Correct answer|Decision history|Preview/)

    await wrapper.get('[data-testid="reject"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('Kudingeka isizathu uma wenqaba.')
  })

  it('a refusal from the server is shown in isiZulu', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse(detail(), null))
    vi.spyOn(ReviewDetailDataSource, 'decideContent').mockResolvedValue(new $DataSourceResponse<ReviewDetailRow>(null,
      new Exception({ exceptionType: ExceptionType.CONFLICT, message: 'only pending content can be decided', statusCode: 409 })))
    const wrapper = await mountDetail()
    await wrapper.get('[data-testid="approve"]').trigger('click')
    await flushPromises()
    const alert = wrapper.get('[data-testid="decision-panel"] [role="alert"]').text()
    expect(alert).toContain('okulinde ukubuyekezwa')
    expect(alert).not.toContain('only pending content')
  })

  it('missing content is explained in isiZulu', async () => {
    vi.spyOn(ReviewDetailDataSource, 'getReviewDetail').mockResolvedValue(new $DataSourceResponse<ReviewDetailRow>(null,
      new Exception({ exceptionType: ExceptionType.NOT_FOUND, message: 'content not found', statusCode: 404 })))
    const wrapper = await mountDetail()
    expect(wrapper.get('[data-testid="review-load-error"]').text()).toContain('Lokhu okuqukethwe akukho')
    expect(wrapper.text()).not.toContain('This content does not exist')
  })
})
