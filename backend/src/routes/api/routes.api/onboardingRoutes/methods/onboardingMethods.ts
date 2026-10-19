// Import the shared PostgreSQL connection used by backend feature methods.
import { pool } from '../../../../../config/db/db_init.js';
// Import typed HTTP failures for missing onboarding records.
import { ApiError } from '../../../../../shared/errors/ApiError.js';
// Reuse the central age-and-guardian policy rather than duplicating it here.
import { getLearnerAccessForUser, type LearnerAccess } from '../../../../../shared/learnerAccess.js';
// A learner of English always sees the app in English.
import { ENGLISH_LEARNERS_SEE_ENGLISH, interfaceLanguageForTarget } from '../../../../../shared/learnerInterfaceLanguage.js';
// Use the authenticated principal shape for ownership of saved settings.
import type { AuthedUser } from '../../authRoutes/authApplyAllRoute.js';
// Use validated frontend payload and database row contracts for method signatures.
import type { ChildDateOfBirth, OnboardingInput, OnboardingSettings } from '../types/onboardingType.js';

/** The refusal a learner meets when their saved date of birth would change. */
export const DATE_OF_BIRTH_LOCKED = 'only a linked guardian can change your date of birth';

/** Owns persistence and access-policy operations for learner onboarding. */
export class OnboardingMethods {
    // A missing settings row tells the client that setup has not been completed.
    static async getSettings(userId: number): Promise<OnboardingSettings> {
        // date_of_birth is read as text: pg turns a DATE into local midnight, which
        // in SAST comes back as the previous day and shifts again on every save.
        // Format DATE in SQL so the API returns the intended calendar day as text.
        // A learner of English reads English menus, whatever an older row says.
        const { rows } = await pool.query<OnboardingSettings>(
            `SELECT user_id, target_language,
                    to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                    CASE WHEN target_language = 'english' THEN 'english' ELSE interface_language END
                        AS interface_language,
                    daily_goal, created_at, updated_at
               FROM learner_settings WHERE user_id = $1`,
            // Bind the learner ID as a parameter rather than interpolating SQL text.
            [userId],
        );
        // Report absent setup explicitly so the client can show first-run defaults.
        if (rows.length === 0) throw new ApiError(404, 'onboarding settings not found');
        // Return the single preferences row belonging to this learner.
        return rows[0];
    }

    // PUT is idempotent: the same request can create setup or replace existing settings.
    // The date of birth is fixed by the first save: after that only a linked
    // guardian may change it (setChildDateOfBirth), because it decides whether
    // the learner needs a parent link. Re-sending the same date is fine.
    // A learner of English is shown the app in English: their interface language
    // is stored as English whatever the form sent.
    static async saveSettings(user: AuthedUser, data: OnboardingInput): Promise<OnboardingSettings> {
        const interfaceLanguage = interfaceLanguageForTarget(data.targetLanguage, data.interfaceLanguage);
        // Create the learner's preferences or update them in one statement. Once a
        // guardian is linked, only they may change the date of birth: the WHERE on
        // the update then makes a changed date update nothing, so the check and the
        // write cannot race. A learner with no linked guardian may correct it.
        const { rows } = await pool.query<OnboardingSettings>(
            `INSERT INTO learner_settings
                     (user_id, target_language, date_of_birth, interface_language, daily_goal)
                 VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id) DO UPDATE SET
                target_language = EXCLUDED.target_language,
                date_of_birth = EXCLUDED.date_of_birth,
                interface_language = EXCLUDED.interface_language,
                daily_goal = EXCLUDED.daily_goal,
                updated_at = now()
              WHERE learner_settings.date_of_birth = EXCLUDED.date_of_birth
                 OR NOT EXISTS (SELECT 1 FROM parent_child_links l
                                 WHERE l.learner_id = learner_settings.user_id AND l.unlinked_at IS NULL)
             RETURNING user_id, target_language,
                    to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                    interface_language, daily_goal, created_at, updated_at`,
            // Bind authenticated ownership and all validated form fields separately.
            [user.id, data.targetLanguage, data.dateOfBirth, interfaceLanguage, data.dailyGoal],
        );
        // No row back means a linked learner tried to change their date of birth.
        if (rows.length === 0) throw new ApiError(403, DATE_OF_BIRTH_LOCKED);
        // The account keeps the interface language too (users.interface_language),
        // so it follows the learner to the next sign-in. Only a language the
        // interface has is copied there.
        await pool.query(
            `UPDATE users SET interface_language = lower(btrim($2))
              WHERE id = $1 AND lower(btrim($2)) IN ('english', 'zulu')`,
            [user.id, interfaceLanguage],
        );
        // Return the canonical persisted row, not an echo of untrusted request data.
        return rows[0];
    }

