import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BlockRenderer from '@/features/learner_experience/presentation/components/BlockRenderer.vue'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'

describe('BlockRenderer', () => {

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(MediaDataSource, 'resolveUrl').mockImplementation((fileUrl) => `http://api.test${fileUrl}`)
  })

  it('renders a text block', () => {
    const blocks = [new $ContentBlock(ContentBlockTypes.text,
      { title: 'Hello', text: 'This is a text block.' })]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    expect(wrapper.text()).toContain('Hello')
    expect(wrapper.text()).toContain('This is a text block.')
  })

  it('renders an image block with its resolved source', () => {
    const blocks = [new $ContentBlock(ContentBlockTypes.image,
      { title: 'Plant', fileUrl: '/uploads/images/plant.png', altText: 'A plant' })]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    expect(wrapper.find('img').attributes('src')).toBe('http://api.test/uploads/images/plant.png')
  })

  it('renders an audio block with its resolved source', () => {
    const blocks = [new $ContentBlock(ContentBlockTypes.audio,
      { title: 'Listen', fileUrl: '/uploads/audio/keeper.m4a', transcript: 'Hello' })]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    expect(wrapper.find('audio').attributes('src')).toBe('http://api.test/uploads/audio/keeper.m4a')
  })

  it('renders a multiple choice question with one choice per answer', () => {
    const blocks = [new $ContentBlock(ContentBlockTypes.multipleChoice,
      { title: 'Greetings', question: 'How do you say hello?', options: ['Hamba kahle', 'Sawubona'], correctOption: 1 })]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    expect(wrapper.text()).toContain('How do you say hello?')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('No renderer yet')
  })

  it('renders a fill in the blank question with a box for the gap', () => {
    const blocks = [new $ContentBlock(ContentBlockTypes.fillBlank,
      { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'] })]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    expect(wrapper.text()).toContain('in the morning.')
    expect(wrapper.findAll('input[type="text"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('No renderer yet')
  })

  it('renders a listen and choose question with its clip resolved', () => {
    const blocks = [new $ContentBlock(ContentBlockTypes.listenChoose,
      { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?',
        options: ['Who is that?', 'Where are you?'], correctOption: 0 })]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    expect(wrapper.find('audio').attributes('src')).toContain('/uploads/audio/knock.mp3')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)
    expect(wrapper.text()).not.toContain('No renderer yet')
  })

  it('shows a message for a block type it cannot render', () => {
    //pendingSelection is a builder-only state and should never reach a learner.
    const blocks = [new $ContentBlock(ContentBlockTypes.pendingSelection, {})]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    expect(wrapper.text()).toContain('No renderer yet for block type')
  })

  it('renders multiple blocks in the order the author placed them', () => {
    const blocks = [
      new $ContentBlock(ContentBlockTypes.text, { title: 'First', text: 'First block' }),
      new $ContentBlock(ContentBlockTypes.text, { title: 'Second', text: 'Second block' }),
    ]
    const wrapper = mount(BlockRenderer, { props: { blocks } })
    const headings = wrapper.findAll('h2')
    expect(headings[0].text()).toBe('First')
    expect(headings[1].text()).toBe('Second')
  })

})
