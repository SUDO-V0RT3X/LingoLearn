import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AudioUploadScreen from '@/features/media_feature/presentation/screens/AudioUploadScreen/AudioUploadScreen.vue'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { AudioFileInfo } from '@/features/media_feature/models/AssetType'

const clips: AudioFileInfo[] = [
  { filename: 'a.mp3', fileUrl: '/uploads/audio/a.mp3', sizeBytes: 48_000, uploadedAt: '2026-10-01T09:00:00.000Z',
    title: 'Sawubona', transcript: 'Sawubona, unjani?' },
  { filename: 'b.mp3', fileUrl: '/uploads/audio/b.mp3', sizeBytes: 12_000, uploadedAt: '2026-09-30T09:00:00.000Z',
    title: '', transcript: '' },
]

async function mountScreen() {
  const wrapper = mount(AudioUploadScreen)
  await flushPromises()
  return wrapper
}

describe('Audio library screen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('nominal: lists the author\'s clips with a player, title and transcript', async () => {
    vi.spyOn(MediaDataSource, 'listAudio').mockResolvedValue({ data: clips, error: null })
    const wrapper = await mountScreen()

    const items = wrapper.findAll('[data-testid="library-item"]')
    expect(items).toHaveLength(2)
    expect(items[0].find('[data-testid="library-item-title"]').text()).toBe('Sawubona')
    expect(items[0].find('[data-testid="library-item-transcript"]').text()).toBe('Sawubona, unjani?')
    expect(items[0].find('audio').attributes('src')).toContain('/uploads/audio/a.mp3')
    expect(items[1].text()).toContain('Untitled clip')
    expect(items[1].text()).toContain('No transcript')
    expect(wrapper.text()).toContain('2 clips')
  })

  it('has no delete control: approved content may still use a clip', async () => {
    vi.spyOn(MediaDataSource, 'listAudio').mockResolvedValue({ data: clips, error: null })
    const wrapper = await mountScreen()
    expect(wrapper.findAll('button').some((b) => /delete/i.test(b.text()))).toBe(false)
  })

  it('boundary: an author with no clips sees an empty state, not an error', async () => {
    vi.spyOn(MediaDataSource, 'listAudio').mockResolvedValue({ data: [], error: null })
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="library-empty"]').text()).toContain('No clips yet')
    expect(wrapper.find('[data-testid="library-error"]').exists()).toBe(false)
  })

  it('shows a spinner while the clips load', async () => {
    vi.spyOn(MediaDataSource, 'listAudio').mockReturnValue(new Promise(() => {}))
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="library-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="library-empty"]').exists()).toBe(false)
  })

  it('invalid: a failed load shows the reason and can be retried', async () => {
    const list = vi.spyOn(MediaDataSource, 'listAudio').mockResolvedValue({
      data: null,
      error: new Exception({ exceptionType: ExceptionType.FAILED, message: 'Server unavailable', statusCode: 500 }),
    })
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="library-error"]').text()).toContain('Server unavailable')

    list.mockResolvedValue({ data: clips, error: null })
    await wrapper.find('[data-testid="library-error"] button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="library-item"]')).toHaveLength(2)
  })

  it('uploading a clip adds it to the top of the list', async () => {
    vi.spyOn(MediaDataSource, 'listAudio').mockResolvedValue({ data: [...clips], error: null })
    const upload = vi.spyOn(MediaDataSource, 'uploadAudio').mockResolvedValue({
      data: { filename: 'c.mp3', fileUrl: '/uploads/audio/c.mp3', title: 'Ngiyabonga', transcript: 'Ngiyabonga kakhulu' },
      error: null,
    })
    const wrapper = await mountScreen()

    const input = wrapper.find('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'thanks.mp3', { type: 'audio/mpeg' })] })
    await input.trigger('change')
    await flushPromises()

    await wrapper.find('[data-testid="label-input"]').setValue('Ngiyabonga')
    await wrapper.find('[data-testid="transcript-input"]').setValue('Ngiyabonga kakhulu')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(upload).toHaveBeenCalledWith(expect.any(File), 'Ngiyabonga', 'Ngiyabonga kakhulu')
    expect(wrapper.find('[data-testid="success-banner"]').text()).toContain('Ngiyabonga')
    expect(wrapper.findAll('[data-testid="library-item-title"]')[0].text()).toBe('Ngiyabonga')
  })
})
