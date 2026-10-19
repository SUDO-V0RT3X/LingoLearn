import { describe, it, expect } from 'vitest';
import { ChallengeDisplay } from '../challengeDisplay';

describe('ChallengeDisplay.levelLabel', () => {
    it('names a known level with its reference label', () => {
        expect(ChallengeDisplay.levelLabel(2)).toBe('Level 2 · A1+');
        expect(ChallengeDisplay.levelLabel(6)).toBe('Level 6 · C1');
    });

    it('falls back to the number for a level the app does not name', () => {
        expect(ChallengeDisplay.levelLabel(9)).toBe('Level 9');
    });
});

describe('ChallengeDisplay.percent', () => {
    it('nominal: 3 of 6 is 50', () => {
        expect(ChallengeDisplay.percent(3, 6)).toBe(50);
    });

    it('boundary: never above 100 or below 0', () => {
        expect(ChallengeDisplay.percent(9, 6)).toBe(100);
        expect(ChallengeDisplay.percent(-1, 6)).toBe(0);
    });

    it('invalid: an empty whole is 0, not NaN', () => {
        expect(ChallengeDisplay.percent(1, 0)).toBe(0);
    });
});

describe('ChallengeDisplay.secondsUntil', () => {
    const now = new Date('2026-10-19T10:00:00Z').getTime();

    it('nominal: counts whole seconds to the end', () => {
        expect(ChallengeDisplay.secondsUntil('2026-10-19T11:00:00Z', now)).toBe(3600);
    });

    it('boundary: a time already passed is 0', () => {
        expect(ChallengeDisplay.secondsUntil('2026-10-19T09:00:00Z', now)).toBe(0);
    });

    it('invalid: no time or an unreadable one is 0', () => {
        expect(ChallengeDisplay.secondsUntil(null, now)).toBe(0);
        expect(ChallengeDisplay.secondsUntil('soon', now)).toBe(0);
    });
});

describe('ChallengeDisplay answers', () => {
    it('a pick or some typed text counts as answered', () => {
        expect(ChallengeDisplay.isAnswered(0)).toBe(true);
        expect(ChallengeDisplay.isAnswered('sawubona')).toBe(true);
    });

    it('nothing, or only spaces, is not answered', () => {
        expect(ChallengeDisplay.isAnswered(null)).toBe(false);
        expect(ChallengeDisplay.isAnswered(undefined)).toBe(false);
        expect(ChallengeDisplay.isAnswered('   ')).toBe(false);
    });

    it('sends one answer per question, empty ones as null', () => {
        expect(ChallengeDisplay.forSubmission([1, '  ', 'yebo'], 4)).toEqual([1, null, 'yebo', null]);
    });
});
