import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ImageBlock from '@/features/learner_experience/presentation/components/blocks/ImageBlock.vue'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import type { $ImageBlockValue } from '@/features/shared/models/contentType'

//$ImageBlockValue as the content builder saves it: a relative upload path.
const imageValue = (over: Partial<$ImageBlockValue> = {}): $ImageBlockValue => ({
  title: 'A plant', fileUrl: '/uploads/images/plant.png', altText: 'A green plant', ...over,
})

describe('ImageBlock', () => {

  beforeEach(() => {
    vi.restoreAllMocks()
    //The stored path is relative, so the block has to put the API origin back.
    vi.spyOn(MediaDataSource, 'resolveUrl').mockImplementation((fileUrl) => `http://api.test${fileUrl}`)
  })

  it('renders the image through the media resolver with its alt text', () => {
    const wrapper = mount(ImageBlock, { props: { value: imageValue() } })
    const image = wrapper.find('img')
    expect(MediaDataSource.resolveUrl).toHaveBeenCalledWith('/uploads/images/plant.png')
    expect(image.attributes('src')).toBe('http://api.test/uploads/images/plant.png')
    expect(image.attributes('alt')).toBe('A green plant')
  })

  it('displays the title when provided', () => {
    const wrapper = mount(ImageBlock, { props: { value: imageValue() } })
    expect(wrapper.find('h3').text()).toBe('A plant')
  })

  it('does not display the title when it is empty', () => {
    const wrapper = mount(ImageBlock, { props: { value: imageValue({ title: '' }) } })
    expect(wrapper.find('h3').exists()).toBe(false)
  })

  it('renders no image at all when the block has no file yet', () => {
    const wrapper = mount(ImageBlock, { props: { value: imageValue({ fileUrl: '' }) } })
    expect(wrapper.find('img').exists()).toBe(false)
  })

})