    /** Throws 403 unless the guardian has an active link to the child. */
    private static async requireActiveLink(guardianId: number, childId: number): Promise<void> {
        // A link an admin has ended keeps its row with unlinked_at set, and no longer counts.
        const { rows } = await pool.query(
            `SELECT 1 FROM parent_child_links
              WHERE guardian_id = $1 AND learner_id = $2 AND unlinked_at IS NULL
              LIMIT 1`,
            [guardianId, childId],
        );
        if (rows.length === 0) throw new ApiError(403, 'this child is not linked to your account');
    }

    /** A linked guardian reads the child's saved date of birth (null before the child's setup). */
    static async getChildDateOfBirth(guardianId: number, childId: number): Promise<ChildDateOfBirth> {
        await OnboardingMethods.requireActiveLink(guardianId, childId);
        const { rows } = await pool.query<{ date_of_birth: string }>(
            `SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth
               FROM learner_settings WHERE user_id = $1`,
            [childId],
        );
        return { childId, dateOfBirth: rows[0]?.date_of_birth ?? null };
    }

    /** A linked guardian corrects the child's date of birth. The child must have finished setup. */
    static async setChildDateOfBirth(guardianId: number, childId: number, dateOfBirth: string): Promise<ChildDateOfBirth> {
        await OnboardingMethods.requireActiveLink(guardianId, childId);
        const { rows } = await pool.query<{ date_of_birth: string }>(
            `UPDATE learner_settings
                SET date_of_birth = $2, updated_at = now()
              WHERE user_id = $1
          RETURNING to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth`,
            [childId, dateOfBirth],
        );
        if (rows.length === 0) throw new ApiError(404, 'this child has not finished learner setup yet');
        return { childId, dateOfBirth: rows[0].date_of_birth };
    }

    /**
     * Saves only the learner's interface language (the older learner-only form of
     * the header's language switch; PUT /api/auth/interface-language serves every
     * role). Setup must have been saved first, because the language lives on that
     * row. The account keeps the same choice, so it is updated in step. A
     * learner of English cannot choose isiZulu (400): their menus stay English.
     */
    static async saveInterfaceLanguage(userId: number, interfaceLanguage: 'english' | 'zulu'): Promise<{ interfaceLanguage: string }> {
        const { rows } = await pool.query<{ interface_language: string | null; target_language: string }>(
            `WITH current AS (
                 SELECT user_id, target_language FROM learner_settings WHERE user_id = $1
             ), setup AS (
                 UPDATE learner_settings s SET interface_language = $2, updated_at = now()
                   FROM current c
                  WHERE s.user_id = c.user_id AND (c.target_language <> 'english' OR $2 = 'english')
              RETURNING s.user_id, s.interface_language
             ), account AS (
                 UPDATE users u SET interface_language = $2
                   FROM setup WHERE u.id = setup.user_id
             )
             SELECT c.target_language, setup.interface_language
               FROM current c LEFT JOIN setup ON setup.user_id = c.user_id`,
            [userId, interfaceLanguage],
        );
        if (rows.length === 0) throw new ApiError(404, 'learner setup must be completed first');
        if (rows[0].interface_language === null) {
            throw new ApiError(400, ENGLISH_LEARNERS_SEE_ENGLISH, [{ field: 'interfaceLanguage', message: ENGLISH_LEARNERS_SEE_ENGLISH }]);
        }
        return { interfaceLanguage: rows[0].interface_language };
    }

    /**
     * Evaluates learner access permissions based on database age records and parent links.
     * Queries PostgreSQL 'learner_settings' for date_of_birth and 'parent_links' for active link status.
     * Returns whether the learner is under 13, has an active parent link, can access content,
     * and their assigned content audience ('child' vs 'general').
     *
     * @param userId - The ID of the authenticated learner
     * @returns The evaluated LearnerAccess status
     */
    static async getAccess(userId: number): Promise<LearnerAccess> {
        // Delegate policy evaluation to the shared implementation used by all content gates.
        return getLearnerAccessForUser(userId);
    }
}

