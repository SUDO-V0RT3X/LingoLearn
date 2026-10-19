import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AuthorDashboardScreen from '@/features/media_feature/presentation/screens/AuthorDashboardScreen/AuthorDashboardScreen.vue'
import { authorDashboardScreenStore } from '@/features/media_feature/state/authorDashboardScreenStore'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { $ContentSummary } from '@/features/shared/models/contentType'

//What the server returns for this author: one row of each status.
const summary = (over: Partial<$ContentSummary> = {}): $ContentSummary => ({
  contentId: 1, authorId: 3, authorName: 'Ana Author', title: 'Greetings', language: 'english',
  childFriendly: true, status: 'draft', version: 0, level: 2, chosenTags: [], kind: 'story',
  updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: null, ...over,
})

const authorContent = [
  summary({ contentId: 1, status: 'draft', title: 'Greetings' }),
  summary({ contentId: 2, status: 'pending', title: 'Numbers' }),
  summary({ contentId: 3, status: 'approved', title: 'Food' }),
  summary({ contentId: 4, status: 'rejected', title: 'Weather words' }),
]

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/content-builder', name: 'contentBuilder', component: { template: '<div />' } },
      { path: '/content-builder/:contentId', name: 'contentBuilderDraft', component: { template: '<div />' } },
    ],
  })
}

describe('AuthorDashboardScreen', () => {
  let router: ReturnType<typeof makeRouter>

  beforeEach(() => {
    setActivePinia(createPinia())
    router = makeRouter()
    vi.restoreAllMocks()
    vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(new $DataSourceResponse(authorContent, null))
    vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(new $DataSourceResponse([], null))
  })

  async function mountScreen() {
    const wrapper = mount(AuthorDashboardScreen, { global: { plugins: [router] } })
    await router.isReady()
    await flushPromises()
    return wrapper
  }

  it('lists the author\'s own content in the table by default', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.findAll('[data-testid="content-row"]').length).toBe(authorContent.length)
    expect(wrapper.text()).toContain('Greetings')
  })

  it('clicking "+ New content" navigates to /content-builder with no id', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="new-content"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/content-builder')
    expect(router.currentRoute.value.query.id).toBeUndefined()
  })

  it('clicking a row action opens that draft in the builder', async () => {
    const wrapper = await mountScreen()
    const store = authorDashboardScreenStore()
    const firstItem = store.items[0]
    await wrapper.get('[data-testid="content-row"] [data-testid="row-action"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(`/content-builder/${firstItem.id}`)
  })

  it('approved and pending rows show "View"; draft and rejected rows show "Edit"', async () => {
    const wrapper = await mountScreen()
    const store = authorDashboardScreenStore()
    const rows = wrapper.findAll('[data-testid="content-row"]')
    store.items.forEach((item, i) => {
      const expectedLabel = item.status === 'draft' || item.status === 'rejected' ? 'Edit' : 'View'
      expect(rows[i].get('[data-testid="row-action"]').text()).toBe(expectedLabel)
    })
  })

  it('starts on the "My Content" tab, without the rejected notice visible there', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="content-tab"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="feedback-tab"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="rejected-notice"]').exists()).toBe(false)
  })

  it('switching to the Feedback tab shows every rejected item and hides the table', async () => {
    const wrapper = await mountScreen()
    const store = authorDashboardScreenStore()
    await wrapper.get('[data-testid="tab-feedback"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="content-tab"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feedback-tab"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="rejected-notice"]').length).toBe(store.rejectedItems.length)
  })

  it('switching back to "My Content" restores the table and hides feedback', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="tab-feedback"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="tab-content"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="content-tab"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="feedback-tab"]').exists()).toBe(false)
  })

  it('marks the selected tab for assistive technology', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.get('[data-testid="tab-content"]').attributes('aria-selected')).toBe('true')
    await wrapper.get('[data-testid="tab-feedback"]').trigger('click')
    expect(wrapper.get('[data-testid="tab-feedback"]').attributes('aria-selected')).toBe('true')
  })

  it('boundary: an author with no content sees an empty state with a way to start', async () => {
    vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(new $DataSourceResponse([], null))
    const wrapper = await mountScreen()
    expect(wrapper.find('[data-testid="empty"]').text()).toContain('Nothing written yet')
    expect(wrapper.find('[data-testid="content-table"]').exists()).toBe(false)
  })

  it('a filter that matches nothing says so, and can be cleared', async () => {
    vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(
      new $DataSourceResponse([summary({ status: 'draft' })], null))
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="filter-pill-approved"]').trigger('click')
    expect(wrapper.find('[data-testid="filter-empty"]').exists()).toBe(true)
    await wrapper.get('[data-testid="filter-empty"] button').trigger('click')
    expect(wrapper.findAll('[data-testid="content-row"]').length).toBe(1)
  })

  it('invalid: a failed load shows the error and can be retried', async () => {
    const getMine = vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(
      new $DataSourceResponse<$ContentSummary[]>(null, new Exception({
        exceptionType: ExceptionType.FAILED, message: 'Failed to load your content. Please try again.', statusCode: 500 })))
    const wrapper = await mountScreen()
    expect(wrapper.get('[data-testid="error"]').text()).toContain('Failed to load your content')

    getMine.mockResolvedValue(new $DataSourceResponse(authorContent, null))
    await wrapper.get('[data-testid="error"] button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="content-row"]').length).toBe(authorContent.length)
  })

  it('shows each row\'s language, and the type as a badge', async () => {
    const wrapper = await mountScreen()
    const first = wrapper.findAll('[data-testid="content-row"]')[0]
    expect(first.text()).toContain('English')
    expect(first.text()).toContain('Child-friendly')
    expect(first.text()).toContain('Lesson')
  })
})