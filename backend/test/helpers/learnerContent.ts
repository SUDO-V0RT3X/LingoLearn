// Shared test helper for the learner-experience routes: content written straight
// into the database, learners with setup finished and a level, so a test can
// reach the tests, reader and My Learning without going through the builder
// and moderation first.
import { pool } from '../../src/config/db/db_init.js';
import { accountWithToken } from './accounts.js';

const createdContentIds: number[] = [];

/** A multiple choice question whose right answer is option 1. */
export const choice = { itemType: 'Multiple Choice',
                        value: { title: 'Greetings', question: 'Hello?', options: ['Hamba kahle', 'Sawubona'], correctOption: 1 } };
/** A fill in the blank question that accepts "sawubona". */
export const gap = { itemType: 'Fill in the Blank',
                     value: { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'] } };
/** A listening question whose right answer is option 0. */
export const listen = { itemType: 'Listen and Choose',
                        value: { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?',
                                 options: ['Who is that?', 'Where are you?'], correctOption: 0 } };
export const text = (body: string) => ({ itemType: 'Text', value: { title: 'Reading', text: body } });

/** Three pages: reading, then two pages of questions. All right is [1, 'Sawubona', 0]. */
export const QUIZ_PAGES = [[text('Sawubona means hello.')], [choice, gap], [listen]];
export const ALL_RIGHT = [1, 'Sawubona', 0];

/** Inserts content by an author; approved, level 1, English and child-friendly unless told otherwise. */
export async function insertContent(authorId: number, over: {
    level?: number; childFriendly?: boolean; status?: string; pages?: unknown; title?: string;
} = {}): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO content (author_id, status, title, language, child_friendly, level, content, submitted_at)
         VALUES ($1, $2, $3, 'english', $4, $5, $6::jsonb, now()) RETURNING id`,
        [authorId, over.status ?? 'approved', over.title ?? 'A test text', over.childFriendly ?? true,
         over.level ?? 1, JSON.stringify(over.pages ?? QUIZ_PAGES)]);
    createdContentIds.push(rows[0].id);
    return rows[0].id;
}

/** A signed-in learner who has finished setup (an adult unless a child is asked for) at a level. */
export async function learnerAt(level: number, kind: 'adult' | 'child' = 'adult') {
    const learner = await accountWithToken('learner');
    const dateOfBirth = kind === 'adult'
        ? '1998-04-02'
        : new Date(Date.now() - 9 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await pool.query(
        `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
         VALUES ($1, 'english', $2::date, 'english', 15)`,
        [learner.user.id, dateOfBirth]);
    await pool.query(`INSERT INTO learner_levels (user_id, level_number) VALUES ($1, $2)`, [learner.user.id, level]);
    if (kind === 'child') {
        const guardian = await accountWithToken('guardian');
        await pool.query(`INSERT INTO parent_child_links (guardian_id, learner_id) VALUES ($1, $2)`,
            [guardian.user.id, learner.user.id]);
    }
    return learner;
}

/** Deletes the content these helpers made; attempts and progress go with it. Call before deleteTestAccounts. */
export async function deleteTestContent(): Promise<void> {
    await pool.query(`DELETE FROM content WHERE id = ANY($1::int[])`, [createdContentIds]);
    createdContentIds.length = 0;
}
