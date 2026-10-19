import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TextBlock from '@/features/learner_experience/presentation/components/blocks/TextBlock.vue'
import type { $TextBlockValue } from '@/features/shared/models/contentType'

//$TextBlockValue as the content builder saves it.
const textValue = (over: Partial<$TextBlockValue> = {}): $TextBlockValue => ({
  title: 'Plants', text: 'Plants need water to grow.', ...over,
})

describe('TextBlock', () => {

  it('displays the title and text', () => {
    const wrapper = mount(TextBlock, { props: { value: textValue() } })
    expect(wrapper.find('h2').text()).toBe('Plants')
    expect(wrapper.find('p').text()).toBe('Plants need water to grow.')
  })

  it('does not display the title when the title is empty', () => {
    const wrapper = mount(TextBlock, { props: { value: textValue({ title: '' }) } })
    expect(wrapper.find('h2').exists()).toBe(false)
    expect(wrapper.find('p').text()).toBe('Plants need water to grow.')
  })

  it('does not display the body when the text is empty', () => {
    const wrapper = mount(TextBlock, { props: { value: textValue({ text: '' }) } })
    expect(wrapper.find('h2').text()).toBe('Plants')
    expect(wrapper.find('p').exists()).toBe(false)
  })

})
