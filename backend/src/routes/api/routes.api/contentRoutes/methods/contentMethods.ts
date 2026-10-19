// SQL reads and writes for the content table (migrations/300_content.sql) and
// its tag links (migrations/400_taxonomy.sql and 402_content_tag_order.sql, owned
// by media and taxonomy).
// Requests are validated in the route handlers.
import type { PoolClient } from 'pg';
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import {
    QUESTION_BLOCK_TYPES,
    type ApprovedContentFilter, type ContentDraftInput, type ContentKind, type ContentPages,
    type ContentSubmission, type ContentSummary, type ContentType,
} from '../types/contentType.js';

//Returns 'quiz' if any block is a question type, otherwise 'story'.
export function deriveKind(content: ContentPages): ContentKind {
    const hasQuestion = content.some(page => page.some(block => QUESTION_BLOCK_TYPES.includes(block.itemType)));
    return hasQuestion ? 'quiz' : 'story';
}

//Statuses an author may still change. Rejected content reopens as a draft on the
//first edit, which is how an author answers a moderator's feedback.
const EDITABLE_STATUSES = ['draft', 'rejected'];

//Locks the content row for the transaction and checks it belongs to this author.
//Throws 404 if none, 403 if it is someone else's, 409 once it is pending or approved.
async function lockEditableOrThrow(client: PoolClient, contentId: number, authorId: number): Promise<void> {
    const { rows } = await client.query(
        `SELECT status, author_id FROM content WHERE id = $1 FOR UPDATE`, [contentId]);
    if (rows.length === 0) throw new ApiError(404, 'content not found');
    if (rows[0].author_id !== authorId) throw new ApiError(403, 'this content belongs to another author');
    if (!EDITABLE_STATUSES.includes(rows[0].status)) throw new ApiError(409, 'only a draft can be changed');
}

//Runs the work in one transaction, rolling back everything if it throws.
async function inTransaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await work(client);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

//Replaces the content's tags with these, kept in the order given: the builder reads
//the first as the theme. Throws 400 for a name outside the theme vocabulary.
async function replaceTags(client: PoolClient, contentId: number, chosenTags: string[]): Promise<void> {
    const { rows: tags } = await client.query(
        `SELECT t.id FROM unnest($1::text[]) WITH ORDINALITY AS chosen(name, position)
           JOIN tags t ON t.name = chosen.name AND t.tag_type = 'theme'
          ORDER BY chosen.position`,
        [chosenTags]);
    if (tags.length !== chosenTags.length) {
        throw new ApiError(400, 'chosenTags must be distinct tags from the fixed set');
    }
    await client.query(`DELETE FROM content_tags WHERE content_id = $1`, [contentId]);
    await client.query(
        `INSERT INTO content_tags (content_id, tag_id, position)
         SELECT $1, chosen.tag_id, chosen.position - 1
           FROM unnest($2::int[]) WITH ORDINALITY AS chosen(tag_id, position)`,
        [contentId, tags.map(tag => tag.id)]);
}

//The columns every read returns, with the tag names in the order the author gave them.
const SUMMARY_COLUMNS = `c.id, c.author_id, c.title, c.language, c.child_friendly, c.status,
                         c.version, c.level, c.updated_at, c.submitted_at, c.content,
                         u.first_name || ' ' || u.last_name AS author_name,
                         COALESCE(array_agg(t.name ORDER BY ct.position, t.name) FILTER (WHERE t.id IS NOT NULL), '{}') AS chosen_tags`;
const SUMMARY_FROM = `FROM content c
                      JOIN users u ON u.id = c.author_id
                      LEFT JOIN content_tags ct ON ct.content_id = c.id
                      LEFT JOIN tags t ON t.id = ct.tag_id`;

type ContentRow = {
    id: number; author_id: number; author_name: string; title: string; language: ContentType['language'];
    child_friendly: boolean; status: ContentType['status']; version: number; level: number | null; chosen_tags: string[];
    content: ContentPages; updated_at: Date; submitted_at: Date | null;
};

function toContent(row: ContentRow): ContentType {
    return {
        contentId: row.id,
        authorId: row.author_id,
        title: row.title,
        language: row.language,
        childFriendly: row.child_friendly,
        status: row.status,
        version: row.version,
        level: row.level,
        chosenTags: row.chosen_tags,
        kind: deriveKind(row.content),
        content: row.content,
        updatedAt: row.updated_at.toISOString(),
        submittedAt: row.submitted_at?.toISOString() ?? null,
        authorName: row.author_name,
    };
}

function toSummary(row: ContentRow): ContentSummary {
    const { content, ...rest } = toContent(row);
    return { ...rest, authorName: row.author_name };
}

//Database access for content.
export class ContentMethods {
    //Returns the content with its tag names. Throws 404 if none.
    static async getContent(contentId: number): Promise<ContentType> {
        const { rows } = await pool.query<ContentRow>(
            `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE c.id = $1 GROUP BY c.id, u.id`,
            [contentId]);
        if (rows.length === 0) throw new ApiError(404, 'content not found');
        return toContent(rows[0]);
    }

    //Everything one author has written, newest change first.
    static async getMyContent(authorId: number): Promise<ContentSummary[]> {
        const { rows } = await pool.query<ContentRow>(
            `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM}
              WHERE c.author_id = $1
              GROUP BY c.id, u.id
              ORDER BY c.updated_at DESC`,
            [authorId]);
        return rows.map(toSummary);
    }

