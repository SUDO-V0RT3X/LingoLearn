// The rules for moving up a level, shared by learner tests (My Learning) and the
// level-up challenge, so both always agree.
import { pool } from '../config/db/db_init.js';

/** Levels run from 1 to 6. */
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 6;

/** Distinct tests a learner must pass at their level before they may take the level-up challenge. */
export const TESTS_REQUIRED_PER_LEVEL = 3;

/** Used when a level has no row in `levels`: the default in 401_level_rules.sql. */
export const DEFAULT_PASS_MARK = 70;

/** How long a learner waits after failing a level-up challenge when nothing else is set. */
export const DEFAULT_CHALLENGE_COOLDOWN_MINUTES = 60;

/**
 * How long a learner waits after failing a level-up challenge, in minutes.
 * CHALLENGE_COOLDOWN_MINUTES in the environment overrides the default; the live
 * demo sets 2 so a failed challenge can be retried during the demonstration.
 */
export function challengeCooldownMinutes(): number {
    const value = Number(process.env.CHALLENGE_COOLDOWN_MINUTES);
    return process.env.CHALLENGE_COOLDOWN_MINUTES?.trim() && Number.isFinite(value) && value >= 0
        ? value
        : DEFAULT_CHALLENGE_COOLDOWN_MINUTES;
}

/** The pass mark, as a percentage, an administrator set for a level (levels.pass_mark). */
export async function passMarkForLevel(level: number): Promise<number> {
    const { rows } = await pool.query<{ pass_mark: number }>(
        'SELECT pass_mark FROM levels WHERE level_number = $1',
        [level],
    );
    return rows[0]?.pass_mark ?? DEFAULT_PASS_MARK;
}

/** The learner's current level, 1 until placement or a challenge sets it. */
export async function currentLevelOf(learnerId: number): Promise<number> {
    const { rows } = await pool.query<{ level_number: number }>(
        'SELECT level_number FROM learner_levels WHERE user_id = $1',
        [learnerId],
    );
    return rows[0]?.level_number ?? MIN_LEVEL;
}

/** How many different tests the learner has passed at a level. Retaking the same test counts once. */
export async function distinctTestsPassedAt(learnerId: number, level: number): Promise<number> {
    const { rows } = await pool.query<{ passed: string }>(
        'SELECT COUNT(DISTINCT content_id) AS passed FROM test_attempts WHERE learner_id = $1 AND level = $2 AND passed',
        [learnerId, level],
    );
    return Number(rows[0]?.passed ?? 0);
}
