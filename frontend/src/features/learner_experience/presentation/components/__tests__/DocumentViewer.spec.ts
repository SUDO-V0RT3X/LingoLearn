import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { shallowMount } from '@vue/test-utils'
import DocumentViewer from '@/features/learner_experience/presentation/components/DocumentViewer.vue'
import BlockRenderer from '@/features/learner_experience/presentation/components/BlockRenderer.vue'
import PageNav from '@/features/learner_experience/presentation/components/PageNav.vue'
import RecordingBar from '@/features/learner_experience/presentation/components/RecordingBar.vue'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'
import type { MicRecorder } from '@/features/learner_experience/functions/useMicRecorder'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { RecordingDataSource } from '@/features/learner_experience/datasources/recordingDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
vi.mock('@/features/learner_experience/functions/useMicRecorder', () => ({ useMicRecorder: vi.fn() }))
import { useMicRecorder } from '@/features/learner_experience/functions/useMicRecorder'

//The recorder the viewer sees, with whatever state a test needs.
function makeMic(overrides: Partial<MicRecorder> = {}): MicRecorder {
  const mic: MicRecorder = {
    isRecording: ref(false),
    hasRecording: ref(false),
    recordedUrl: ref<string | null>(null),
    recordedBlob: ref<Blob | null>(null),
    error: ref<string | null>(null),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    load: vi.fn(),
    onRecorded: vi.fn(),
    ...overrides,
  }
  vi.mocked(useMicRecorder).mockReturnValue(mic)
  return mic
}

//$ContentRecord.content: page one is text, page two carries the author's audio.
const TWO_PAGES: $ContentBlock[][] = [
  [new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'Page one' })],
  [new $ContentBlock(ContentBlockTypes.audio,
    { title: '', fileUrl: '/uploads/audio/a.mp3', transcript: 'hi' })],
]

function mountViewer(props: Partial<{ title: string; authorName: string | null; pages: $ContentBlock[][]; initialPage: number; showQuestions: boolean; recordingContentId: number | null }> = {}) {
  return shallowMount(DocumentViewer, {
    props: { title: 'My Story', authorName: 'Jane', pages: TWO_PAGES, ...props },
  })
}

beforeEach(() => {
  vi.mocked(useMicRecorder).mockReset()
  makeMic()
  setActivePinia(createPinia())
})

describe('DocumentViewer: header', () => {

  it('renders title and author when both are present', () => {
    const wrapper = mountViewer()
    expect(wrapper.find('.document-viewer__title').text()).toBe('My Story')
    expect(wrapper.find('.document-viewer__author').text()).toBe('by Jane')
  })

  it('renders no header at all when title and author are both absent', () => {
    //A learner who deep-links into the reader has no catalogue row, so no byline.
    const wrapper = mountViewer({ title: '', authorName: null, pages: [[]] })
    expect(wrapper.find('.document-viewer__meta').exists()).toBe(false)
  })

})

describe('DocumentViewer: pagination', () => {

  it('starts on page 1 of N with that page\'s blocks passed to BlockRenderer', () => {
    const wrapper = mountViewer()
    expect(wrapper.findComponent(PageNav).props()).toMatchObject({ current: 1, total: 2 })
    expect(wrapper.findComponent(BlockRenderer).props('blocks')).toEqual(TWO_PAGES[0])
  })

  it('advances when PageNav emits "next"', async () => {
    const wrapper = mountViewer()
    await wrapper.findComponent(PageNav).vm.$emit('next')
    expect(wrapper.findComponent(PageNav).props('current')).toBe(2)
    expect(wrapper.findComponent(BlockRenderer).props('blocks')).toEqual(TWO_PAGES[1])
  })

  it('does not advance past the last page', async () => {
    const wrapper = mountViewer()
    await wrapper.findComponent(PageNav).vm.$emit('next')
    await wrapper.findComponent(PageNav).vm.$emit('next')
    expect(wrapper.findComponent(PageNav).props('current')).toBe(2)
  })

  it('does not go before the first page', async () => {
    const wrapper = mountViewer()
    await wrapper.findComponent(PageNav).vm.$emit('prev')
    expect(wrapper.findComponent(PageNav).props('current')).toBe(1)
  })

  it('ArrowRight and ArrowLeft keydown navigate pages', async () => {
    const wrapper = mountViewer()
    await wrapper.find('.document-viewer').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.findComponent(PageNav).props('current')).toBe(2)

    await wrapper.find('.document-viewer').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.findComponent(PageNav).props('current')).toBe(1)
  })

  it('an unrelated key does nothing', async () => {
    const wrapper = mountViewer()
    await wrapper.find('.document-viewer').trigger('keydown', { key: 'Enter' })
    expect(wrapper.findComponent(PageNav).props('current')).toBe(1)
  })

})

