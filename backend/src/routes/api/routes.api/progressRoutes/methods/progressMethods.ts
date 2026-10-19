import type { PoolClient } from 'pg';
import type { ChallengeCandidate, ChallengeOutcome, EligibilityReport, SavedChallengeAnswers, StartedChallenge } from '../types/progressType.js';
import type { ContentBlock, ContentPages } from '../../contentRoutes/types/contentType.js';
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { gradeAnswers, questionBlocksOf, type Answer } from '../../../../../shared/grading.js';
import { ANSWER_TOO_LONG, MAX_ANSWER_LENGTH } from '../../../../../shared/answerRules.js';
import { requireLearnerContentAccess } from '../../../../../shared/learnerAccess.js';
import {
    challengeCooldownMinutes, MAX_LEVEL, TESTS_REQUIRED_PER_LEVEL,
    currentLevelOf, distinctTestsPassedAt, passMarkForLevel,
} from '../../../../../shared/levelRules.js';
import { withoutAnswers } from '../../contentRoutes/functions/withholdAnswers.js';
import { ChallengeEligibility } from './challengeEligibility.js';
import { QuestionSelector } from './questionSelector.js';

//What a learner is told when the server refuses to start a challenge.
const REFUSALS: Record<NonNullable<EligibilityReport['reason']>, string> = {
    max_level: 'you are already at the top level',
    requirement_not_met: `pass ${TESTS_REQUIRED_PER_LEVEL} different tests at your level before taking the challenge`,
    cooldown_active: 'you can try the challenge again once your cooldown is over',
};

//One open (started, not submitted) challenge row.
interface OpenChallenge {
    id: number;
    target_level: number;
    questions: ContentBlock[] | null;
    //While open: the answers to the questions the learner has moved past, in order.
    answers: Answer[] | null;
}

//The answers already saved for a challenge, or none: only a list is ever saved.
function savedAnswersOf(answers: unknown): Answer[] {
    return Array.isArray(answers) ? answers as Answer[] : [];
}

//The answers given so far, then the rest from `answers`: an answer the learner
//has moved past cannot be changed, so going back (in another tab, or by
//replaying a request) changes nothing. The challenge only moves forward.
function keepSaved(saved: Answer[], answers: unknown[]): unknown[] {
    return [...saved, ...answers.slice(saved.length)];
}

//Postgres' code for a unique index refusing a second row.
const UNIQUE_VIOLATION = '23505';

//The level-up challenge: eligibility (LIN-45/46), drawing the questions (LIN-47),
//and marking an attempt then moving the learner up or starting a cooldown (LIN-48/49).
//Everything is decided here, on the server; the learner's browser only ever
//sees the questions without their answers, and sends back what was picked.
export class ProgressMethods {
    // The learner's current level (learner_levels, migration 202). A learner with
    // no row yet (never been through placement) is level 1.
    static async getLearnerLevel(learnerId: number): Promise<number> {
        return currentLevelOf(learnerId);
    }

    //LIN-46 The end of the learner's active cooldown, or null when there is none.
    //Level is global, so any failed attempt still cooling down counts.
    static async getActiveCooldown(learnerId: number): Promise<Date | null> {
        const { rows } = await pool.query<{ until: Date | null }>(
            `SELECT MAX(cooldown_until) AS until FROM level_challenges
              WHERE learner_id = $1 AND cooldown_until > now()`,
            [learnerId],
        );
        return rows[0]?.until ?? null;
    }

    //LIN-45/46 Everything the intro screen shows: where the learner is, how far
    //they are toward the challenge, and whether they may take it now.
    static async checkEligibility(learnerId: number, now = new Date()): Promise<EligibilityReport> {
        const currentLevel = await currentLevelOf(learnerId);
        const testsPassed = await distinctTestsPassedAt(learnerId, currentLevel);
        const cooldownUntil = await ProgressMethods.getActiveCooldown(learnerId);
        const decision = ChallengeEligibility.check({
            currentLevel, testsPassed, testsRequired: TESTS_REQUIRED_PER_LEVEL, cooldownUntil, now,
        });
        const targetLevel = currentLevel < MAX_LEVEL ? currentLevel + 1 : null;
        const open = await ProgressMethods.openChallengeOf(pool, learnerId);

        return {
            ...decision,
            currentLevel,
            targetLevel,
            testsPassed,
            testsRequired: TESTS_REQUIRED_PER_LEVEL,
            passMark: targetLevel == null ? null : await passMarkForLevel(targetLevel),
            cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
            cooldownMinutes: challengeCooldownMinutes(),
            inProgress: decision.eligible && open != null && open.target_level === targetLevel,
        };
    }

