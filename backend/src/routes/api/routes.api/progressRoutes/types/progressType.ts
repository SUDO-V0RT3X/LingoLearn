//every method in progressMethods.ts returns one of these shapes
import type { ContentBlock } from '../../contentRoutes/types/contentType.js';
import type { Answer } from '../../../../../shared/grading.js';

//Why a learner cannot take the level-up challenge right now, checked in this order:
//already at the top level, not enough tests passed at their level, or still
//cooling down after a failed attempt.
export type IneligibleReason = 'max_level' | 'requirement_not_met' | 'cooldown_active';

//The pure decision made by ChallengeEligibility.check. reason is null when eligible.
export interface EligibilityResult {
    eligible: boolean;
    reason: IneligibleReason | null;
    secondsRemaining: number;
}

//What GET /api/progress/checkEligibility reports: everything the intro screen shows.
export interface EligibilityReport extends EligibilityResult {
    currentLevel: number;
    //null once the learner is at the top level.
    targetLevel: number | null;
    testsPassed: number;
    testsRequired: number;
    //The score (%) needed to pass the next level's challenge (levels.pass_mark); null at the top level.
    passMark: number | null;
    //ISO time the cooldown ends, null when there is none.
    cooldownUntil: string | null;
    //How long a failed challenge locks the learner out, in minutes.
    cooldownMinutes: number;
    //An attempt was started and not yet submitted; starting again resumes it.
    inProgress: boolean;
}

//One question block that could be drawn, with where it came from.
export interface ChallengeCandidate {
    contentId: number;
    language: string | null;
    block: ContentBlock;
}

//What POST /api/progress/startChallenge returns. The questions have their
//answers taken out (withholdAnswers.ts); the server keeps the full copy.
export interface StartedChallenge {
    challengeId: number;
    targetLevel: number;
    questions: ContentBlock[];
    //true when this is an attempt the learner had already started.
    resumed: boolean;
    //The learner's own answers to the questions they had already moved past, in
    //order (empty for a new attempt), so a resumed challenge continues from the
    //next question. Never the right answers.
    answers: Answer[];
}

//What POST /api/progress/saveChallengeAnswers returns: how many questions now
//have a saved answer (the next question is the one at this position).
export interface SavedChallengeAnswers {
    challengeId: number;
    answered: number;
}

//What POST /api/progress/submitChallenge returns once the server has marked it.
export interface ChallengeOutcome {
    passed: boolean;
    score: number;
    total: number;
    percent: number;
    passMark: number;
    //The learner's level after this attempt: targetLevel on a pass, unchanged on a fail.
    newLevel: number;
    //ISO time the learner may try again, null on a pass.
    cooldownUntil: string | null;
}