describe('DocumentViewer: the practice panel', () => {

  const TEXT_ONLY: $ContentBlock[][] = [
    [new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'Page one' })],
    [new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'Page two' })],
  ]

  it('is offered on every page, not only the first', async () => {
    const wrapper = mountViewer()
    expect(wrapper.findComponent(RecordingBar).exists()).toBe(true)
    await wrapper.findComponent(PageNav).vm.$emit('next')
    expect(wrapper.findComponent(RecordingBar).exists()).toBe(true)
  })

  it('a recording in progress carries on across page turns', async () => {
    makeMic({ isRecording: ref(true) })
    const wrapper = mountViewer()
    await wrapper.findComponent(PageNav).vm.$emit('next')
    expect(wrapper.findComponent(RecordingBar).props('isRecording')).toBe(true)
  })

  it('the example is the content\'s first Audio block, resolved against the API, playable from any page', async () => {
    const wrapper = mountViewer()
    const expected = MediaDataSource.resolveUrl('/uploads/audio/a.mp3')
    expect(wrapper.findComponent(RecordingBar).props('exampleUrl')).toBe(expected)
    await wrapper.findComponent(PageNav).vm.$emit('next')
    expect(wrapper.findComponent(RecordingBar).props('exampleUrl')).toBe(expected)
  })

  it('boundary: no Audio block, or one with no file yet, means no example', () => {
    expect(mountViewer({ pages: TEXT_ONLY }).findComponent(RecordingBar).props('exampleUrl')).toBeNull()
    const empty = [[new $ContentBlock(ContentBlockTypes.audio, { title: '', fileUrl: '', transcript: '' })]]
    expect(mountViewer({ pages: empty }).findComponent(RecordingBar).props('exampleUrl')).toBeNull()
  })

  it('hands the learner\'s recording to the panel to play back', () => {
    makeMic({ hasRecording: ref(true), recordedUrl: ref<string | null>('blob:mine') })
    const bar = mountViewer().findComponent(RecordingBar)
    expect(bar.props('hasRecording')).toBe(true)
    expect(bar.props('recordedUrl')).toBe('blob:mine')
  })

  it('forwards start/stop from the panel to the mic composable', async () => {
    const mic = makeMic()
    const wrapper = mountViewer()
    await wrapper.findComponent(RecordingBar).vm.$emit('start')
    expect(mic.start).toHaveBeenCalledOnce()
    await wrapper.findComponent(RecordingBar).vm.$emit('stop')
    expect(mic.stop).toHaveBeenCalledOnce()
  })

  it('passes mic error state through to the panel', () => {
    makeMic({ error: ref<string | null>('Microphone permission denied') })
    const wrapper = mountViewer()
    expect(wrapper.findComponent(RecordingBar).props('error')).toBe('Microphone permission denied')
  })

  it('arrow keys inside a player seek it instead of turning the page', async () => {
    const wrapper = mountViewer()
    const audio = document.createElement('audio')
    wrapper.find('.document-viewer').element.appendChild(audio)
    audio.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(PageNav).props('current')).toBe(1)
  })

})

