// These interfaces define the read-only calls the report makes into the owning feature slices.
// The adapters below read the same tables and rules the learner's own screens use
// (My learning, the level-up challenge, the reader), so the guardian sees the same numbers.
import { pool } from '../../../../../config/db/db_init.js';
import { calculateAge, getLearnerAccess } from '../../../../../shared/learnerAccess.js';
import { ProgressMethods } from '../../progressRoutes/methods/progressMethods.js';
import type {
    ChallengeStatus,
    ChildReportProfile,
    ReportActivity,
    ReportLanguage,
    TestSummary,
} from '../types/childProgressReportType.js';

// The child profile interface supplies identity and learner preference fields.
export interface ChildProfileService {
    getChildProfile(childId: number): Promise<ChildReportProfile | null>; // Read one learner profile.
}

// The level interface supplies the learner's level once placement has set one.
export interface LevelService {
    getPlacedLevel(childId: number): Promise<number | null>; // Read the level, or null before placement.
}

// The progress interface supplies activity and summary values without exposing its tables.
export interface ProgressService {
    getRecentActivity(childId: number, limit: number): Promise<ReportActivity[]>; // Read recent activity, newest first.
    getTestSummary(childId: number): Promise<TestSummary>; // Read the tests-taken count and average score.
}

// The challenge interface supplies eligibility and level-up requirement values.
export interface ChallengeEligibilityService {
    getStatus(childId: number, now: Date): Promise<ChallengeStatus>; // Read challenge status.
}

// The dependency collection lets tests provide their own services.
export type ChildProgressReportDependencies = {
    childProfiles: ChildProfileService; // Read child identity and preference fields.
    levels: LevelService; // Read the placement level.
    progress: ProgressService; // Read activity and score summaries.
    challenges: ChallengeEligibilityService; // Read challenge eligibility.
};

/** The report's code for a learner_settings target language; English when setup is unfinished. */
export function reportLanguageOf(targetLanguage: string | null): ReportLanguage {
    return targetLanguage === 'zulu' ? 'zu' : 'en';
}

/**
 * Whether the learner only sees child-friendly content, decided as every content
 * gate decides it (shared/learnerAccess.ts): under 13 on their date of birth. A
 * learner with no date of birth yet counts as a child, since a guardian link is
 * only ever made for one.
 */
export function isChildFriendly(dateOfBirth: string | null, today = new Date()): boolean {
    if (!dateOfBirth) return true;
    const age = calculateAge(new Date(`${dateOfBirth}T00:00:00Z`), today);
    return getLearnerAccess(age, true).contentAudience === 'child';
}

// This profile adapter reads the learner, their setup and the time of their latest learning.
class LearnerChildProfileService implements ChildProfileService {
    /** Reads the learner identity, the language they learn, their age group and when they last learned. */
    async getChildProfile(childId: number): Promise<ChildReportProfile | null> {
        // Last active is the newest test, challenge or page turned in the reader.
        const { rows } = await pool.query<{
            id: number;
            first_name: string;
            target_language: string | null;
            date_of_birth: string | null;
            last_active_at: Date | null;
        }>(
            `SELECT u.id, u.first_name, s.target_language,
                    to_char(s.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                    GREATEST(
                        (SELECT MAX(submitted_at) FROM test_attempts WHERE learner_id = u.id),
                        (SELECT MAX(submitted_at) FROM level_challenges WHERE learner_id = u.id),
                        (SELECT MAX(updated_at) FROM content_progress WHERE learner_id = u.id)
                    ) AS last_active_at
               FROM users u
               LEFT JOIN learner_settings s ON s.user_id = u.id
              WHERE u.id = $1 AND u.role = 'learner'`,
            [childId],
        );
        const child = rows[0];
        // Return null when the linked account is not a learner row.
        if (!child) return null;

        const language = reportLanguageOf(child.target_language);
        return {
            id: child.id,
            firstName: child.first_name,
            languages: [language], // Level and tests are one across languages, so the report is too.
            activeLanguage: language,
            lastActiveAt: child.last_active_at ? child.last_active_at.toISOString() : null,
            childFriendly: isChildFriendly(child.date_of_birth),
        };
    }
}

