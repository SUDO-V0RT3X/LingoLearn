import type { PoolClient } from 'pg';
import { pool } from '../config/db/db_init.js';
import { ApiError } from './errors/ApiError.js';

/**
 * Defines the content restriction level for the user.
 * 'child' restricts content to age-appropriate materials.
 */
export type ContentAudience = 'child' | 'general';

/**
 * The two refusals a learner can meet before content. The messages are part of
 * the API: the frontend tells them apart to send the learner to setup or to the
 * parent-link screen, so change them only together with the client.
 */
export const LEARNER_SETUP_REQUIRED = 'learner setup must be completed before accessing content';
export const PARENT_LINK_REQUIRED = 'an active parent link is required before accessing content';

/**
 * The refusal for a new guardian link to a learner who is not a child. The
 * frontend translates it, so change it only together with the client.
 */
export const GUARDIAN_LINK_CHILD_ONLY = 'only a learner under 13 can be linked to a guardian';

/**
 * A learner may have several guardians (two parents, a grandparent, a carer),
 * up to this many active links at once.
 */
export const MAX_ACTIVE_GUARDIANS = 4;

/**
 * The refusal for one guardian link too many. The frontend translates it, so
 * change it only together with the client.
 */
export const GUARDIAN_LIMIT_REACHED = `a learner can have at most ${MAX_ACTIVE_GUARDIANS} linked guardians`;

/**
 * Represents the calculated access rights and audience classification for a learner.
 */
export type LearnerAccess = {
    isUnder13: boolean;
    hasActiveParentLink: boolean;
    canAccessContent: boolean; // True if >= 13, or if < 13 AND has an active parent link
    contentAudience: ContentAudience;
};

/** 
 * Calculate age from an exact date, including whether this year's birthday has passed. 
 * Uses UTC methods to prevent timezone differences from accidentally shifting the birthdate.
 * 
 * @param dateOfBirth - The user's stored date of birth
 * @param today - The current date (defaults to now)
 * @returns The exact age in years
 */
export function calculateAge(dateOfBirth: Date, today = new Date()): number {
    let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    
    // Check if the current month and day are past the birth month and day
    const birthdayHasPassed =
        today.getUTCMonth() > dateOfBirth.getUTCMonth() ||
        (today.getUTCMonth() === dateOfBirth.getUTCMonth() && today.getUTCDate() >= dateOfBirth.getUTCDate());
    
    // If the birthday hasn't happened yet this year, subtract 1 from the year difference
    if (!birthdayHasPassed) age -= 1;
    
    return age;
}

/**
 * Evaluates a user's access rights based on their age and parental consent status.
 * Enforces COPPA-style rules: users under 13 require parental permission.
 *
 * @param age - The calculated age of the learner
 * @param hasActiveParentLink - Whether a verified parent link exists in the system
 * @returns A populated LearnerAccess object
 */
export function getLearnerAccess(
    age: number,
    hasActiveParentLink: boolean,
): LearnerAccess {
    const isUnder13 = age < 13;
    
    return {
        isUnder13,
        hasActiveParentLink,
        // Access is granted if they are an adult/teen OR if they have parental consent
        canAccessContent: !isUnder13 || hasActiveParentLink,
        // Under 13s are locked to child-safe content, regardless of parent link
        contentAudience: isUnder13 ? 'child' : 'general',
    };
}

/**
 * A guardian link exists to protect a child, so a NEW link (a learner's code,
 * a guardian redeeming it, an administrator adding or moving one) is only made
 * for a learner who has finished setup and is under 13 today. A learner with
 * no date of birth yet is refused too: until setup says so, they are not known
 * to be a child. A link made before the learner turned 13 is not touched here;
 * it stays in place until an administrator ends it.
 *
 * Runs on the caller's client, so the check sits inside its transaction.
 *
 * @param db - The pool or the caller's transaction client
 * @param learnerId - The learner the new link would be for
 * @throws {ApiError} 409 when the learner is 13 or older, or has no date of birth
 */
export async function requireChildForNewGuardianLink(
    db: Pick<PoolClient, 'query'>,
    learnerId: number,
    today = new Date(),
): Promise<void> {
    const { rows } = await db.query<{ date_of_birth: string }>(
        `SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth
           FROM learner_settings WHERE user_id = $1`,
        [learnerId],
    );
    const dateOfBirth = rows[0]?.date_of_birth;
    if (!dateOfBirth || calculateAge(new Date(`${dateOfBirth}T00:00:00Z`), today) >= 13) {
        throw new ApiError(409, GUARDIAN_LINK_CHILD_ONLY);
    }
}

/**
 * A new guardian link must leave the learner with no more than
 * MAX_ACTIVE_GUARDIANS active links. Links an administrator ended do not count.
 *
 * Runs on the caller's client, so the check sits inside its transaction; the
 * caller holds the learner's row lock, so two links cannot both slip under it.
 *
 * @param db - The pool or the caller's transaction client
 * @param learnerId - The learner the new link would be for
 * @throws {ApiError} 409 when the learner already has the most guardians allowed
 */
export async function requireRoomForAnotherGuardian(
    db: Pick<PoolClient, 'query'>,
    learnerId: number,
): Promise<void> {
    const { rows } = await db.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM parent_child_links WHERE learner_id = $1 AND unlinked_at IS NULL`,
        [learnerId],
    );
    if ((rows[0]?.count ?? 0) >= MAX_ACTIVE_GUARDIANS) {
        throw new ApiError(409, GUARDIAN_LIMIT_REACHED);
    }
}

/**
 * Fetches the user's details from the database and resolves their access permissions.
 *
 * @param userId - The ID of the user requesting access
 * @returns A promise resolving to the user's LearnerAccess profile
 * @throws {ApiError} If the user hasn't completed onboarding (missing date of birth)
 */
export async function getLearnerAccessForUser(userId: number): Promise<LearnerAccess> {
    // Fetch DOB to determine age. This requires the user to have completed the onboarding flow.
    const settingsResult = await pool.query<{ date_of_birth: string }>(
        `SELECT to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth
           FROM learner_settings WHERE user_id = $1`,
        [userId],
    );
    
    // If no settings exist, the user skipped or hasn't finished onboarding. Block access.
    if (settingsResult.rows.length === 0) {
        throw new ApiError(403, LEARNER_SETUP_REQUIRED);
    }

    const settings = settingsResult.rows[0];
    // Parsed as UTC midnight, which is what calculateAge compares against.
    const age = calculateAge(new Date(`${settings.date_of_birth}T00:00:00Z`));
    
    // A row in parent_child_links is the link: the identity slice only writes one
    // when a guardian has redeemed the learner's code. A link an admin has ended
    // keeps its row with unlinked_at set, and no longer counts.
    const parentResult = await pool.query(
        `SELECT 1 FROM parent_child_links WHERE learner_id = $1 AND unlinked_at IS NULL LIMIT 1`,
        [userId],
    );
    
    return getLearnerAccess(age, parentResult.rows.length > 0);
}

/**
 * Guard function to strictly enforce content access rules.
 * Should be used in route controllers before serving any educational content to a user.
 *
 * @param userId - The ID of the user requesting access
 * @returns A promise resolving to the user's LearnerAccess profile if permitted
 * @throws {ApiError} If the user is under 13 and lacks an active parent link
 */
export async function requireLearnerContentAccess(userId: number): Promise<LearnerAccess> {
    const access = await getLearnerAccessForUser(userId);
    
    // Enforce the access flag evaluated in `getLearnerAccess`
    if (!access.canAccessContent) {
        throw new ApiError(403, PARENT_LINK_REQUIRED);
    }
    
    return access;
}