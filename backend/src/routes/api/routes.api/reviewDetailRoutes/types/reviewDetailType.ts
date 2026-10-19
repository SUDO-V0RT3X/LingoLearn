import type { ContentPages } from '../../contentRoutes/types/contentType.js';
import type { ReviewQueueRow } from '../../reviewQueueRoutes/types/reviewQueueType.js';

// One decision already made on a piece of content.
export interface ReviewDecisionRow {
    decision: 'approved' | 'rejected';
    reason: string;
    moderator: string;
    decidedAt: string;
}

// Everything the review screen shows: the queue row, the pages themselves in the
// content builder's own shape, and the decisions made so far.
export interface ReviewDetailRow extends ReviewQueueRow {
    // 'draft' when the author has reopened it to make changes: shown read-only.
    status: 'draft' | 'pending' | 'approved' | 'rejected';
    // Which submission this is: 2 for content sent back after a rejection.
    version: number;
    language: string | null;
    chosenTags: string[];
    content: ContentPages;
    decisions: ReviewDecisionRow[];
}

// One decision on the author's own content, for their dashboard.
export interface AuthorFeedbackRow extends ReviewDecisionRow {
    contentId: number;
    title: string;
}

// What a moderator sends when deciding. Rejecting needs a reason.
export interface ReviewDecisionInput {
    decision: 'approved' | 'rejected';
    reason?: string;
}
