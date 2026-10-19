import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RecordingBar from '@/features/learner_experience/presentation/components/RecordingBar.vue'
import type { RecordingSaveStatus } from '@/features/learner_experience/functions/useSavedRecording'
import { themeStore } from '@/features/shared/state/themeStore'
import { i18n } from '@/i18n'

type BarProps = Partial<{
  isRecording: boolean;
  hasRecording: boolean;
  recordedUrl: string | null;
  error: string | null;
  saveStatus: RecordingSaveStatus | null;
  exampleUrl: string | null;
}>

const EXAMPLE = 'http://localhost:4001/uploads/audio/example.mp3'

const mounted: VueWrapper[] = []
function mountBar(props: BarProps = {}) {
  const wrapper = mount(RecordingBar, {
    props: { isRecording: false, hasRecording: false, error: null, ...props },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

//With an example: the full listen, record, listen back, compare flow.
const withExample = (props: BarProps = {}) => mountBar({ exampleUrl: EXAMPLE, ...props })
//A finished recording the learner can play back.
const recorded = { hasRecording: true, recordedUrl: 'blob:mine' }

const stepTitles = (wrapper: VueWrapper) => wrapper.findAll('.recording-bar__step-title').map((title) => title.text())
const step = (wrapper: VueWrapper, key: string) => wrapper.find(`[data-step="${key}"]`)
const currentStep = (wrapper: VueWrapper) => wrapper.find('[aria-current="step"]').attributes('data-step')
const label = (wrapper: VueWrapper, testId: string) => wrapper.find(`[data-testid="${testId}"] .comparison-bar__label`).text()
const status = (wrapper: VueWrapper) => wrapper.find('[data-testid="practice-status"]').text()

//jsdom has no media playback: play() and pause() flip `paused` and fire the
//events a browser would, so the panel's own listeners run.
function setPaused(audio: HTMLMediaElement, paused: boolean) {
  Object.defineProperty(audio, 'paused', { configurable: true, value: paused })
}

beforeEach(() => {
  setActivePinia(createPinia())
  setPaused(HTMLMediaElement.prototype as HTMLMediaElement, true)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    setPaused(this, false)
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    setPaused(this, true)
    this.dispatchEvent(new Event('pause'))
  })
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('RecordingBar: with an example reading', () => {

  it('nominal: four steps in order, and step 1 plays the example right there', () => {
    const wrapper = withExample()
    expect(stepTitles(wrapper)).toEqual([
      'Listen to the example', 'Read aloud and record', 'Listen to your recording', 'Compare with the example',
    ])
    expect(wrapper.find('[data-testid="example-player"]').attributes('src')).toBe(EXAMPLE)
    expect(wrapper.find('[data-testid="example-player"]').attributes('aria-label')).toBe('The example reading')
    expect(currentStep(wrapper)).toBe('listenExample')
  })

  it('listening to the example ticks step 1 off and makes recording the next step', async () => {
    const wrapper = withExample()
    await wrapper.find('[data-testid="example-player"]').trigger('play')
    expect(step(wrapper, 'listenExample').classes()).toContain('recording-bar__step--done')
    expect(step(wrapper, 'listenExample').text()).toContain('(Done)')
    expect(currentStep(wrapper)).toBe('record')
  })

  it('Start recording asks to start, and stops the example so it is not recorded too', async () => {
    const wrapper = withExample()
    const example = wrapper.find('[data-testid="example-player"]').element as HTMLAudioElement
    example.play()
    await wrapper.find('[data-testid="start-recording"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
    expect(example.paused).toBe(true)
  })

  it('before a recording, the learner\'s player is a placeholder and compare asks them to record first', () => {
    const wrapper = withExample()
    expect(wrapper.find('[data-testid="my-player"]').exists()).toBe(false)
    expect(step(wrapper, 'listenMine').text()).toContain('Your recording will appear here when you stop.')
    expect(step(wrapper, 'compare').text()).toContain('Record yourself first, then compare.')
    expect(wrapper.find('[data-testid="compare-example"]').exists()).toBe(false)
  })

  it('after recording: the learner\'s clip plays in step 3, and Record again replaces it', async () => {
    const wrapper = withExample(recorded)
    const mine = wrapper.find('[data-testid="my-player"]')
    expect(mine.attributes('src')).toBe('blob:mine')
    expect(mine.attributes('aria-label')).toBe('Your recording')
    expect(wrapper.find('[data-testid="try-again"]').exists()).toBe(false)

    await wrapper.find('[data-testid="record-again"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('compare: each button plays its clip from the start, one at a time, and pauses it when pressed again', async () => {
    const wrapper = withExample(recorded)
    const example = wrapper.find('[data-testid="example-player"]').element as HTMLAudioElement
    const mine = wrapper.find('[data-testid="my-player"]').element as HTMLAudioElement

    await wrapper.find('[data-testid="compare-example"]').trigger('click')
    expect(example.paused).toBe(false)
    expect(label(wrapper, 'compare-example')).toBe('Pause')
    expect(label(wrapper, 'compare-mine')).toBe('Play mine')

    await wrapper.find('[data-testid="compare-mine"]').trigger('click')
    expect(mine.paused).toBe(false)
    expect(example.paused).toBe(true)
    expect(label(wrapper, 'compare-example')).toBe('Play the example')

    await wrapper.find('[data-testid="compare-mine"]').trigger('click')
    expect(mine.paused).toBe(true)
    expect(label(wrapper, 'compare-mine')).toBe('Play mine')
    expect(step(wrapper, 'compare').classes()).toContain('recording-bar__step--done')
  })

  it('every step done: each one is ticked and none is highlighted', async () => {
    const wrapper = withExample(recorded)
    await wrapper.find('[data-testid="example-player"]').trigger('play')
    await wrapper.find('[data-testid="my-player"]').trigger('play')
    await wrapper.find('[data-testid="compare-example"]').trigger('click')
    await wrapper.find('[data-testid="compare-mine"]').trigger('click')
    expect(wrapper.findAll('.recording-bar__step--done')).toHaveLength(4)
    expect(wrapper.find('[aria-current="step"]').exists()).toBe(false)
  })

})

describe('RecordingBar: without an example reading (a temporary take)', () => {

  it('nominal: three steps, and says up front the recording only lasts until they leave', () => {
    const wrapper = mountBar()
    expect(stepTitles(wrapper)).toEqual([
      'Read aloud and record', 'Listen to your recording', 'Try reading again if you want to improve',
    ])
    expect(wrapper.find('[data-testid="example-player"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('There’s no example reading for this one.')
    expect(wrapper.text()).toContain('kept until you leave this page')
    expect(currentStep(wrapper)).toBe('record')
  })

  it('after recording: plays it back, says it is temporary, and Try again records a new take', async () => {
    const wrapper = mountBar(recorded)
    expect(wrapper.find('[data-testid="my-player"]').attributes('src')).toBe('blob:mine')
    expect(status(wrapper)).toBe('Kept until you leave this page — it isn’t saved to your account.')
    expect(wrapper.find('[data-testid="record-again"]').exists()).toBe(false)

    await wrapper.find('[data-testid="try-again"]').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('listening back ticks step 2 off; Try again is then the next step', async () => {
    const wrapper = mountBar(recorded)
    await wrapper.find('[data-testid="my-player"]').trigger('play')
    expect(step(wrapper, 'listenMine').classes()).toContain('recording-bar__step--done')
    expect(currentStep(wrapper)).toBe('tryAgain')
  })

  it('provides a prominent Play button to play and pause the recording', async () => {
    const wrapper = mountBar(recorded)
    const playBtn = wrapper.find('[data-testid="play-mine"]')
    expect(playBtn.exists()).toBe(true)
    expect(playBtn.text()).toContain('Play mine')

    await playBtn.trigger('click')
    expect(playBtn.text()).toContain('Pause')

    await playBtn.trigger('click')
    expect(playBtn.text()).toContain('Play mine')
  })

  it('delete clears the temporary take', async () => {
    const wrapper = mountBar(recorded)
    await wrapper.find('[data-testid="delete-recording"]').trigger('click')
    expect(wrapper.emitted('delete')).toHaveLength(1)
  })

})

describe('RecordingBar: recording, and the take popping up', () => {

  it('while recording: a Stop button with a running timer, announced politely', async () => {
    vi.useFakeTimers()
    const wrapper = withExample({ isRecording: true })
    expect(currentStep(wrapper)).toBe('record')
    expect(step(wrapper, 'record').text()).toContain('Recording 0:00')
    expect(status(wrapper)).toBe('Recording. Read aloud, then press Stop recording.')
    expect(wrapper.find('[data-testid="practice-status"]').attributes('role')).toBe('status')

    vi.advanceTimersByTime(65_000)
    await wrapper.vm.$nextTick()
    expect(step(wrapper, 'record').text()).toContain('Recording 1:05')

    await wrapper.find('[data-testid="stop-recording"]').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
    expect(wrapper.find('[data-testid="delete-recording"]').exists()).toBe(false)
  })

  it('a just-finished recording pops up: the panel opens, scrolls to the player and focuses it', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const wrapper = withExample({ isRecording: true })
    await wrapper.find('[data-testid="practice-toggle"]').trigger('click')
    expect(wrapper.find('.recording-bar__body').isVisible()).toBe(false)

    //Stop first; the browser hands over the clip a moment later.
    await wrapper.setProps({ isRecording: false })
    await wrapper.setProps({ hasRecording: true, recordedUrl: 'blob:take-1' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.recording-bar__body').isVisible()).toBe(true)
    expect(wrapper.find('[data-testid="practice-toggle"]').attributes('aria-expanded')).toBe('true')
    const mine = wrapper.find('[data-testid="my-player"]')
    expect(mine.attributes('src')).toBe('blob:take-1')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(focus.mock.contexts).toContain(mine.element)
    expect(step(wrapper, 'listenMine').classes()).toContain('recording-bar__step--flash')
    expect(currentStep(wrapper)).toBe('listenMine')
  })

  it('a recording loaded from the account on opening is shown quietly, without stealing focus', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const wrapper = withExample({ saveStatus: 'loading' })
    await wrapper.setProps({ ...recorded, saveStatus: 'saved' })
    expect(wrapper.find('[data-testid="my-player"]').exists()).toBe(true)
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
  })

  it('a new take starts its own playback steps afresh', async () => {
    const wrapper = withExample({ ...recorded, isRecording: false })
    await wrapper.find('[data-testid="my-player"]').trigger('play')
    expect(step(wrapper, 'listenMine').classes()).toContain('recording-bar__step--done')

    await wrapper.setProps({ isRecording: true })
    await wrapper.setProps({ isRecording: false, recordedUrl: 'blob:take-2' })
    expect(step(wrapper, 'listenMine').classes()).not.toContain('recording-bar__step--done')
  })

  it('folded away while recording, the header still shows the timer and a Stop button', async () => {
    const wrapper = mountBar({ isRecording: true })
    const toggle = wrapper.find('[data-testid="practice-toggle"]')
    expect(toggle.text()).toBe('Hide practice')
    expect(toggle.attributes('aria-controls')).toBe(wrapper.find('.recording-bar__body').attributes('id'))

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toBe('Show practice')
    await wrapper.find('[data-testid="stop-recording-compact"]').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('the microphone error is an alert by the record button, and comes before any saved line', () => {
    const wrapper = withExample({ ...recorded, saveStatus: 'saved', error: 'Microphone access was denied or is unavailable.' })
    expect(step(wrapper, 'record').find('[role="alert"]').text()).toBe('Microphone access was denied or is unavailable.')
    expect(wrapper.text()).not.toContain('Saved to your account')
  })

})

describe('RecordingBar: kept on the learner\'s account', () => {

  it('nominal: a saved recording says so, with Record again and Delete recording', () => {
    const wrapper = withExample({ ...recorded, saveStatus: 'saved' })
    expect(wrapper.text()).toContain('Record again')
    expect(status(wrapper)).toBe('Saved to your account — it’ll be here next time.')
    expect(wrapper.text()).not.toContain('until you leave')
    expect(wrapper.find('[data-testid="delete-recording"]').text()).toBe('Delete recording')
  })

  it('a child is told in their own words, with a child-sized panel', () => {
    themeStore().setAudience('child')
    const wrapper = withExample({ ...recorded, saveStatus: 'saved' })
    expect(wrapper.text()).toContain('Read it out loud!')
    expect(wrapper.text()).toContain('Saved! Come back any time')
    expect(wrapper.find('.recording-bar').classes()).toContain('recording-bar--child')
    themeStore().setAudience('general')
  })

  it('isiZulu: the steps, the saved line and the delete button are translated', () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = withExample({ ...recorded, saveStatus: 'saved' })
    expect(stepTitles(wrapper)).toEqual([
      'Lalela isibonelo', 'Funda ngokuzwakalayo uqophe (Kwenziwe)', 'Lalela ukuqopha kwakho', 'Qhathanisa nesibonelo',
    ])
    expect(wrapper.text()).toContain('Kugcinwe ku-akhawunti yakho')
    expect(wrapper.find('[data-testid="delete-recording"]').text()).toBe('Susa ukuqopha')
    expect(label(wrapper, 'compare-mine')).toBe('Dlala okwami')
  })

  it('isiZulu without an example: the temporary note is translated', () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = mountBar(recorded)
    expect(status(wrapper)).toBe('Kugcinwa kuze kube yilapho ushiya leli khasi — akugcinwa ku-akhawunti yakho.')
    expect(wrapper.find('[data-testid="try-again"]').text()).toBe('Zama futhi')
  })

  it('shows loading and saving, and a failed save as an alert while the clip still plays', () => {
    expect(status(withExample({ saveStatus: 'loading' }))).toBe('Loading your saved recording…')
    expect(status(withExample({ ...recorded, saveStatus: 'saving' }))).toBe('Saving your recording…')
    const failed = withExample({ ...recorded, saveStatus: 'saveFailed' })
    expect(failed.find('.recording-bar__footer [role="alert"]').text()).toContain('We couldn’t save this recording to your account')
    expect(failed.find('[data-testid="my-player"]').exists()).toBe(true)
  })

  it('a saved recording that cannot be fetched, or deleted, says so', () => {
    expect(withExample({ saveStatus: 'loadFailed' }).find('[role="alert"]').text()).toContain('We couldn’t load your saved recording')
    expect(withExample({ ...recorded, saveStatus: 'deleteFailed' }).find('[role="alert"]').text()).toContain('We couldn’t delete your recording')
  })

  it('delete emits once, and is not offered while recording or before there is a recording', async () => {
    const wrapper = withExample({ ...recorded, saveStatus: 'saved' })
    await wrapper.find('[data-testid="delete-recording"]').trigger('click')
    expect(wrapper.emitted('delete')).toHaveLength(1)

    expect(withExample({ ...recorded, isRecording: true, saveStatus: 'saved' }).find('[data-testid="delete-recording"]').exists()).toBe(false)
    expect(withExample({ saveStatus: 'unsaved' }).find('[data-testid="delete-recording"]').exists()).toBe(false)
  })

  it('delete is disabled while a save or delete is under way', () => {
    expect(withExample({ ...recorded, saveStatus: 'saving' }).find('[data-testid="delete-recording"]').attributes('disabled')).toBeDefined()
    expect(withExample({ ...recorded, saveStatus: 'deleting' }).find('[data-testid="delete-recording"]').attributes('disabled')).toBeDefined()
  })

  it('the builder preview (nothing kept on an account) with an example still says the take is temporary', () => {
    expect(status(withExample({ ...recorded, saveStatus: null }))).toContain('Kept until you leave this page')
  })

})
