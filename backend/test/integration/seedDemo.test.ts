// LIN-81: Integration test for demo seed script.
// Verifies that seedDemo populates all user roles, learner settings,
// guardian links, taxonomy levels, tags, and sample multi-state content,
// and ensures subsequent executions are strictly idempotent.
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { pool } from '../../src/config/db/db_init.js';
import { seedDemo, type SeedSummary } from '../../scripts/seedDemo.js';
import { PasswordMethods } from '../../src/routes/api/routes.api/authRoutes/methods/passwordMethods.js';
import { TESTS_REQUIRED_PER_LEVEL } from '../../src/shared/levelRules.js';

describe('Demo Seed Script (Integration)', () => {
    let summary: SeedSummary;

    it('executes initial demo seeding successfully', async () => {
        summary = await seedDemo(pool);
        expect(summary).toBeDefined();
        expect(summary.levelsSeeded).toBe(6);
        expect(summary.tagsSeeded).toBeGreaterThanOrEqual(14);
    });

    it('seeds accounts for every role with valid credentials', async () => {
        const expectedUsers = [
            { identifier: 'one@admin.test', isEmail: true, role: 'administrator', requiresGuardian: false },
            { identifier: 'one@moderator.test', isEmail: true, role: 'moderator', requiresGuardian: false },
            { identifier: 'one@author.test', isEmail: true, role: 'author', requiresGuardian: false },
            { identifier: 'one_learner', isEmail: false, role: 'learner', requiresGuardian: false },
            { identifier: 'young_learner', isEmail: false, role: 'learner', requiresGuardian: true },
            { identifier: 'one@guardian.test', isEmail: true, role: 'guardian', requiresGuardian: false },
        ];

        for (const expected of expectedUsers) {
            const query = expected.isEmail
                ? `SELECT id, role, password_hash, requires_guardian_link FROM users WHERE email = $1`
                : `SELECT id, role, password_hash, requires_guardian_link FROM users WHERE username = $1`;

            const result = await pool.query(query, [expected.identifier]);
            expect(result.rowCount).toBe(1);

            const user = result.rows[0];
            expect(user.role).toBe(expected.role);
            expect(user.requires_guardian_link).toBe(expected.requiresGuardian);

            // Verify password hashes authenticate with default password '123456789'
            const passwordValid = await PasswordMethods.verifyPassword('123456789', user.password_hash);
            expect(passwordValid).toBe(true);
        }
    });

    it('populates learner settings and guardian relationships', async () => {
        // Adult learner settings
        const adultSettings = await pool.query(
            `SELECT s.target_language, s.daily_goal
             FROM learner_settings s
             JOIN users u ON s.user_id = u.id
             WHERE u.username = 'one_learner'`,
        );
        expect(adultSettings.rowCount).toBe(1);
        expect(adultSettings.rows[0].target_language).toBe('zulu');
        expect(adultSettings.rows[0].daily_goal).toBe(15);

        // Child learner settings
        const childSettings = await pool.query(
            `SELECT s.target_language, s.daily_goal
             FROM learner_settings s
             JOIN users u ON s.user_id = u.id
             WHERE u.username = 'young_learner'`,
        );
        expect(childSettings.rowCount).toBe(1);
        expect(childSettings.rows[0].target_language).toBe('zulu');
        expect(childSettings.rows[0].daily_goal).toBe(10);

        // Parent-child link
        const linkResult = await pool.query(
            `SELECT l.guardian_id, l.learner_id
             FROM parent_child_links l
             JOIN users g ON l.guardian_id = g.id
             JOIN users c ON l.learner_id = c.id
             WHERE g.email = 'one@guardian.test' AND c.username = 'young_learner'`,
        );
        expect(linkResult.rowCount).toBe(1);

        // Active link code
        const codeResult = await pool.query(
            `SELECT c.code, c.expires_at
             FROM parent_link_codes c
             JOIN users u ON c.learner_id = u.id
             WHERE u.username = 'young_learner' AND c.code = 'DEMO01'`,
        );
        expect(codeResult.rowCount).toBe(1);
        expect(new Date(codeResult.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('seeds all 6 CEFR reading levels with valid pass marks', async () => {
        const levels = await pool.query(`SELECT level_number, name, pass_mark FROM levels ORDER BY level_number ASC`);
        expect(levels.rowCount).toBe(6);

        const expectedPassMarks = [70, 70, 70, 75, 80, 80];
        levels.rows.forEach((row, idx) => {
            expect(row.level_number).toBe(idx + 1);
            expect(row.pass_mark).toBe(expectedPassMarks[idx]);
        });
    });

    it('seeds both theme and assessment test tags', async () => {
        const themes = await pool.query(`SELECT COUNT(*)::int AS count FROM tags WHERE tag_type = 'theme'`);
        const tests = await pool.query(`SELECT COUNT(*)::int AS count FROM tags WHERE tag_type = 'test'`);

        expect(themes.rows[0].count).toBeGreaterThanOrEqual(10);
        expect(tests.rows[0].count).toBeGreaterThanOrEqual(4);
    });

    it('seeds sample content across draft, pending, approved, and rejected statuses', async () => {
        const statuses = ['draft', 'pending', 'approved', 'rejected'];

        for (const status of statuses) {
            const result = await pool.query(
                `SELECT c.id, c.title, c.language, c.level, c.content
                 FROM content c
                 JOIN users u ON c.author_id = u.id
                 WHERE u.email = 'one@author.test' AND c.status = $1`,
                [status],
            );
            expect(result.rowCount).toBeGreaterThanOrEqual(1);

            // Verify content has valid pages JSON structure
            const firstItem = result.rows[0];
            expect(firstItem.content).toBeDefined();
        }
    });

    it('attaches tags to seeded content items', async () => {
        const contentWithTags = await pool.query(`
            SELECT c.title, COUNT(t.id)::int AS tag_count
            FROM content c
            JOIN users u ON c.author_id = u.id
            JOIN content_tags ct ON c.id = ct.content_id
            JOIN tags t ON ct.tag_id = t.id
            WHERE u.email = 'one@author.test'
            GROUP BY c.id, c.title
        `);

        expect(contentWithTags.rowCount).toBeGreaterThanOrEqual(5);
        for (const row of contentWithTags.rows) {
            expect(row.tag_count).toBeGreaterThan(0);
        }
    });

    it('seeds moderation feedback reviews for approved and rejected content', async () => {
        // Moderation for rejected story
        const rejectedReviews = await pool.query(`
            SELECT cr.decision, cr.reason
            FROM content_reviews cr
            JOIN content c ON cr.content_id = c.id
            WHERE c.status = 'rejected'
        `);
        expect(rejectedReviews.rowCount).toBeGreaterThanOrEqual(1);
        expect(rejectedReviews.rows[0].decision).toBe('rejected');
        expect(rejectedReviews.rows[0].reason.length).toBeGreaterThan(0);

        // Moderation for approved stories
        const approvedReviews = await pool.query(`
            SELECT cr.decision
            FROM content_reviews cr
            JOIN content c ON cr.content_id = c.id
            WHERE c.status = 'approved'
        `);
        expect(approvedReviews.rowCount).toBeGreaterThanOrEqual(1);
        expect(approvedReviews.rows[0].decision).toBe('approved');
    });

    it('gives every submitted item version 1 and every draft version 0', async () => {
        const { rows } = await pool.query(`
            SELECT c.status, c.version FROM content c JOIN users u ON c.author_id = u.id
            WHERE u.email = 'one@author.test'`);
        for (const row of rows) expect(row.version).toBe(row.status === 'draft' ? 0 : 1);
    });

    it('removes the retired Tshivenda lesson', async () => {
        const { rowCount } = await pool.query(`SELECT 1 FROM content WHERE title = 'Ndaa! Everyday Greetings in Tshivenda'`);
        expect(rowCount).toBe(0);
    });

    it('seeds approved tests at levels 1 and 2', async () => {
        const { rows } = await pool.query(`
            SELECT c.level, count(*)::int AS tests,
                   sum((SELECT count(*) FROM jsonb_array_elements(c.content) page, jsonb_array_elements(page) block
                        WHERE block->>'itemType' IN ('Multiple Choice', 'Fill in the Blank', 'Listen and Choose')))::int AS questions
            FROM content c JOIN users u ON c.author_id = u.id
            WHERE u.email = 'one@author.test' AND c.status = 'approved'
              AND c.content @? '$[*][*] ? (@.itemType == "Multiple Choice" || @.itemType == "Fill in the Blank" || @.itemType == "Listen and Choose")'
            GROUP BY c.level ORDER BY c.level`);
        const level = (n: number) => rows.find((row) => row.level === n);
        expect(level(1)?.tests).toBeGreaterThanOrEqual(7);
        expect(level(2)?.tests).toBeGreaterThanOrEqual(5);
        expect(level(2)?.questions).toBeGreaterThanOrEqual(15);
    });

    it('puts both demo learners at level 1, one different level 1 test short of the challenge', async () => {
        for (const username of ['one_learner', 'young_learner']) {
            const { rows } = await pool.query(`
                SELECT l.level_number,
                       (SELECT count(DISTINCT t.content_id)::int FROM test_attempts t
                        WHERE t.learner_id = u.id AND t.level = 1 AND t.passed) AS passed
                FROM users u JOIN learner_levels l ON l.user_id = u.id WHERE u.username = $1`, [username]);
            expect(rows[0]).toEqual({ level_number: 1, passed: TESTS_REQUIRED_PER_LEVEL - 1 });
        }
    });

    it('runs idempotently without errors on repeated execution', async () => {
        // Run a second time
        const secondRun = await seedDemo(pool);
        expect(secondRun).toBeDefined();

        // Check user count has not duplicated
        const adminUsers = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE email = 'one@admin.test'`);
        expect(adminUsers.rows[0].count).toBe(1);

        const childLearners = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE username = 'young_learner'`);
        expect(childLearners.rows[0].count).toBe(1);

        const levelCount = await pool.query(`SELECT COUNT(*)::int AS count FROM levels`);
        expect(levelCount.rows[0].count).toBe(6);

        // Nothing is added twice: no new content and no new attempts.
        expect(secondRun.contentItemsSeeded).toBe(0);
        expect(secondRun.attemptsCreated).toBe(0);
        const attempts = await pool.query(`
            SELECT count(*)::int AS count FROM test_attempts t JOIN users u ON u.id = t.learner_id
            WHERE u.username IN ('one_learner', 'young_learner')`);
        expect(attempts.rows[0].count).toBe(2 * (TESTS_REQUIRED_PER_LEVEL - 1));
    });
});
