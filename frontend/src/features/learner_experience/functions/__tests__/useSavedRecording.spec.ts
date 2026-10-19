import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { RecordingDataSource } from '@/features/learner_experience/datasources/recordingDataSource'
import { useSavedRecording, type SavedRecording } from '@/features/learner_experience/functions/useSavedRecording'
import type { MicRecorder } from '@/features/learner_experience/functions/useMicRecorder'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'

const failure = (statusCode = 500) =>
  new Exception({ exceptionType: ExceptionType.FAILED, message: 'nope', statusCode })

const SAVED = { contentId: 7, mimeType: 'audio/webm' as const, sizeBytes: 4, updatedAt: '2026-10-17T10:00:00.000Z' }

//A recorder whose "finished recording" the test fires itself.
function fakeMic() {
  let finished: ((recording: Blob) => void) | null = null
  const mic: MicRecorder = {
    isRecording: ref(false),
    hasRecording: ref(false),
    recordedUrl: ref<string | null>(null),
    recordedBlob: ref<Blob | null>(null),
    error: ref<string | null>(null),
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(() => { mic.hasRecording.value = false; mic.recordedBlob.value = null }),
    load: vi.fn((recording: Blob) => { mic.hasRecording.value = true; mic.recordedBlob.value = recording }),
    onRecorded: vi.fn((callback: (recording: Blob) => void) => { finished = callback }),
  }
  return { mic, finishRecording: (recording: Blob) => finished?.(recording) }
}

//Runs the composable inside a component, so its mount and unmount hooks fire.
function setup(contentId: number | null, mic: MicRecorder) {
  let saved!: SavedRecording
  const wrapper = mount(defineComponent({
    setup() {
      saved = useSavedRecording(contentId, mic)
      return () => h('div')
    },
  }))
  return { wrapper, saved }
}

const webm = () => new Blob(['voice'], { type: 'audio/webm;codecs=opus' })

describe('useSavedRecording', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(RecordingDataSource, 'getMine').mockResolvedValue(new $DataSourceResponse<Blob | null>(null, null))
    vi.spyOn(RecordingDataSource, 'save').mockResolvedValue(new $DataSourceResponse(SAVED, null))
    vi.spyOn(RecordingDataSource, 'remove').mockResolvedValue(new $DataSourceResponse<true>(true, null))
  })

  it('nominal: loads the recording saved last time, as if just recorded', async () => {
    const saved = webm()
    vi.mocked(RecordingDataSource.getMine).mockResolvedValue(new $DataSourceResponse<Blob | null>(saved, null))
    const { mic } = fakeMic()

    const { saved: state } = setup(7, mic)
    expect(state.status.value).toBe('loading')
    await flushPromises()

    expect(RecordingDataSource.getMine).toHaveBeenCalledWith(7)
    expect(mic.load).toHaveBeenCalledWith(saved)
    expect(state.status.value).toBe('saved')
  })

  it('nothing saved yet: no recording is loaded', async () => {
    const { mic } = fakeMic()
    const { saved } = setup(7, mic)
    await flushPromises()

    expect(mic.load).not.toHaveBeenCalled()
    expect(saved.status.value).toBe('unsaved')
  })

  it('uploads each new recording once it is finished, then says it is saved', async () => {
    const { mic, finishRecording } = fakeMic()
    const { saved } = setup(7, mic)
    await flushPromises()

    const recording = webm()
    finishRecording(recording)
    expect(saved.status.value).toBe('saving')
    await flushPromises()

    expect(RecordingDataSource.save).toHaveBeenCalledWith(7, recording)
    expect(saved.status.value).toBe('saved')
  })

  it('a failed save keeps the recording on the page and says so', async () => {
    vi.mocked(RecordingDataSource.save).mockResolvedValue(new $DataSourceResponse<typeof SAVED>(null, failure()))
    const { mic, finishRecording } = fakeMic()
    const { saved } = setup(7, mic)
    await flushPromises()

    finishRecording(webm())
    await flushPromises()

    expect(saved.status.value).toBe('saveFailed')
    expect(mic.reset).not.toHaveBeenCalled()
  })

  it('a saved recording that cannot be fetched is mentioned, never in the way', async () => {
    vi.mocked(RecordingDataSource.getMine).mockResolvedValue(new $DataSourceResponse<Blob | null>(null, failure()))
    const { mic } = fakeMic()
    const { saved } = setup(7, mic)
    await flushPromises()

    expect(saved.status.value).toBe('loadFailed')
    expect(mic.load).not.toHaveBeenCalled()
  })

  it('delete removes it from the account and from the page', async () => {
    vi.mocked(RecordingDataSource.getMine).mockResolvedValue(new $DataSourceResponse<Blob | null>(webm(), null))
    const { mic } = fakeMic()
    const { saved } = setup(7, mic)
    await flushPromises()

    const removing = saved.remove()
    expect(saved.status.value).toBe('deleting')
    await removing

    expect(RecordingDataSource.remove).toHaveBeenCalledWith(7)
    expect(mic.reset).toHaveBeenCalledOnce()
    expect(saved.status.value).toBe('unsaved')
  })

  it('a failed delete keeps the recording and says so', async () => {
    vi.mocked(RecordingDataSource.remove).mockResolvedValue(new $DataSourceResponse<true>(null, failure()))
    vi.mocked(RecordingDataSource.getMine).mockResolvedValue(new $DataSourceResponse<Blob | null>(webm(), null))
    const { mic } = fakeMic()
    const { saved } = setup(7, mic)
    await flushPromises()

    await saved.remove()
    expect(mic.reset).not.toHaveBeenCalled()
    expect(saved.status.value).toBe('deleteFailed')
  })

  it('a new recording made while the old one is still loading is not overwritten by it', async () => {
    let answer!: (response: $DataSourceResponse<Blob | null>) => void
    vi.mocked(RecordingDataSource.getMine).mockReturnValue(new Promise((resolve) => { answer = resolve }))
    const { mic, finishRecording } = fakeMic()
    const { saved } = setup(7, mic)

    finishRecording(webm())
    await flushPromises()
    answer(new $DataSourceResponse<Blob | null>(webm(), null))
    await flushPromises()

    expect(mic.load).not.toHaveBeenCalled()
    expect(saved.status.value).toBe('saved')
  })

  it('without a content id (the builder preview) nothing is fetched or saved, and delete only clears the page', async () => {
    const { mic } = fakeMic()
    const { saved } = setup(null, mic)
    await flushPromises()

    expect(saved.status.value).toBeNull()
    expect(mic.onRecorded).not.toHaveBeenCalled()
    expect(RecordingDataSource.getMine).not.toHaveBeenCalled()

    await saved.remove()
    expect(mic.reset).toHaveBeenCalledOnce()
    expect(RecordingDataSource.remove).not.toHaveBeenCalled()
  })

  it('an answer arriving after the viewer has closed changes nothing', async () => {
    let answer!: (response: $DataSourceResponse<Blob | null>) => void
    vi.mocked(RecordingDataSource.getMine).mockReturnValue(new Promise((resolve) => { answer = resolve }))
    const { mic } = fakeMic()
    const { wrapper } = setup(7, mic)

    wrapper.unmount()
    answer(new $DataSourceResponse<Blob | null>(webm(), null))
    await flushPromises()
    expect(mic.load).not.toHaveBeenCalled()
  })
})
