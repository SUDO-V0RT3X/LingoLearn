// Shapes the learner-experience API sends and returns. Mirrors the backend's
// testAttemptsRoutes/types/testAttemptType.ts and readingRoutes/types/readingType.ts.

//A learner's answer to one question: an option position for the two choice
//types, the typed word for fill in the blank, or null for no answer.
export type $TestAnswer = number | string | null;

//How the server marked one question. Whether it was right, never what was right.
export interface $GradedQuestion {
    correct: boolean;
}

//How the server marked one attempt at a test.
export interface $TestResult {
    attemptId: number;
    contentId: number;
    total: number;
    score: number;
    percent: number;
    passed: boolean;
    //The level's pass mark the attempt was judged against, as a percentage.
    passMark: number;
    //The test is at the learner's current level, so a pass counts toward the
    //level-up challenge. False for practice below their level (or at the top).
    countsTowardLevelUp: boolean;
    questions: $GradedQuestion[];
}

//One row of the learner's test history.
export interface $AttemptHistoryRow {
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

//One test the learner has taken, however many times, with their best result.
export interface $TestBestRow {
    contentId: number;
    title: string;
    level: number;
    bestPercent: number;
    //Passed on at least one attempt.
    passed: boolean;
    attempts: number;
    lastSubmittedAt: string;
}

//Content the learner has started and not finished. page is 0-based.
export interface $ContinueReadingRow {
    contentId: number;
    title: string;
    page: number;
    totalPages: number;
    updatedAt: string;
}

//Everything the My Learning dashboard shows.
export interface $MyLearning {
    currentLevel: number;
    //Distinct tests passed at the current level, toward the level-up challenge.
    testsPassedAtLevel: number;
    testsRequired: number;
    readyForChallenge: boolean;
    //Distinct tests ever attempted and ever passed.
    testsCompleted: number;
    testsPassed: number;
    //The mean of each distinct test's best percent.
    averagePercent: number;
    //The latest attempts, one row each, newest first.
    history: $AttemptHistoryRow[];
    //The latest tests taken, one row per test with its best result.
    bestResults: $TestBestRow[];
    continueReading: $ContinueReadingRow[];
}

//Where a learner is in one piece of content. page is 0-based.
export interface $ReadingProgress {
    page: number;
    totalPages: number;
}

//What the server says about a learner's saved read-aloud recording; the audio
//itself is fetched as a Blob (GET /api/recordings/:contentId).
export interface $SavedRecording {
    contentId: number;
    mimeType: 'audio/webm' | 'audio/ogg' | 'audio/mp4';
    sizeBytes: number;
    updatedAt: string;
}
