// Marks learners' tests and reads back what they have done, over test_attempts.
// Tests and the level-up challenge use the same grader and pass rules.
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { gradeAnswers, questionBlocksOf } from '../../../../../shared/grading.js';
import {
    MAX_LEVEL, TESTS_REQUIRED_PER_LEVEL, currentLevelOf, distinctTestsPassedAt, passMarkForLevel,
} from '../../../../../shared/levelRules.js';
import { ContentMethods } from '../../contentRoutes/methods/contentMethods.js';
import { requireLearnerMayOpen } from '../../contentRoutes/functions/learnerGate.js';
import { ReadingMethods } from '../../readingRoutes/methods/readingMethods.js';
import type { AttemptHistoryRow, MyLearningSummary, TestBestRow, TestResult } from '../types/testAttemptType.js';

const HISTORY_LENGTH = 20;

type AttemptRow = {
    id: number;
    content_id: number;
    title: string;
    level: number;
    score: number;
    total: number;
    percent: number;
    passed: boolean;
    submitted_at: Date;
};

type BestRow = {
    content_id: number;
    title: string;
    level: number;
    best_percent: number;
    passed: boolean;
    attempts: string;
    last_submitted_at: Date;
};

function toBestRow(row: BestRow): TestBestRow {
    return {
        contentId: row.content_id,
        title: row.title,
        level: row.level,
        bestPercent: row.best_percent,
        passed: row.passed,
        attempts: Number(row.attempts),
        lastSubmittedAt: row.last_submitted_at.toISOString(),
    };
}

function toHistoryRow(row: AttemptRow): AttemptHistoryRow {
    return {
        attemptId: row.id,
        contentId: row.content_id,
        title: row.title,
        level: row.level,
        score: row.score,
        total: row.total,
        percent: row.percent,
        passed: row.passed,
        submittedAt: row.submitted_at.toISOString(),
    };
}

export class TestAttemptMethods {
    // Marks one attempt and records it. Content access and answer validation are
    // checked server-side; the answer key is never returned to the learner.
    static async submitTest(learnerId: number, contentId: number, answers: unknown): Promise<TestResult> {
        const content = await ContentMethods.getContent(contentId);
        if (content.status !== 'approved' || content.level === null || content.language === null) {
            throw new ApiError(404, 'content not found');
        }
        const { learnerLevel } = await requireLearnerMayOpen(learnerId, content);

        if (questionBlocksOf(content.content).length === 0) {
            throw new ApiError(400, 'this content has no test');
        }

        const graded = gradeAnswers(content.content, answers);
        const passMark = await passMarkForLevel(content.level);
        const passed = graded.percent >= passMark;
        const { rows } = await pool.query<{ id: number }>(
            `INSERT INTO test_attempts (content_id, learner_id, level, language, answers, total, score, percent, passed)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) RETURNING id`,
            [
                contentId, learnerId, content.level, content.language, JSON.stringify(answers),
                graded.total, graded.score, graded.percent, passed,
            ],
        );

        return {
            attemptId: rows[0].id,
            contentId,
            total: graded.total,
            score: graded.score,
            percent: graded.percent,
            passed,
            passMark,
            countsTowardLevelUp: content.level === learnerLevel && learnerLevel < MAX_LEVEL,
            questions: graded.questions,
        };
    }

    // The learner's level, progress toward the challenge, statistics, history
    // and the content they are part-way through reading.
    //
    // The statistics are all per distinct test, so they describe the same tests:
    // testsCompleted counts the tests tried, testsPassed those passed at least
    // once, and averagePercent is the mean of each test's BEST percent (a retake
    // replaces a weaker score rather than dragging the average down).
    static async getMyLearning(learnerId: number): Promise<MyLearningSummary> {
        const currentLevel = await currentLevelOf(learnerId);
        const testsPassedAtLevel = await distinctTestsPassedAt(learnerId, currentLevel);
        const { rows: [stats] } = await pool.query<{
            completed: string;
            passed: string;
            average: string | null;
        }>(
            `SELECT COUNT(*) AS completed,
                    COUNT(*) FILTER (WHERE passed) AS passed,
                    ROUND(AVG(best_percent)) AS average
               FROM (SELECT content_id, MAX(percent) AS best_percent, BOOL_OR(passed) AS passed
                       FROM test_attempts WHERE learner_id = $1
                      GROUP BY content_id) AS per_test`,
            [learnerId],
        );
        const { rows: history } = await pool.query<AttemptRow>(
            `SELECT a.id, a.content_id, c.title, a.level, a.score, a.total, a.percent, a.passed, a.submitted_at
               FROM test_attempts a
               JOIN content c ON c.id = a.content_id
              WHERE a.learner_id = $1
              ORDER BY a.submitted_at DESC, a.id DESC
              LIMIT $2`,
            [learnerId, HISTORY_LENGTH],
        );
        const { rows: best } = await pool.query<BestRow>(
            `SELECT a.content_id, c.title, MAX(a.level) AS level, MAX(a.percent) AS best_percent,
                    BOOL_OR(a.passed) AS passed, COUNT(*) AS attempts, MAX(a.submitted_at) AS last_submitted_at
               FROM test_attempts a
               JOIN content c ON c.id = a.content_id
              WHERE a.learner_id = $1
              GROUP BY a.content_id, c.title
              ORDER BY last_submitted_at DESC, a.content_id DESC
              LIMIT $2`,
            [learnerId, HISTORY_LENGTH],
        );

        return {
            currentLevel,
            testsPassedAtLevel,
            testsRequired: TESTS_REQUIRED_PER_LEVEL,
            readyForChallenge: testsPassedAtLevel >= TESTS_REQUIRED_PER_LEVEL && currentLevel < MAX_LEVEL,
            testsCompleted: Number(stats?.completed ?? 0),
            testsPassed: Number(stats?.passed ?? 0),
            averagePercent: Number(stats?.average ?? 0),
            history: history.map(toHistoryRow),
            bestResults: best.map(toBestRow),
            continueReading: await ReadingMethods.getContinueReading(learnerId),
        };
    }
}