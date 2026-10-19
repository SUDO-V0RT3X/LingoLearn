// These unit tests exercise each pure child progress flag rule in isolation.
import { describe, expect, it } from 'vitest';
import {
    hasChallengeFailure,
    hasRepeatedFail,
    isInactive,
    isPlacementUnset,
} from '../../src/routes/api/routes.api/authRoutes/methods/childProgressFlagRules.js';
import type { ReportActivity } from '../../src/routes/api/routes.api/authRoutes/types/childProgressReportType.js';

// The fixed current time keeps inactivity boundary checks deterministic.
const NOW = new Date('2026-09-26T12:00:00.000Z');

// This helper creates a complete activity row and replaces fields supplied by a test.
function activity(overrides: Partial<ReportActivity> = {}): ReportActivity {
    // Return a valid completed lesson as the default activity.
    return {
        contentId: 1, // Use one sample content id.
        title: 'Reading practice', // Use one sample title.
        type: 'lesson', // Use a lesson as the default type.
        score: null, // Leave the default lesson unscored.
        outcome: 'completed', // Mark the default lesson completed.
        occurredAt: '2026-09-26T10:00:00.000Z', // Place the default activity inside the seven-day window.
        level: 1, // Use level 1 content.
        ...overrides, // Apply fields specific to the current test.
    };
}

// Group the trigger and non-trigger cases by rule name.
describe('child progress flag rules', () => {
    // Verify the repeated-failure threshold at exactly three matching failures.
    it('triggers REPEATED_FAIL when the same content fails three times', () => {
        // Build three failed rows with the same content id.
        const rows = [1, 2, 3].map(() => activity({ contentId: 42, outcome: 'failed' }));
        // Expect the repeated-failure rule to match.
        expect(hasRepeatedFail(rows)).toBe(true);
    });

    // Verify failures for different content ids are not combined.
    it('does not trigger REPEATED_FAIL for failures on different content', () => {
        // Build three failed rows with three different content ids.
        const rows = [1, 2, 3].map((contentId) => activity({ contentId, outcome: 'failed' }));
        // Expect the repeated-failure rule not to match.
        expect(hasRepeatedFail(rows)).toBe(false);
    });

    // Verify three failed challenges to the same level count as one repeated activity.
    it('triggers REPEATED_FAIL for three failed challenges to the same level, not to different levels', () => {
        // Challenge rows carry their own row id, so only the level ties them together.
        const sameLevel = [1, 2, 3].map((contentId) => activity({ contentId, type: 'challenge', outcome: 'failed', level: 2 }));
        const differentLevels = [2, 3, 4].map((level) => activity({ contentId: 9, type: 'challenge', outcome: 'failed', level }));
        expect(hasRepeatedFail(sameLevel)).toBe(true);
        expect(hasRepeatedFail(differentLevels)).toBe(false);
    });

    // Verify a test and a challenge that happen to share an id are not combined.
    it('does not combine a content id with a challenge row id', () => {
        const rows = [
            activity({ contentId: 5, type: 'test', outcome: 'failed' }),
            activity({ contentId: 5, type: 'test', outcome: 'failed' }),
            activity({ contentId: 5, type: 'challenge', outcome: 'failed', level: 3 }),
        ];
        expect(hasRepeatedFail(rows)).toBe(false);
    });

    // Verify an activity older than seven days triggers inactivity.
    it('triggers INACTIVE when no activity occurred in the last seven days', () => {
        // Build one activity outside the seven-day window.
        const rows = [activity({ occurredAt: '2026-09-18T11:59:59.000Z' })];
        // Expect the inactivity rule to match.
        expect(isInactive(rows, NOW)).toBe(true);
    });

    // Verify a recent activity prevents the inactivity flag.
    it('does not trigger INACTIVE when activity occurred in the last seven days', () => {
        // Build one activity inside the seven-day window.
        const rows = [activity({ occurredAt: '2026-09-25T12:00:00.000Z' })];
        // Expect the inactivity rule not to match.
        expect(isInactive(rows, NOW)).toBe(false);
    });

    // Verify a failed challenge triggers the challenge-failure flag.
    it('triggers CHALLENGE_FAILED for a failed challenge activity', () => {
        // Build one failed challenge row.
        const rows = [activity({ type: 'challenge', outcome: 'failed' })];
        // Expect the challenge-failure rule to match.
        expect(hasChallengeFailure(rows)).toBe(true);
    });

    // Verify a failed ordinary test does not trigger the challenge flag.
    it('does not trigger CHALLENGE_FAILED for a failed test activity', () => {
        // Build one failed test row.
        const rows = [activity({ type: 'test', outcome: 'failed' })];
        // Expect the challenge-failure rule not to match.
        expect(hasChallengeFailure(rows)).toBe(false);
    });

    // Verify a null placement level triggers the unset-placement flag.
    it('triggers PLACEMENT_UNSET when the selected level is null', () => {
        // Pass the contract's unset placement value to the rule.
        expect(isPlacementUnset(null)).toBe(true);
    });

    // Verify a numeric placement level does not trigger the flag.
    it('does not trigger PLACEMENT_UNSET when a level exists', () => {
        // Pass a valid placement level to the rule.
        expect(isPlacementUnset(2)).toBe(false);
    });
});

