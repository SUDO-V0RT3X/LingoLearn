import { defineStore } from 'pinia'
import type { ContentItem, StatusFilter } from '@/features/media_feature/models/AuthorDashboardTypes'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource'
import type { $ContentSummary } from '@/features/shared/models/contentType'
import type { AuthorFeedbackRow } from '@/features/review_detail_feature/models/ReviewDetailTypes'
import { localizeMediaMessage, mediaT } from '@/features/media_feature/functions/localizeMediaMessage'

// Turns one row of the author's content into what this screen renders, folding
// in the moderator's latest decision when there is one.
function toContentItem(summary: $ContentSummary, feedback?: AuthorFeedbackRow): ContentItem {
  return {
    id: summary.contentId,
    title: summary.title || mediaT('media.dashboard.untitled'),
    type: summary.kind === 'quiz' ? 'test' : 'lesson',
    level: summary.level ?? 0,
    language: summary.language,
    childFriendly: summary.childFriendly,
    updatedAt: summary.updatedAt,
    status: summary.status,
    moderatorNote: feedback?.reason || undefined,
    reviewedBy: feedback?.moderator,
    // Kept as the raw time; the notice formats it in the interface language.
    reviewedAt: feedback?.decidedAt,
  }
}

interface AuthorDashboardScreenState {
  items: ContentItem[]
  statusFilter: StatusFilter
  isLoading: boolean
  error: string | null
}

export const authorDashboardScreenStore = defineStore('authorDashboardScreenStore', {
  state: (): AuthorDashboardScreenState => ({
    items: [],
    statusFilter: 'all',
    isLoading: false,
    error: null,
  }),
  getters: {
    filteredItems(state): ContentItem[] {
      if (state.statusFilter === 'all') return state.items
      return state.items.filter((item) => item.status === state.statusFilter)
    },
    totalCount(state): number {
      return state.items.length
    },
    awaitingReviewCount(state): number {
      return state.items.filter((item) => item.status === 'pending').length
    },
    // How many items each filter would show, for the counts on the filter pills.
    countsByFilter(state): Record<StatusFilter, number> {
      const counts: Record<StatusFilter, number> = { all: state.items.length, draft: 0, pending: 0, approved: 0, rejected: 0 }
      for (const item of state.items) counts[item.status] += 1
      return counts
    },
    // All rejected items, most recently updated first — used by the Feedback tab
    
    rejectedItems(state): ContentItem[] {
      return state.items
        .filter((item) => item.status === 'rejected')
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    },
  },
  actions: {
    // Loads the author's own content, and the decisions made on it. Feedback is
    // a separate call because moderation owns the decisions.
    async load() {
      this.isLoading = true
      this.error = null

      const [content, feedback] = await Promise.all([
        ContentDataSource.getMyContent(),
        ReviewDetailDataSource.getMyFeedback(),
      ])

      if (content.error != null || content.data == null) {
        this.error = content.error?.message
          ? localizeMediaMessage(content.error.message)
          : mediaT('media.dashboard.loadFailed')
        this.isLoading = false
        return
      }

      // The newest decision per piece of content is the one worth showing.
      const latest = new Map<number, AuthorFeedbackRow>()
      for (const row of feedback.data ?? []) {
        if (!latest.has(row.contentId)) latest.set(row.contentId, row)
      }

      this.items = content.data.map((summary) => toContentItem(summary, latest.get(summary.contentId)))
      this.isLoading = false
    },
    setStatusFilter(filter: StatusFilter) {
      this.statusFilter = filter
    },
  },
})