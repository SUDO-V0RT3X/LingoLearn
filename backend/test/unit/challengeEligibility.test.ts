import { describe, it, expect } from 'vitest';
import { ChallengeEligibility } from '../../src/routes/api/routes.api/progressRoutes/methods/challengeEligibility.js';

const base = { currentLevel: 2, testsPassed: 6, testsRequired: 6, cooldownUntil: null, now: new Date('2026-09-22T12:00:00Z') };

describe('ChallengeEligibility (LIN-72)', () => {
    it('requirement not met blocks eligibility, regardless of cooldown', () => {
        const result = ChallengeEligibility.check({ ...base, testsPassed: 3, cooldownUntil: new Date('2026-09-22T16:00:00Z') });
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('requirement_not_met');
    });

    it('requirement met, no cooldown: eligible', () => {
        const result = ChallengeEligibility.check(base);
        expect(result).toEqual({ eligible: true, reason: null, secondsRemaining: 0 });
    });

    it('requirement met, cooldown still active: blocked with time remaining', () => {
        const cooldownUntil = new Date('2026-09-22T16:00:00Z'); // 4 hours from now
        const result = ChallengeEligibility.check({ ...base, cooldownUntil });
        expect(result.eligible).toBe(false);
        expect(result.reason).toBe('cooldown_active');
        expect(result.secondsRemaining).toBe(4 * 60 * 60);
    });

    it('requirement met, cooldown already expired: eligible', () => {
        const cooldownUntil = new Date('2026-09-22T08:00:00Z'); // 4 hours in the past
        expect(ChallengeEligibility.check({ ...base, cooldownUntil }).eligible).toBe(true);
    });

    it('requirement exactly met at the boundary (testsPassed === testsRequired): eligible', () => {
        expect(ChallengeEligibility.check({ ...base, testsPassed: 6 }).eligible).toBe(true);
        expect(ChallengeEligibility.check({ ...base, testsPassed: 5 }).eligible).toBe(false);
    });

    it('a learner at the top level is never eligible, whatever else is true', () => {
        const result = ChallengeEligibility.check({ ...base, currentLevel: 6, testsPassed: 20 });
        expect(result).toEqual({ eligible: false, reason: 'max_level', secondsRemaining: 0 });
    });

    it('the level below the top can still level up', () => {
        expect(ChallengeEligibility.check({ ...base, currentLevel: 5 }).eligible).toBe(true);
    });
});
