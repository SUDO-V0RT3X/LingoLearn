import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AudioBlock from '@/features/learner_experience/presentation/components/blocks/AudioBlock.vue'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import type { $AudioBlockValue } from '@/features/shared/models/contentType'

//$AudioBlockValue as the content builder saves it: a relative upload path.
const audioValue = (over: Partial<$AudioBlockValue> = {}): $AudioBlockValue => ({
  title: 'Pronunciation', fileUrl: '/uploads/audio/example.mp3', transcript: 'Hello world', ...over,
})

describe('AudioBlock', () => {

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(MediaDataSource, 'resolveUrl').mockImplementation((fileUrl) => `http://api.test${fileUrl}`)
  })

  it('renders the audio player through the media resolver', () => {
    const wrapper = mount(AudioBlock, { props: { value: audioValue() } })
    expect(MediaDataSource.resolveUrl).toHaveBeenCalledWith('/uploads/audio/example.mp3')
    expect(wrapper.find('audio').attributes('src')).toBe('http://api.test/uploads/audio/example.mp3')
  })

  it('shows the transcript button when a transcript exists', () => {
    const wrapper = mount(AudioBlock, { props: { value: audioValue() } })
    expect(wrapper.find('button').text()).toBe('Show transcript')
  })

  it('hides the transcript initially', () => {
    const wrapper = mount(AudioBlock, { props: { value: audioValue() } })
    expect(wrapper.find('.audio-block__transcript').exists()).toBe(false)
  })

  it('shows the transcript after the button is clicked', async () => {
    const wrapper = mount(AudioBlock, { props: { value: audioValue() } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('.audio-block__transcript').text()).toBe('Hello world')
    expect(wrapper.find('button').text()).toBe('Hide transcript')
  })

  it('hides the transcript again after clicking the button twice', async () => {
    const wrapper = mount(AudioBlock, { props: { value: audioValue() } })
    const button = wrapper.find('button')
    await button.trigger('click')
    await button.trigger('click')
    expect(wrapper.find('.audio-block__transcript').exists()).toBe(false)
    expect(button.text()).toBe('Show transcript')
  })

  it('does not show a transcript button when there is no transcript', () => {
    const wrapper = mount(AudioBlock, { props: { value: audioValue({ transcript: '' }) } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

})