    //LIN-47 Starts (or resumes) the learner's challenge. Re-checks eligibility here
    //whatever the screen said, draws up to 15 questions from approved content at
    //the next level, keeps them with their answers, and sends them without.
    static async startChallenge(learnerId: number): Promise<StartedChallenge> {
        const access = await requireLearnerContentAccess(learnerId);
        const eligibility = await ProgressMethods.checkEligibility(learnerId);
        const open = await ProgressMethods.openChallengeOf(pool, learnerId);

        // An attempt left open for another level (the learner was placed again
        // since) can never be submitted fairly, so it is dropped.
        if (open && (!eligibility.eligible || open.target_level !== eligibility.targetLevel || !open.questions)) {
            await pool.query(`DELETE FROM level_challenges WHERE id = $1 AND submitted_at IS NULL`, [open.id]);
        } else if (open && open.questions) {
            return ProgressMethods.toStarted(open.id, open.target_level, open.questions, true, savedAnswersOf(open.answers));
        }

        if (!eligibility.eligible || eligibility.targetLevel == null) {
            throw new ApiError(403, REFUSALS[eligibility.reason ?? 'requirement_not_met']);
        }

        const targetLevel = eligibility.targetLevel;
        const language = await ProgressMethods.targetLanguageOf(learnerId);
        const candidates = await ProgressMethods.candidateQuestions(targetLevel, access.contentAudience === 'child');
        const drawn = QuestionSelector.drawForChallenge(candidates, language).map(candidate => candidate.block);

        try {
            const { rows } = await pool.query<{ id: number }>(
                `INSERT INTO level_challenges (learner_id, language, target_level, questions, started_at)
                 VALUES ($1, $2, $3, $4::jsonb, now())
                 RETURNING id`,
                [learnerId, language ?? '', targetLevel, JSON.stringify(drawn)],
            );
            return ProgressMethods.toStarted(rows[0].id, targetLevel, drawn, false, []);
        } catch (e) {
            // Two starts at once (a double click): the other one won, so resume it.
            if ((e as { code?: string }).code !== UNIQUE_VIOLATION) throw e;
            const winner = await ProgressMethods.openChallengeOf(pool, learnerId);
            if (!winner?.questions) throw e;
            return ProgressMethods.toStarted(winner.id, winner.target_level, winner.questions, true, savedAnswersOf(winner.answers));
        }
    }

    //LIN-48/49 Marks a started challenge against the questions the server drew.
    //Only its learner may submit it, and only once. A pass moves the learner up to
    //the target level; a fail starts the cooldown. Both are written in one transaction.
    static async submitChallenge(learnerId: number, challengeId: number, answers: unknown): Promise<ChallengeOutcome> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const challenge = await ProgressMethods.lockOpenChallenge(client, learnerId, challengeId);
            const questions = challenge.questions;
            // Answers already saved on the way through stand as they were given.
            const final = Array.isArray(answers) && answers.length === questions.length
                ? keepSaved(savedAnswersOf(challenge.answers), answers)
                : answers;

            const grade = gradeAnswers([questions], final);
            const passMark = await passMarkForLevel(challenge.target_level);
            const passed = grade.percent >= passMark;

            const newLevel = passed
                ? await ProgressMethods.raiseLevel(client, learnerId, challenge.target_level)
                : await currentLevelOf(learnerId);

            const updated = await client.query<{ cooldown_until: Date | null }>(
                `UPDATE level_challenges
                    SET answers = $2::jsonb, total = $3, correct = $4, score = $5, passed = $6,
                        submitted_at = now(),
                        cooldown_until = CASE WHEN $6 THEN NULL ELSE now() + make_interval(mins => $7) END
                  WHERE id = $1
                  RETURNING cooldown_until`,
                [challengeId, JSON.stringify(final), grade.total, grade.score, grade.percent, passed, challengeCooldownMinutes()],
            );
            await client.query('COMMIT');

