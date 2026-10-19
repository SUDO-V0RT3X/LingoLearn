// Mirrors backend progressRoutes/types/progressType.ts.
import type { $ContentBlock } from '@/features/shared/models/contentType';

//Why the learner cannot take the challenge right now.
export type IneligibleReason = 'max_level' | 'requirement_not_met' | 'cooldown_active';

//GET /api/progress/checkEligibility: everything the intro screen shows.
export interface EligibilityReport {
    currentLevel: number;
    //null once the learner is at the top level.
    targetLevel: number | null;
    testsPassed: number;
    testsRequired: number;
    //Score (%) needed to pass the next level's challenge; null at the top level.
    passMark: number | null;
    eligible: boolean;
    reason: IneligibleReason | null;
    //ISO time the cooldown ends, null when there is none.
    cooldownUntil: string | null;
    //How long a failed challenge locks the learner out, in minutes. Older servers leave it out.
    cooldownMinutes?: number;
    secondsRemaining: number;
    //A challenge was started and not submitted; starting again resumes it.
    inProgress: boolean;
}

//One question as the learner receives it: a question block with its answer
//taken out by the server.
export type ChallengeQuestion = $ContentBlock;

//What the learner gives for one question: a position in its options, the text
//typed into the gap, or null when skipped.
export type ChallengeAnswer = number | string | null;

//POST /api/progress/startChallenge
export interface StartedChallenge {
    challengeId: number;
    targetLevel: number;
    questions: ChallengeQuestion[];
    resumed: boolean;
    //The learner's own answers to the questions already moved past, in order:
    //a resumed challenge carries on from the next one. Never the right answers.
    answers: ChallengeAnswer[];
}

//POST /api/progress/saveChallengeAnswers: how many questions have a saved answer.
export interface SavedChallengeAnswers {
    challengeId: number;
    answered: number;
}

//POST /api/progress/submitChallenge: the server's marking.
export interface ChallengeOutcome {
    passed: boolean;
    score: number;
    total: number;
    percent: number;
    passMark: number;
    newLevel: number;
    cooldownUntil: string | null;
}
