import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useMicRecorder, type MicRecorder } from '@/features/learner_experience/functions/useMicRecorder'

//A stand-in for the browser's MediaRecorder: stop() hands over one chunk and fires onstop.
class FakeMediaRecorder {
  static mimeType = 'audio/mp4'
  mimeType = FakeMediaRecorder.mimeType
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

const track = { stop: vi.fn() }

function setup() {
  let mic!: MicRecorder
  const wrapper = mount(defineComponent({
    setup() {
      mic = useMicRecorder()
      return () => h('div')
    },
  }))
  return { wrapper, mic }
}

describe('useMicRecorder', () => {
  let urls = 0
  beforeEach(() => {
    urls = 0
    FakeMediaRecorder.mimeType = 'audio/mp4'
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
    })
    URL.createObjectURL = vi.fn(() => `blob:${(urls += 1)}`)
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('nominal: a finished recording keeps the browser\'s own format and is handed to every listener', async () => {
    const { mic } = setup()
    const heard: Blob[] = []
    mic.onRecorded((recording) => heard.push(recording))

    await mic.start()
    expect(mic.isRecording.value).toBe(true)
    mic.stop()

    expect(mic.hasRecording.value).toBe(true)
    expect(mic.recordedUrl.value).toBe('blob:1')
    expect(mic.recordedBlob.value?.type).toBe('audio/mp4')
    expect(heard).toEqual([mic.recordedBlob.value])
  })

  it('load makes a saved recording the current one, without calling the listeners', () => {
    const { mic } = setup()
    const listener = vi.fn()
    mic.onRecorded(listener)
    const saved = new Blob(['saved'], { type: 'audio/webm' })

    mic.load(saved)
    expect(mic.hasRecording.value).toBe(true)
    expect(mic.recordedBlob.value).toBe(saved)
    expect(mic.recordedUrl.value).toBe('blob:1')
    expect(listener).not.toHaveBeenCalled()
  })

  it('recording again replaces the loaded one and frees its URL; reset clears it all', async () => {
    const { mic } = setup()
    mic.load(new Blob(['saved'], { type: 'audio/webm' }))

    await mic.start()
    mic.stop()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(mic.recordedUrl.value).toBe('blob:2')

    mic.reset()
    expect(mic.hasRecording.value).toBe(false)
    expect(mic.recordedBlob.value).toBeNull()
    expect(mic.recordedUrl.value).toBeNull()
  })

  it('leaving the page frees the recording\'s URL and turns the microphone off', async () => {
    const { mic, wrapper } = setup()
    await mic.start()
    mic.stop()

    wrapper.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(track.stop).toHaveBeenCalled()
  })

  it('a microphone that is refused leaves an error and no recording', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(new Error('denied'))
    const { mic } = setup()
    await mic.start()

    expect(mic.isRecording.value).toBe(false)
    expect(mic.error.value).toBe('Microphone access was denied or is unavailable.')
  })
})
