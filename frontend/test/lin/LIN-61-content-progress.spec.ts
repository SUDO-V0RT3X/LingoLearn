import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DocumentViewer from '@/features/learner_experience/presentation/components/DocumentViewer.vue'
import { ContentBlockTypes } from '@/features/shared/models/contentType'

vi.mock('@/features/auth_feature/state/authStore', () => ({
  authStore: () => ({
    currentUser: { id: 4 },
  }),
}))

vi.mock('@/features/learner_experience/functions/useMicRecorder', () => ({
  useMicRecorder: () => ({
    isRecording: { value: false },
    hasRecording: { value: false },
    recordedUrl: { value: null },
    error: { value: null },
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

describe('LIN-61 — Per-page progress and content history', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves the learner’s current page', async () => {
    const pages = [
      [{ itemType: ContentBlockTypes.text, value: { title: 'Page 1', text: 'First page' } }],
      [{ itemType: ContentBlockTypes.text, value: { title: 'Page 2', text: 'Second page' } }],
    ]

    const wrapper = mount(DocumentViewer, {
      props: {
        title: 'Test Story',
        pages,
      },
      global: {
        stubs: {
          BlockRenderer: true,
          RecordingBar: true,
          ComparisonBar: true,
          PageNav: {
            props: ['current', 'total'],
            emits: ['next'],
            template: '<button @click="$emit(\'next\')">{{ current }} / {{ total }}</button>',
          },
        },
      },
    })

    await wrapper.find('button').trigger('click')

    //The reader saves the page on the server whenever the viewer reports a turn.
    expect(wrapper.emitted('page-change')).toEqual([[1]])
  })

  it('starts new content on the first page', () => {
    const pages = [
      [{ itemType: ContentBlockTypes.text, value: { title: 'Page 1', text: 'First page' } }],
      [{ itemType: ContentBlockTypes.text, value: { title: 'Page 2', text: 'Second page' } }],
    ]

    const wrapper = mount(DocumentViewer, {
      props: {
        title: 'Test Story',
        pages,
      },
      global: {
        stubs: {
          BlockRenderer: true,
          RecordingBar: true,
          ComparisonBar: true,
          PageNav: {
            props: ['current', 'total'],
            template: '<div>{{ current }} / {{ total }}</div>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('1 / 2')
  })

  it('reopens at the page the learner left off on', () => {
    const pages = [
      [{ itemType: ContentBlockTypes.text, value: { title: 'Page 1', text: 'First page' } }],
      [{ itemType: ContentBlockTypes.text, value: { title: 'Page 2', text: 'Second page' } }],
    ]

    const wrapper = mount(DocumentViewer, {
      props: { title: 'Test Story', pages, initialPage: 1 },
      global: {
        stubs: {
          BlockRenderer: true,
          RecordingBar: true,
          ComparisonBar: true,
          PageNav: { props: ['current', 'total'], template: '<div>{{ current }} / {{ total }}</div>' },
        },
      },
    })

    expect(wrapper.text()).toContain('2 / 2')
  })
})
