import type { EligibilityResult } from '../types/progressType.js';
import { MAX_LEVEL } from '../../../../../shared/levelRules.js';

export interface EligibilityInput {
    currentLevel: number;
    testsPassed: number;
    testsRequired: number;
    cooldownUntil: Date | null;
    now: Date;
}

export class ChallengeEligibility {
    /**
     * Decides whether a learner can attempt a level-up challenge right now.
     * Three independent gates, checked in order: is there a level above theirs,
     * has the test requirement at their current level been met, and is there an
     * active cooldown from a recent failed attempt.
     */
    static check({ currentLevel, testsPassed, testsRequired, cooldownUntil, now }: EligibilityInput): EligibilityResult {
        if (currentLevel >= MAX_LEVEL) { //Gate 0
            return { eligible: false, reason: 'max_level', secondsRemaining: 0 };
        }
        if (testsPassed < testsRequired) { //Gate 1
            return { eligible: false, reason: 'requirement_not_met', secondsRemaining: 0 };
        }
        if (cooldownUntil && now < cooldownUntil) { //Gate 2
            return {
                eligible: false,
                reason: 'cooldown_active',
                secondsRemaining: Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000),
            };
        }
        return { eligible: true, reason: null, secondsRemaining: 0 };
    }
}

//GATE 0: a learner at the top level has nowhere to go, whatever else is true.

//GATE 1: checks if the learner has earned the right to attempt the level
//a learner who hasn't met the requirement should never see a cooldown message
//since they were never eligible

//GATE 2: only reached when gate 1 passes, cooldown is null when the learner has never failed
//or their last cooldown has already expired, in either case, the entire block is skipped.