            const cooldownUntil = updated.rows[0]?.cooldown_until ?? null;
            return {
                passed,
                score: grade.score,
                total: grade.total,
                percent: grade.percent,
                passMark,
                newLevel,
                cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    //Keeps the answers to the questions the learner has moved past, as they go,
    //so leaving and resuming the challenge picks up at the next question with
    //those answers in place. Nothing is marked here and nothing about the right
    //answers is returned: the server still marks everything on submit.
    //`answers` is the answers so far, in order; ones already saved are kept as
    //they were (forward only), and a shorter list than saved changes nothing.
    static async saveChallengeAnswers(learnerId: number, challengeId: number, answers: unknown): Promise<SavedChallengeAnswers> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const challenge = await ProgressMethods.lockOpenChallenge(client, learnerId, challengeId);
            if (!Array.isArray(answers)) throw new ApiError(400, 'answers must be a list');
            if (answers.length > challenge.questions.length) {
                throw new ApiError(400, `expected at most ${challenge.questions.length} answers, got ${answers.length}`);
            }
            const wellFormed = answers.every(answer =>
                answer === null || typeof answer === 'string' || (typeof answer === 'number' && Number.isInteger(answer)));
            if (!wellFormed) throw new ApiError(400, 'each answer must be a whole number, text, or null');
            if (answers.some(answer => typeof answer === 'string' && answer.length > MAX_ANSWER_LENGTH)) {
                throw new ApiError(400, ANSWER_TOO_LONG);
            }

            const kept = keepSaved(savedAnswersOf(challenge.answers), answers);
            await client.query(
                `UPDATE level_challenges SET answers = $2::jsonb WHERE id = $1 AND submitted_at IS NULL`,
                [challengeId, JSON.stringify(kept)],
            );
            await client.query('COMMIT');
            return { challengeId, answered: kept.length };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    //Locks a challenge for this learner to write to: it must exist, be theirs,
    //be open, and hold its questions.
    private static async lockOpenChallenge(client: PoolClient, learnerId: number, challengeId: number) {
        const { rows } = await client.query<{
            learner_id: number; target_level: number; questions: ContentBlock[] | null; answers: unknown; submitted_at: Date | null;
        }>(
            `SELECT learner_id, target_level, questions, answers, submitted_at
               FROM level_challenges WHERE id = $1 FOR UPDATE`,
            [challengeId],
        );
        const challenge = rows[0];
        if (!challenge) throw new ApiError(404, 'no such challenge');
        if (challenge.learner_id !== learnerId) throw new ApiError(403, 'this challenge belongs to another learner');
        if (challenge.submitted_at != null) throw new ApiError(409, 'this challenge has already been submitted');
        if (!challenge.questions) throw new ApiError(409, 'this challenge cannot be submitted');
        return { ...challenge, questions: challenge.questions };
    }

    // Sets the learner's level to the one they just passed, never above the top
    // level and never down (the same rule as placement's incrementLearnerLevel,
    // but inside the challenge's transaction).
    private static async raiseLevel(client: PoolClient, learnerId: number, targetLevel: number): Promise<number> {
        const { rows } = await client.query<{ level_number: number }>(
            `INSERT INTO learner_levels (user_id, level_number, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (user_id) DO UPDATE SET
                 level_number = GREATEST(learner_levels.level_number, EXCLUDED.level_number),
                 updated_at = now()
             RETURNING level_number`,
            [learnerId, Math.min(targetLevel, MAX_LEVEL)],
        );
        return rows[0].level_number;
    }

    // Every answerable question block in approved content at a level. A child
    // only ever gets questions from child-friendly content.
    private static async candidateQuestions(level: number, childOnly: boolean): Promise<ChallengeCandidate[]> {
        const { rows } = await pool.query<{ id: number; language: string | null; content: ContentPages }>(
            `SELECT id, language, content FROM content
              WHERE status = 'approved' AND level = $1
                AND ($2::boolean IS NOT TRUE OR child_friendly = true)`,
            [level, childOnly],
        );
        return rows.flatMap(row => questionBlocksOf(Array.isArray(row.content) ? row.content : [])
            .map(block => ({ contentId: row.id, language: row.language, block })));
    }

    // The language the learner chose to learn, or null before setup.
    private static async targetLanguageOf(learnerId: number): Promise<string | null> {
        const { rows } = await pool.query<{ target_language: string }>(
            `SELECT target_language FROM learner_settings WHERE user_id = $1`, [learnerId]);
        return rows[0]?.target_language ?? null;
    }

    private static async openChallengeOf(db: Pick<PoolClient, 'query'>, learnerId: number): Promise<OpenChallenge | null> {
        const { rows } = await db.query<OpenChallenge>(
            `SELECT id, target_level, questions, answers FROM level_challenges
              WHERE learner_id = $1 AND submitted_at IS NULL`,
            [learnerId],
        );
        return rows[0] ?? null;
    }

    // The questions as a learner may see them: answers taken out. `answers` are
    // the learner's own answers saved so far (never the right ones).
    private static toStarted(
        challengeId: number, targetLevel: number, questions: ContentBlock[], resumed: boolean, answers: Answer[],
    ): StartedChallenge {
        return { challengeId, targetLevel, questions: withoutAnswers([questions])[0], resumed, answers };
    }
}
