// The report endpoint accepts the two language codes listed in the feature contract.
export type ReportLanguage = 'en' | 'zu';

// One activity row records a learner interaction returned by the progress slice.
export type ReportActivity = {
    contentId: number; // Identify the lesson, test, or challenge involved in the activity.
    title: string; // Display the content title in the guardian report.
    type: 'lesson' | 'test' | 'challenge'; // Classify the kind of learning activity.
    score: number | null; // Store a numeric score when the activity produces one.
    outcome: 'passed' | 'failed' | 'completed' | 'in_progress'; // Store the activity result.
    occurredAt: string; // Store the activity time as an ISO date string.
    level: number | null; // Store the test's level, or the level a challenge aimed for.
};

// One report flag contains a stable code and guardian-facing description.
export type ReportFlag = {
    code: 'REPEATED_FAIL' | 'INACTIVE' | 'CHALLENGE_FAILED' | 'PLACEMENT_UNSET'; // Identify the matched rule.
    message: string; // Describe the matched rule to the guardian.
};

// The child profile source provides identity and read-only learning preferences.
export type ChildReportProfile = {
    id: number; // Identify the learner account.
    firstName: string; // Display the learner's first name.
    languages: ReportLanguage[]; // List the language the learner is learning.
    activeLanguage: ReportLanguage; // Identify the language the learner is learning.
    lastActiveAt: string | null; // Store the latest known activity time when available.
    childFriendly: boolean; // True when the learner only sees child-friendly content (under 13).
};

// The challenge source returns the values needed for status and level-up progress.
export type ChallengeStatus = {
    eligible: boolean; // State whether the learner can start the challenge.
    testsPassed: number; // Count the tests already passed for the current level.
    testsRequired: number; // Count the tests required before a level-up challenge.
    cooldownEndsAt: string | null; // Store the cooldown end time when one exists.
    atTopLevel: boolean; // True when the learner is at the top level, with no challenge left.
};

// The test summary agrees with the learner's own My learning page.
export type TestSummary = {
    completed: number; // Count the different tests taken.
    avgScore: number | null; // Average of the best score on each test, as on My learning; null before the first.
};

// The report response combines identity, progress, challenge, flag, and setting reads.
export type ChildProgressReport = {
    child: {
        id: number; // Identify the learner shown in the report.
        firstName: string; // Display the learner's first name.
        languages: ReportLanguage[]; // List the language the learner is learning.
        activeLanguage: ReportLanguage; // Identify the language the learner is learning.
        lastActiveAt: string | null; // Display the latest known learner activity time.
    };
    summary: {
        level: number | null; // Display the current level, or null before placement.
        completed: number; // Display the number of different tests taken.
        avgScore: number | null; // Display the average test score when one exists.
        levelUp: {
            testsPassed: number; // Display the passed-test count.
            testsRequired: number; // Display the required-test count.
        };
    };
    challenge: {
        state: 'locked' | 'eligible' | 'cooldown' | 'max_level'; // Display the current challenge state.
        cooldownEndsAt: string | null; // Display the cooldown end time when one exists.
    };
    recentActivity: ReportActivity[]; // Return at most ten activities in newest-first order.
    flags: ReportFlag[]; // Return every flag matched by the pure flag rules.
    settings: {
        childFriendly: boolean; // Display the setting as text on the read-only page.
    };
};

