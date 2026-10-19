import type { $ContentBlock } from '@/features/shared/models/contentType';
import type { ReviewQueueRow } from '@/features/review_queue_feature/models/ReviewQueueTypes';

// One decision already made on this content.
export interface ReviewDecisionRow {
    decision: 'approved' | 'rejected';
    reason: string;
    moderator: string;
    decidedAt: string;
}

// One decision on the author's own content, for their dashboard.
export interface AuthorFeedbackRow extends ReviewDecisionRow {
    contentId: number;
    title: string;
}

// The queue row, plus the pages in the content builder's own shape and the
// decisions made so far. Pages come with their answers: moderators see them.
export interface ReviewDetailRow extends ReviewQueueRow {
    // 'draft' when the author has reopened it after a rejection: read-only then.
    status: 'draft' | 'pending' | 'approved' | 'rejected';
    // Which submission this is: 2 for content sent back after a rejection.
    version: number;
    language: string | null;
    chosenTags: string[];
    content: $ContentBlock[][];
    decisions: ReviewDecisionRow[];
}