// This level adapter reads learner_levels, which placement, skipping it and level-ups write.
class LearnerLevelService implements LevelService {
    /** The learner's level, or null when they have not been placed yet (the app then treats them as level 1). */
    async getPlacedLevel(childId: number): Promise<number | null> {
        const { rows } = await pool.query<{ level_number: number }>(
            'SELECT level_number FROM learner_levels WHERE user_id = $1',
            [childId],
        );
        return rows[0]?.level_number ?? null;
    }
}

// This progress adapter reads tests, challenges and reading progress.
class LearnerProgressService implements ProgressService {
    /** The newest tests, challenges and reading, merged newest first. Never includes answers. */
    async getRecentActivity(childId: number, limit: number): Promise<ReportActivity[]> {
        //A challenge has no content, so its row carries the level it aimed for instead.
        const { rows } = await pool.query<{
            content_id: number;
            title: string;
            type: ReportActivity['type'];
            score: number | null;
            outcome: ReportActivity['outcome'];
            level: number | null;
            occurred_at: Date;
        }>(
            `(SELECT a.content_id, c.title, 'test' AS type, a.percent AS score,
                     CASE WHEN a.passed THEN 'passed' ELSE 'failed' END AS outcome,
                     a.level, a.submitted_at AS occurred_at
                FROM test_attempts a
                JOIN content c ON c.id = a.content_id
               WHERE a.learner_id = $1
               ORDER BY a.submitted_at DESC, a.id DESC
               LIMIT $2)
             UNION ALL
             (SELECT l.id, 'Level-up challenge', 'challenge', l.score,
                     CASE WHEN l.passed THEN 'passed' ELSE 'failed' END,
                     l.target_level, l.submitted_at
                FROM level_challenges l
               WHERE l.learner_id = $1 AND l.submitted_at IS NOT NULL
               ORDER BY l.submitted_at DESC
               LIMIT $2)
             UNION ALL
             (SELECT p.content_id, c.title, 'lesson', NULL,
                     CASE WHEN p.page_index + 1 >= p.total_pages THEN 'completed' ELSE 'in_progress' END,
                     c.level, p.updated_at
                FROM content_progress p
                JOIN content c ON c.id = p.content_id
               WHERE p.learner_id = $1
               ORDER BY p.updated_at DESC
               LIMIT $2)
             ORDER BY occurred_at DESC
             LIMIT $2`,
            [childId, limit],
        );

        return rows.map((row) => ({
            contentId: row.content_id,
            title: row.title,
            type: row.type,
            score: row.score,
            outcome: row.outcome,
            occurredAt: row.occurred_at.toISOString(),
            level: row.level,
        }));
    }

    /** Tests taken and the average score, counted exactly as the learner's My learning counts them. */
    async getTestSummary(childId: number): Promise<TestSummary> {
        const { rows: [stats] } = await pool.query<{ completed: string; average: string | null }>(
            `SELECT COUNT(*) AS completed, ROUND(AVG(best_percent)) AS average
               FROM (SELECT content_id, MAX(percent) AS best_percent
                       FROM test_attempts WHERE learner_id = $1
                      GROUP BY content_id) AS per_test`,
            [childId],
        );
        return {
            completed: Number(stats?.completed ?? 0),
            avgScore: stats?.average == null ? null : Number(stats.average),
        };
    }
}

// This challenge adapter asks the level-up challenge's own eligibility check.
class LearnerChallengeService implements ChallengeEligibilityService {
    /** The same decision the learner's level-up screen shows. */
    async getStatus(childId: number, now: Date): Promise<ChallengeStatus> {
        const report = await ProgressMethods.checkEligibility(childId, now);
        return {
            eligible: report.eligible,
            testsPassed: report.testsPassed,
            testsRequired: report.testsRequired,
            // A cooldown only matters once the requirement is met, as on the learner's screen.
            cooldownEndsAt: report.reason === 'cooldown_active' ? report.cooldownUntil : null,
            atTopLevel: report.reason === 'max_level',
        };
    }
}

// The default dependency set reads the real data.
export const defaultChildProgressReportDependencies: ChildProgressReportDependencies = {
    childProfiles: new LearnerChildProfileService(),
    levels: new LearnerLevelService(),
    progress: new LearnerProgressService(),
    challenges: new LearnerChallengeService(),
};