describe('DocumentViewer: resuming and reporting the page', () => {

  it('opens at the page it is given, for a learner coming back', () => {
    const wrapper = mountViewer({ initialPage: 1 })
    expect(wrapper.findComponent(PageNav).props('current')).toBe(2)
    expect(wrapper.findComponent(BlockRenderer).props('blocks')).toEqual(TWO_PAGES[1])
  })

  it('boundary: a page past the end, or a negative one, opens at the first page', () => {
    expect(mountViewer({ initialPage: 2 }).findComponent(PageNav).props('current')).toBe(1)
    expect(mountViewer({ initialPage: -1 }).findComponent(PageNav).props('current')).toBe(1)
  })

  it('reports every page turn, 0-based, and nothing on opening', async () => {
    const wrapper = mountViewer()
    expect(wrapper.emitted('page-change')).toBeUndefined()

    await wrapper.findComponent(PageNav).vm.$emit('next')
    await wrapper.findComponent(PageNav).vm.$emit('prev')
    expect(wrapper.emitted('page-change')).toEqual([[1], [0]])
  })

  it('does not report a turn that went nowhere', async () => {
    const wrapper = mountViewer()
    await wrapper.findComponent(PageNav).vm.$emit('prev')
    expect(wrapper.emitted('page-change')).toBeUndefined()
  })

  describe('questions are answered on the test screen, not while reading', () => {
    const question = new $ContentBlock(ContentBlockTypes.multipleChoice,
      { title: 'Q', question: 'Hello?', options: ['Yebo', 'Cha'], correctOption: 0 })
    const story = new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'Page one' })

    it('nominal: a learner reading sees the story but not the question', () => {
      makeMic()
      const wrapper = mountViewer({ pages: [[story, question]] })
      expect(wrapper.findComponent(BlockRenderer).props('blocks')).toEqual([story])
    })

    it('the builder preview shows the questions too, so an author can check them', () => {
      makeMic()
      const wrapper = mountViewer({ pages: [[story, question]], showQuestions: true })
      expect(wrapper.findComponent(BlockRenderer).props('blocks')).toEqual([story, question])
    })

    it('boundary: a page of questions only says where they are instead of reading as empty', () => {
      makeMic()
      const wrapper = mountViewer({ pages: [[question]] })
      expect(wrapper.findComponent(BlockRenderer).exists()).toBe(false)
      expect(wrapper.text()).toContain('The questions on this page are in the quiz at the end.')
    })
  })

})

describe('DocumentViewer: a recording saved to the learner\'s account', () => {

  beforeEach(() => {
    vi.spyOn(RecordingDataSource, 'getMine').mockResolvedValue(new $DataSourceResponse<Blob | null>(null, null))
    vi.spyOn(RecordingDataSource, 'remove').mockResolvedValue(new $DataSourceResponse<true>(true, null))
  })

  it('in the reader, last time\'s recording is loaded and handed to the panel as saved, on any page', async () => {
    const saved = new Blob(['voice'], { type: 'audio/webm' })
    vi.mocked(RecordingDataSource.getMine).mockResolvedValue(new $DataSourceResponse<Blob | null>(saved, null))
    const mic = makeMic({ load: vi.fn(() => { mic.hasRecording.value = true; mic.recordedUrl.value = 'blob:saved' }) })
    const wrapper = mountViewer({ recordingContentId: 9 })
    await flushPromises()

    expect(RecordingDataSource.getMine).toHaveBeenCalledWith(9)
    expect(mic.load).toHaveBeenCalledWith(saved)
    expect(wrapper.findComponent(RecordingBar).props('saveStatus')).toBe('saved')

    await wrapper.findComponent(PageNav).vm.$emit('next')
    expect(wrapper.findComponent(RecordingBar).props()).toMatchObject({ recordedUrl: 'blob:saved', hasRecording: true, saveStatus: 'saved' })
  })

  it('content with no example reading: the recording is a temporary take, never fetched or uploaded', async () => {
    const mic = makeMic()
    const wrapper = mountViewer({ recordingContentId: 9, pages: [[new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'Only words' })]] })
    await flushPromises()
    expect(RecordingDataSource.getMine).not.toHaveBeenCalled()
    expect(mic.onRecorded).not.toHaveBeenCalled()
    expect(wrapper.findComponent(RecordingBar).props('saveStatus')).toBeNull()

    await wrapper.findComponent(RecordingBar).vm.$emit('delete')
    expect(mic.reset).toHaveBeenCalledOnce()
    expect(RecordingDataSource.remove).not.toHaveBeenCalled()
  })

  it('content with an example reading: each new recording is uploaded to the account', async () => {
    const mic = makeMic()
    mountViewer({ recordingContentId: 9 })
    await flushPromises()
    expect(mic.onRecorded).toHaveBeenCalledOnce()
  })

  it('"Delete recording" removes it from the account and the page', async () => {
    const mic = makeMic({ hasRecording: ref(true), recordedUrl: ref<string | null>('blob:mine') })
    const wrapper = mountViewer({ recordingContentId: 9 })
    await flushPromises()

    await wrapper.findComponent(RecordingBar).vm.$emit('delete')
    await flushPromises()
    expect(RecordingDataSource.remove).toHaveBeenCalledWith(9)
    expect(mic.reset).toHaveBeenCalledOnce()
  })

  it('the builder preview passes no content id, so nothing is fetched and the take is temporary', async () => {
    const wrapper = mountViewer({ showQuestions: true })
    await flushPromises()
    expect(RecordingDataSource.getMine).not.toHaveBeenCalled()
    expect(wrapper.findComponent(RecordingBar).props('saveStatus')).toBeNull()
  })

})
