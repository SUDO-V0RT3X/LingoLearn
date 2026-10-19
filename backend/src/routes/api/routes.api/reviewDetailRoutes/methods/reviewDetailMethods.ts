// One piece of content under review, and the decisions made on it.
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { ContentMethods } from '../../contentRoutes/methods/contentMethods.js';
import { toQueueRow } from '../../reviewQueueRoutes/methods/reviewQueueMethods.js';
import type { AuthorFeedbackRow, ReviewDecisionInput, ReviewDecisionRow, ReviewDetailRow } from '../types/reviewDetailType.js';

export class ReviewDetailMethods {
    // The content itself plus its decision history. Throws 404 if there is none,
    // 409 if it has never been submitted: a moderator only sees submitted work.
    // Content its author has reopened after a rejection is a draft again, but it
    // has a review history, so it is shown (read-only: only pending content can
    // be decided) rather than breaking the link to that history.
    static async getReviewDetail(contentId: number): Promise<ReviewDetailRow> {
        const content = await ContentMethods.getContent(contentId);
        if (content.status === 'draft' && content.version === 0) {
            throw new ApiError(409, 'this content has not been submitted');
        }

        const { rows } = await pool.query<{ decision: 'approved' | 'rejected'; reason: string; moderator: string; created_at: Date }>(
            `SELECT r.decision, r.reason, u.first_name || ' ' || u.last_name AS moderator, r.created_at
               FROM content_reviews r
               JOIN users u ON u.id = r.moderator_id
              WHERE r.content_id = $1
              ORDER BY r.created_at DESC`,
            [contentId]);

        const decisions: ReviewDecisionRow[] = rows.map(row => ({
            decision: row.decision,
            reason: row.reason,
            moderator: row.moderator,
            decidedAt: row.created_at.toISOString(),
        }));

        return {
            ...toQueueRow({ ...content, authorName: '' }),
            // The queue row carries the author's name, which getContent does not join.
            author: await ReviewDetailMethods.authorName(content.authorId),
            status: content.status,
            version: content.version,
            language: content.language,
            chosenTags: content.chosenTags,
            content: content.content,
            decisions,
        };
    }

    // Records the decision and moves the content in the same transaction, so the
    // status and its reason can never disagree.
    static async decideContent(contentId: number, moderatorId: number, input: ReviewDecisionInput): Promise<ReviewDetailRow> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await ContentMethods.setReviewedStatus(client, contentId, input.decision);
            await client.query(
                `INSERT INTO content_reviews (content_id, moderator_id, decision, reason) VALUES ($1, $2, $3, $4)`,
                [contentId, moderatorId, input.decision, input.reason?.trim() ?? '']);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return ReviewDetailMethods.getReviewDetail(contentId);
    }

    // Every decision made on one author's content, newest first. This is what the
    // author reads on their dashboard when something comes back rejected.
    static async getFeedbackForAuthor(authorId: number): Promise<AuthorFeedbackRow[]> {
        const { rows } = await pool.query<{
            content_id: number; title: string; decision: 'approved' | 'rejected';
            reason: string; moderator: string; created_at: Date;
        }>(
            `SELECT r.content_id, c.title, r.decision, r.reason,
                    u.first_name || ' ' || u.last_name AS moderator, r.created_at
               FROM content_reviews r
               JOIN content c ON c.id = r.content_id
               JOIN users u ON u.id = r.moderator_id
              WHERE c.author_id = $1
              ORDER BY r.created_at DESC`,
            [authorId]);

        return rows.map(row => ({
            contentId: row.content_id,
            title: row.title,
            decision: row.decision,
            reason: row.reason,
            moderator: row.moderator,
            decidedAt: row.created_at.toISOString(),
        }));
    }

    // The author's display name, for the header of the review screen.
    private static async authorName(authorId: number): Promise<string> {
        const { rows } = await pool.query<{ name: string }>(
            `SELECT first_name || ' ' || last_name AS name FROM users WHERE id = $1`, [authorId]);
        return rows[0]?.name ?? 'Unknown author';
    }
}
