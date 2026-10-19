// Saved reading progress: the page each learner was last on in each piece of
// content (migrations/502_content_progress.sql).
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { ContentMethods } from '../../contentRoutes/methods/contentMethods.js';
import { requireLearnerMayOpen } from '../../contentRoutes/functions/learnerGate.js';
import type { ContentType } from '../../contentRoutes/types/contentType.js';
import type { ContinueReadingRow } from '../../testAttemptsRoutes/types/testAttemptType.js';
import type { ReadingProgress } from '../types/readingType.js';

//How many part-read items "Continue reading" offers.
const CONTINUE_READING_LENGTH = 6;

//Loads approved content the learner may open. Throws 404 for missing or
//unapproved content and 403 when the learner gate refuses it.
async function readableContent(learnerId: number, contentId: number): Promise<ContentType> {
    const content = await ContentMethods.getContent(contentId);
    if (content.status !== 'approved') throw new ApiError(404, 'content not found');
    await requireLearnerMayOpen(learnerId, content);
    return content;
}

//Database access for reading progress.
export class ReadingMethods {
    //Remembers the page the learner is on. The page count is the content's own,
    //so progress can never point past its last page. Throws 400 for a page
    //outside the content, or a totalPages that does not match it.
    static async saveProgress(learnerId: number, contentId: number, page: number, totalPages?: number): Promise<ReadingProgress> {
        const content = await readableContent(learnerId, contentId);
        const pageCount = Math.max(content.content.length, 1);
        if (totalPages !== undefined && totalPages !== pageCount) {
            throw new ApiError(400, `this content has ${pageCount} pages`);
        }
        if (page >= pageCount) throw new ApiError(400, `page must be below ${pageCount}`);

        await pool.query(
            `INSERT INTO content_progress (learner_id, content_id, page_index, total_pages)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (learner_id, content_id)
             DO UPDATE SET page_index = EXCLUDED.page_index, total_pages = EXCLUDED.total_pages, updated_at = now()`,
            [learnerId, contentId, page, pageCount]);
        return { page, totalPages: pageCount };
    }

    //The page the learner was last on, 0 when they have not opened it before.
    //A saved page past the end (the content has since lost pages) starts over.
    static async getProgress(learnerId: number, contentId: number): Promise<ReadingProgress> {
        const content = await readableContent(learnerId, contentId);
        const pageCount = Math.max(content.content.length, 1);
        const { rows } = await pool.query<{ page_index: number }>(
            `SELECT page_index FROM content_progress WHERE learner_id = $1 AND content_id = $2`,
            [learnerId, contentId]);
        const saved = rows[0]?.page_index ?? 0;
        return { page: saved < pageCount ? saved : 0, totalPages: pageCount };
    }

    //Approved content the learner has opened but not reached the last page of,
    //most recently read first.
    static async getContinueReading(learnerId: number): Promise<ContinueReadingRow[]> {
        const { rows } = await pool.query<{
            content_id: number; title: string; page_index: number; total_pages: number; updated_at: Date;
        }>(
            `SELECT p.content_id, c.title, p.page_index, p.total_pages, p.updated_at
               FROM content_progress p
               JOIN content c ON c.id = p.content_id
              WHERE p.learner_id = $1
                AND c.status = 'approved'
                AND p.page_index < p.total_pages - 1
              ORDER BY p.updated_at DESC
              LIMIT $2`,
            [learnerId, CONTINUE_READING_LENGTH]);
        return rows.map(row => ({
            contentId: row.content_id,
            title: row.title,
            page: row.page_index,
            totalPages: row.total_pages,
            updatedAt: row.updated_at.toISOString(),
        }));
    }
}
