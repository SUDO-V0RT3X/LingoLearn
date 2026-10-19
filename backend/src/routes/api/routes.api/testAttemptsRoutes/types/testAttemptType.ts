// Shapes sent and returned by the test-attempt routes. Mirrors frontend
// features/learner_experience/models/learnerTypes.ts.
import type { Answer, GradedQuestion } from '../../../../../shared/grading.js';

// What a learner sends to have a test marked: one answer per question block.
export interface SubmitTestInput {
    contentId: number;
    answers: Answer[];
}

// How the server marked one attempt. Says which questions were right, never
// what the right answers were.
export interface TestResult {
    attemptId: number;
    contentId: number;
    total: number;
    score: number;
    percent: number;
    passed: boolean;
    // The pass mark the attempt was judged against, as a percentage.
    passMark: number;
    // Whether a pass on this test counts toward the level-up challenge: the test
    // is at the learner's current level, and there is a level above it. A test
    // below their level is practice.
    countsTowardLevelUp: boolean;
    questions: GradedQuestion[];
}

// One row of the learner's test history.
export interface AttemptHistoryRow {
    attemptId: number;
    contentId: number;
    title: string;
    level: number;
    score: number;
    total: number;
    percent: number;
    passed: boolean;
    submittedAt: string;
}

// One test the learner has taken, however many times: their best result on it.
export interface TestBestRow {
    contentId: number;
    title: string;
    level: number;
    // The highest percent of any attempt.
    bestPercent: number;
    // Passed on at least one attempt.
    passed: boolean;
    attempts: number;
    lastSubmittedAt: string;
}

// Content the learner has started and not reached the last page of.
export interface ContinueReadingRow {
    contentId: number;
    title: string;
    // 0-based page they were last on.
    page: number;
    totalPages: number;
    updatedAt: string;
}

// Everything the My Learning dashboard shows.
export interface MyLearningSummary {
    currentLevel: number;
    // Distinct tests passed at the current level.
    testsPassedAtLevel: number;
    testsRequired: number;
    readyForChallenge: boolean;
    // Distinct tests ever attempted, and ever passed, at any level.
    testsCompleted: number;
    testsPassed: number;
    // The rounded mean of each distinct test's best percent, so it describes the
    // same tests testsCompleted counts. 0 when there are none.
    averagePercent: number;
    // The latest attempts, one row each, newest first.
    history: AttemptHistoryRow[];
    // The latest tests taken, one row per test with its best result, newest first.
    bestResults: TestBestRow[];
    continueReading: ContinueReadingRow[];
}
