import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ReaderScreen from '@/features/learner_experience/presentation/screens/ReaderScreen/ReaderScreen.vue'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReadingDataSource } from '@/features/learner_experience/datasources/learnerDataSource'
import { RecordingDataSource } from '@/features/learner_experience/datasources/recordingDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes, type $ContentRecord } from '@/features/shared/models/contentType'
import { i18n } from '@/i18n'

const page = (text: string) => [new $ContentBlock(ContentBlockTypes.text, { title: '', text })]

const record = (over: Partial<$ContentRecord> = {}): $ContentRecord => ({
  contentId: 5, authorId: 3, title: 'Three pages', language: 'zulu', childFriendly: true,
  status: 'approved', version: 1, level: 1, chosenTags: [], kind: 'quiz',
  content: [page('One'), page('Two'), page('Three')],
  updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: null, ...over,
})

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/read/:contentId', name: 'reader', component: blank },
      { path: '/test/:contentId', name: 'test', component: blank },
      { path: '/explore', name: 'explore', component: blank },
      { path: '/my-learning', name: 'myLearning', component: blank },
    ],
  })
}

describe('ReaderScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(record(), null))
    vi.spyOn(ReadingDataSource, 'getProgress').mockResolvedValue(new $DataSourceResponse({ page: 1, totalPages: 3 }, null))
    vi.spyOn(ReadingDataSource, 'saveProgress').mockResolvedValue(new $DataSourceResponse({ page: 1, totalPages: 3 }, null))
    vi.spyOn(RecordingDataSource, 'getMine').mockResolvedValue(new $DataSourceResponse<Blob | null>(null, null))
  })

  async function mountScreen() {
    const router = makeRouter()
    await router.push('/read/5')
    const wrapper = mount(ReaderScreen, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  //The viewer's Next button.
  const nextButton = (wrapper: Awaited<ReturnType<typeof mountScreen>>) =>
    wrapper.findAll('.page-nav button').find((button) => button.text().startsWith('Next'))!

  it('content with an example reading: fetches the learner\'s saved read-aloud recording for it', async () => {
    const audio = new $ContentBlock(ContentBlockTypes.audio, { title: '', fileUrl: '/uploads/audio/a.mp3', transcript: '' })
    vi.mocked(ContentDataSource.getContent).mockResolvedValue(new $DataSourceResponse(record({ content: [page('One'), [audio], page('Three')] }), null))
    await mountScreen()
    expect(RecordingDataSource.getMine).toHaveBeenCalledWith(5)
  })

  it('content with no example reading: a recording is a temporary take, so nothing is fetched', async () => {
    const wrapper = await mountScreen()
    expect(RecordingDataSource.getMine).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="practice-panel"]').text()).toContain('kept until you leave this page')
  })

  it('nominal: resumes at the saved page and records the visit', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.text()).toContain('Page 2 of 3')
    expect(wrapper.text()).toContain('Two')
    expect(ReadingDataSource.saveProgress).toHaveBeenCalledWith(5, 1, 3)
  })

  it('saves the page every time the learner turns it', async () => {
    const wrapper = await mountScreen()
    await nextButton(wrapper).trigger('click')
    await flushPromises()
    expect(ReadingDataSource.saveProgress).toHaveBeenLastCalledWith(5, 2, 3)
  })

  it('offers the test at the end of content that has one', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="take-test"]').exists()).toBe(false)

    await nextButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="take-test"]').attributes('href')).toBe('/test/5')
  })

  it('boundary: a story with no test ends with a way back to Explore instead', async () => {
    vi.mocked(ContentDataSource.getContent).mockResolvedValue(new $DataSourceResponse(
      record({ kind: 'story', content: [page('Only page')] }), null))
    vi.mocked(ReadingDataSource.getProgress).mockResolvedValue(new $DataSourceResponse({ page: 0, totalPages: 1 }, null))
    const wrapper = await mountScreen()
    const end = wrapper.get('[data-testid="reader-end"]')
    expect(end.find('[data-testid="take-test"]').exists()).toBe(false)
    expect(end.get('a').attributes('href')).toBe('/explore')
  })

  it('a failed save is mentioned, and reading carries on', async () => {
    vi.mocked(ReadingDataSource.saveProgress).mockResolvedValue(new $DataSourceResponse<{ page: number; totalPages: number }>(
      null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'Failed to save your place.', statusCode: 500 })))
    const wrapper = await mountScreen()
    expect(wrapper.text()).toContain("couldn’t save your place")
    expect(wrapper.text()).toContain('Two')
  })

  it('invalid input: content above the learner\'s level explains itself, not a crash', async () => {
    vi.mocked(ContentDataSource.getContent).mockResolvedValue(new $DataSourceResponse<$ContentRecord>(
      null, new Exception({ exceptionType: ExceptionType.FORBIDDEN, message: 'this content is above your level', statusCode: 403 })))
    const wrapper = await mountScreen()
    const error = wrapper.get('[data-testid="reader-error"]')
    expect(error.text()).toContain('above your level for now')
    expect(error.findAll('a').map((link) => link.attributes('href'))).toContain('/my-learning')
  })

  it('in isiZulu: the toolbar, page count, recording bar and wallpaper picker are in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = await mountScreen()
    const text = wrapper.text()
    expect(text).toContain('Ikhasi 2 kwangu-3')
    expect(text).toContain('Buyela ku-Hlola')
    expect(text).toContain('Izinga 1 · A1 · kunesivivinyo')
    expect(text).not.toContain('Page 2 of 3')
    expect(text).not.toContain('Back to Explore')

    const background = wrapper.findAll('button').find((button) => button.text() === 'Ingemuva')!
    await background.trigger('click')
    expect(wrapper.text()).toContain('Khetha ingemuva lakho')
    expect(wrapper.text()).toContain('Iphepha Elifudumele')
    expect(wrapper.text()).not.toContain('Warm Paper')
  })

  const refuse = (message: string, statusCode: number) => vi.mocked(ContentDataSource.getContent).mockResolvedValue(
    new $DataSourceResponse<$ContentRecord>(null, new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode })))
  const buttons = (wrapper: Awaited<ReturnType<typeof mountScreen>>) => wrapper.findAll('button').map((button) => button.text())

  it('not found: says so, with no Background and no Try again', async () => {
    refuse('content not found', 404)
    const wrapper = await mountScreen()
    const error = wrapper.get('[data-testid="reader-error"]')
    expect(error.text()).toContain('Nothing to read here')
    expect(buttons(wrapper)).not.toContain('Try again')
    expect(wrapper.find('[data-testid="wallpaper-button"]').exists()).toBe(false)
    expect(error.findAll('a').map((link) => link.attributes('href'))).toEqual(['/explore'])
  })

  it('a draft, pending or rejected piece is "not available" to a learner, with only a way back to Explore', async () => {
    refuse('this content belongs to another author', 403)
    const wrapper = await mountScreen()
    const error = wrapper.get('[data-testid="reader-error"]')
    expect(error.text()).toContain('This isn’t available')
    expect(error.text()).not.toMatch(/another author/i)
    expect(error.text()).not.toContain('See my level')
    expect(error.findAll('a').map((link) => link.attributes('href'))).toEqual(['/explore'])
    expect(wrapper.find('[data-testid="wallpaper-button"]').exists()).toBe(false)
  })

  it('a server or network failure keeps Try again', async () => {
    refuse('failed request', 500)
    const wrapper = await mountScreen()
    expect(buttons(wrapper)).toContain('Try again')
  })

  it('shows the byline the record carries, even when opened by its address', async () => {
    vi.mocked(ContentDataSource.getContent).mockResolvedValue(new $DataSourceResponse(record({ authorName: 'One Author' }), null))
    const wrapper = await mountScreen()
    expect(wrapper.text()).toContain('by One Author')
  })

  it('the wallpaper picker closes on Escape', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="wallpaper-button"]').trigger('click')
    expect(wrapper.find('[data-testid="wallpaper-picker"]').exists()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[data-testid="wallpaper-picker"]').exists()).toBe(false)
  })
})
