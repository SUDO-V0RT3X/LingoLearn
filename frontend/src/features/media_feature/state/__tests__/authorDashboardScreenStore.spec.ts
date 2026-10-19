import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { authorDashboardScreenStore } from '../authorDashboardScreenStore'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { $ContentSummary } from '@/features/shared/models/contentType'
import type { AuthorFeedbackRow } from '@/features/review_detail_feature/models/ReviewDetailTypes'

//One row as getMyContent returns it.
const summary = (over: Partial<$ContentSummary> = {}): $ContentSummary => ({
  contentId: 1, authorId: 3, authorName: 'Ana Author', title: 'Greetings', language: 'english',
  childFriendly: true, status: 'draft', version: 0, level: 2, chosenTags: [], kind: 'story',
  updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: null, ...over,
})

const feedback = (over: Partial<AuthorFeedbackRow> = {}): AuthorFeedbackRow => ({
  contentId: 4, title: 'Weather words', decision: 'rejected', reason: 'Add a transcript.',
  moderator: 'Mo Moderator', decidedAt: '2026-09-16T10:00:00.000Z', ...over,
})

//The author's own content: one of each status, so the filters have something to do.
const authorContent = [
  summary({ contentId: 1, status: 'draft', title: 'Greetings' }),
  summary({ contentId: 2, status: 'pending', title: 'Numbers', submittedAt: '2026-09-15T08:00:00.000Z' }),
  summary({ contentId: 3, status: 'approved', title: 'Food', kind: 'quiz' }),
  summary({ contentId: 4, status: 'rejected', title: 'Weather words', updatedAt: '2026-09-16T11:00:00.000Z' }),
  summary({ contentId: 5, status: 'rejected', title: 'Directions', updatedAt: '2026-09-14T11:00:00.000Z' }),
]

function mockApi(content = authorContent, decisions = [feedback()]) {
  vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(new $DataSourceResponse(content, null))
  vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(new $DataSourceResponse(decisions, null))
}

describe('authorDashboardScreenStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    mockApi()
  })

  it('starts empty and not loading', () => {
    const store = authorDashboardScreenStore()
    expect(store.items).toEqual([])
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('load() takes the author\'s own content from the server', async () => {
    const store = authorDashboardScreenStore()
    await store.load()
    expect(store.items.length).toBe(authorContent.length)
    expect(store.items[0]).toMatchObject({ id: 1, title: 'Greetings', status: 'draft', type: 'lesson', level: 2 })
  })

  it('a quiz is shown as a test, and an untitled draft still has a name', async () => {
    mockApi([summary({ contentId: 9, kind: 'quiz', title: '' })])
    const store = authorDashboardScreenStore()
    await store.load()
    expect(store.items[0]).toMatchObject({ type: 'test', title: 'Untitled draft' })
  })

  it('folds the moderator\'s latest decision into the rejected row', async () => {
    const store = authorDashboardScreenStore()
    await store.load()
    const rejected = store.items.find((item) => item.id === 4)
    expect(rejected).toMatchObject({ moderatorNote: 'Add a transcript.', reviewedBy: 'Mo Moderator' })
    expect(store.items.find((item) => item.id === 1)?.moderatorNote).toBeUndefined()
  })

  it('keeps only the newest decision per piece of content', async () => {
    mockApi(authorContent, [
      feedback({ reason: 'Newest', decidedAt: '2026-09-16T12:00:00.000Z' }),
      feedback({ reason: 'Older', decidedAt: '2026-09-10T12:00:00.000Z' }),
    ])
    const store = authorDashboardScreenStore()
    await store.load()
    expect(store.items.find((item) => item.id === 4)?.moderatorNote).toBe('Newest')
  })

  it('reports a failure to load instead of showing nothing', async () => {
    vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(new $DataSourceResponse<$ContentSummary[]>(null, new Exception({
      exceptionType: ExceptionType.FAILED, message: 'Failed to load your content. Please try again.', statusCode: 500,
    })))
    const store = authorDashboardScreenStore()
    await store.load()
    expect(store.error).toBe('Failed to load your content. Please try again.')
    expect(store.isLoading).toBe(false)
  })

  it('totalCount and awaitingReviewCount match the loaded data', async () => {
    const store = authorDashboardScreenStore()
    await store.load()
    expect(store.totalCount).toBe(store.items.length)
    expect(store.awaitingReviewCount).toBe(store.items.filter((i) => i.status === 'pending').length)
  })

  it('filteredItems returns everything when the filter is "all"', async () => {
    const store = authorDashboardScreenStore()
    await store.load()
    store.setStatusFilter('all')
    expect(store.filteredItems).toEqual(store.items)
  })

  it('filteredItems narrows to a single status', async () => {
    const store = authorDashboardScreenStore()
    await store.load()
    store.setStatusFilter('rejected')
    expect(store.filteredItems.length).toBe(2)
    expect(store.filteredItems.every((item) => item.status === 'rejected')).toBe(true)
  })

  it('rejectedItems is empty before anything is loaded', () => {
    expect(authorDashboardScreenStore().rejectedItems).toEqual([])
  })

  it('rejectedItems returns every rejected item, newest first', async () => {
    const store = authorDashboardScreenStore()
    await store.load()
    expect(store.rejectedItems.map((item) => item.id)).toEqual([4, 5])
  })
})