    //The review queue: everything waiting for a moderator, oldest wait first.
    static async getPendingContent(): Promise<ContentSummary[]> {
        const { rows } = await pool.query<ContentRow>(
            `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM}
              WHERE c.status = 'pending'
              GROUP BY c.id, u.id
              ORDER BY c.submitted_at ASC`);
        return rows.map(toSummary);
    }

    //Returns the learner's current level. Learners without a row start at level 1.
    static async getLearnerLevel(userId: number): Promise<number> {
        const { rows } = await pool.query<{ level_number: number }>(
            `SELECT level_number FROM learner_levels WHERE user_id = $1`,
            [userId],
        );
        return rows[0]?.level_number ?? 1;
    }

    //What a learner may see: approved content only, with higher levels marked as locked.
    static async getApprovedContent(
        filter: ApprovedContentFilter = {},
        learnerLevel?: number,
    ): Promise<ContentSummary[]> {
        const { rows } = await pool.query<ContentRow>(
            `SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM}
              WHERE c.status = 'approved'
                AND ($1::int IS NULL OR c.level = $1)
                AND ($2::text IS NULL OR c.language = $2)
                AND ($3::boolean IS NOT TRUE OR c.child_friendly = true)
              GROUP BY c.id, u.id
              ORDER BY c.level ASC, c.title ASC`,
            [filter.level ?? null, filter.language ?? null, filter.childFriendlyOnly ?? false]);
        return rows.map((row) => ({
            ...toSummary(row),
            ...(learnerLevel !== undefined && row.level !== null
                ? { locked: row.level > learnerLevel }
                : {}),
        }));
    }

    //Inserts new draft content for this author, with any level and tags already
    //chosen, and returns it with its id. Throws 400 for a tag outside the theme vocabulary.
    static async createContent(authorId: number, draft: ContentDraftInput): Promise<ContentType> {
        let contentId = 0;
        await inTransaction(async client => {
            //Stringified so pg sends JSON rather than a Postgres array.
            const { rows } = await client.query(
                `INSERT INTO content (author_id, content, title, language, child_friendly, level)
                 VALUES ($1, $2::jsonb, $3, $4, $5, $6) RETURNING id`,
                [authorId, JSON.stringify(draft.content), draft.title ?? '', draft.language ?? null,
                 draft.childFriendly ?? false, draft.level ?? null]);
            contentId = rows[0].id;
            if (draft.chosenTags !== undefined) await replaceTags(client, contentId, draft.chosenTags);
        });
        return ContentMethods.getContent(contentId);
    }

    //Saves a draft. Rejected content returns to draft here, so an author can answer
    //feedback. The level and tags change only when sent, so a save that leaves them
    //out keeps them. Throws 400 for a tag outside the theme vocabulary, 404 if none,
    //403 if it is another author's, 409 once pending.
    static async editContent(contentId: number, authorId: number, draft: ContentDraftInput): Promise<ContentType> {
        await inTransaction(async client => {
            await lockEditableOrThrow(client, contentId, authorId);
            //$6 says whether a level was sent at all, since null is a level being cleared.
            await client.query(
                `UPDATE content
                    SET content = $2::jsonb,
                        title = COALESCE($3, title),
                        language = COALESCE($4, language),
                        child_friendly = COALESCE($5, child_friendly),
                        level = CASE WHEN $6 THEN $7::int ELSE level END,
                        status = 'draft',
                        updated_at = now()
                  WHERE id = $1`,
                [contentId, JSON.stringify(draft.content), draft.title ?? null,
                 draft.language ?? null, draft.childFriendly ?? null,
                 draft.level !== undefined, draft.level ?? null]);
            if (draft.chosenTags !== undefined) await replaceTags(client, contentId, draft.chosenTags);
        });
        return ContentMethods.getContent(contentId);
    }

    //Deletes a draft; its tag links go with it. Throws 404 if none, 403 if it is
    //another author's, 409 once it is pending or approved.
    static async deleteContent(contentId: number, authorId: number): Promise<void> {
        await inTransaction(async client => {
            await lockEditableOrThrow(client, contentId, authorId);
            await client.query(`DELETE FROM content WHERE id = $1`, [contentId]);
        });
    }

    //Saves everything the author set, replaces the tags and sets the draft to pending,
    //in one transaction. Throws 400 for a tag outside the theme vocabulary, 404 if none,
    //403 if it is another author's, 409 once it is already pending.
    static async submitContent(contentId: number, authorId: number, submission: ContentSubmission): Promise<ContentType> {
        await inTransaction(async client => {
            await lockEditableOrThrow(client, contentId, authorId);
            await replaceTags(client, contentId, submission.chosenTags);
            await client.query(
                `UPDATE content
                    SET content = $2::jsonb, title = $3, language = $4, child_friendly = $5, level = $6,
                        status = 'pending', version = version + 1, submitted_at = now(), updated_at = now()
                  WHERE id = $1`,
                [contentId, JSON.stringify(submission.content), submission.title, submission.language,
                 submission.childFriendly, submission.level]);
        });
        return ContentMethods.getContent(contentId);
    }

    //Moves pending content to approved or rejected. Moderation owns the decision row
    //and calls this inside its own transaction. Throws 404 if none, 409 if not pending.
    static async setReviewedStatus(client: PoolClient, contentId: number, status: 'approved' | 'rejected'): Promise<void> {
        const { rows } = await client.query(
            `SELECT status FROM content WHERE id = $1 FOR UPDATE`, [contentId]);
        if (rows.length === 0) throw new ApiError(404, 'content not found');
        if (rows[0].status !== 'pending') throw new ApiError(409, 'only pending content can be decided');
        await client.query(`UPDATE content SET status = $2, updated_at = now() WHERE id = $1`, [contentId, status]);
    }
}
