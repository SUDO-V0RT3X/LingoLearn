import { afterEach, describe, expect, it } from 'vitest';
import { challengeCooldownMinutes, DEFAULT_CHALLENGE_COOLDOWN_MINUTES } from '../../src/shared/levelRules.js';

// The wait after a failed level-up challenge comes from the environment, so the
// live demo can shorten it without a code change.
describe('challengeCooldownMinutes', () => {
    const saved = process.env.CHALLENGE_COOLDOWN_MINUTES;
    afterEach(() => {
        if (saved === undefined) delete process.env.CHALLENGE_COOLDOWN_MINUTES;
        else process.env.CHALLENGE_COOLDOWN_MINUTES = saved;
    });

    it('nominal: an hour when nothing is set', () => {
        delete process.env.CHALLENGE_COOLDOWN_MINUTES;
        expect(challengeCooldownMinutes()).toBe(DEFAULT_CHALLENGE_COOLDOWN_MINUTES);
        expect(DEFAULT_CHALLENGE_COOLDOWN_MINUTES).toBe(60);
    });

    it('nominal: the environment sets it, e.g. 2 minutes for the demo', () => {
        process.env.CHALLENGE_COOLDOWN_MINUTES = '2';
        expect(challengeCooldownMinutes()).toBe(2);
    });

    it('boundary: 0 turns the wait off', () => {
        process.env.CHALLENGE_COOLDOWN_MINUTES = '0';
        expect(challengeCooldownMinutes()).toBe(0);
    });

    it('invalid input: a blank, negative or non-numeric value falls back to the default', () => {
        for (const value of ['', '  ', '-5', 'soon']) {
            process.env.CHALLENGE_COOLDOWN_MINUTES = value;
            expect(challengeCooldownMinutes()).toBe(DEFAULT_CHALLENGE_COOLDOWN_MINUTES);
        }
    });
});
