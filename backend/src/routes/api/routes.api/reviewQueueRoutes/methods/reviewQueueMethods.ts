// The moderator's queue. The rows come from the content slice, so moderation
// never defines its own idea of what a piece of content is.
import { ContentMethods } from '../../contentRoutes/methods/contentMethods.js';
import type { ContentSummary } from '../../contentRoutes/types/contentType.js';
import type { ReviewQueueRow } from '../types/reviewQueueType.js';

/** Turns a content summary into the row the queue screen renders. */
export function toQueueRow(content: ContentSummary): ReviewQueueRow {
    return {
        id: content.contentId,
        title: content.title,
        author: content.authorName,
        contentType: content.kind === 'quiz' ? 'Test' : 'Lesson',
        level: content.level ?? 0,
        audience: content.childFriendly ? 'Child-friendly' : 'General',
        language: content.language,
        submittedAt: content.submittedAt ?? content.updatedAt,
    };
}

export class ReviewQueueMethods {
    // Everything waiting for a decision, longest wait first.
    static async getReviewQueue(): Promise<ReviewQueueRow[]> {
        const pending = await ContentMethods.getPendingContent();
        return pending.map(toQueueRow);
    }
}
