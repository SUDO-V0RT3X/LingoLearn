// The flag rules operate only on report data and do not access any database table.
import type { ReportActivity, ReportFlag } from '../types/childProgressReportType.js';

// Seven days in milliseconds is used by the inactivity comparison.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Which activity a row is a try at: one piece of content, or the challenge to one level. */
function activityKey(item: ReportActivity): string {
    // A challenge has no content, so tries at the same level count as the same activity.
    return item.type === 'challenge' ? `challenge:${item.level}` : `content:${item.contentId}`;
}

/** Returns true when one content item (or one level's challenge) has at least three failed activity rows. */
export function hasRepeatedFail(activity: ReportActivity[]): boolean {
    // Store one failure count for each activity.
    const failuresByContent = new Map<string, number>();
    // Examine every activity supplied to the rule.
    for (const item of activity) {
        // Skip activity rows whose outcome is not failed.
        if (item.outcome !== 'failed') continue;
        // Increment the failure count for this activity.
        const failureCount = (failuresByContent.get(activityKey(item)) ?? 0) + 1;
        // Return true as soon as the count reaches the rule threshold.
        if (failureCount >= 3) return true;
        // Store the updated count for the next matching activity.
        failuresByContent.set(activityKey(item), failureCount);
    }
    // Return false when no content id reaches three failures.
    return false;
}

/** Returns true when no valid activity time falls within the preceding seven days. */
export function isInactive(activity: ReportActivity[], now: Date = new Date()): boolean {
    // Calculate the oldest timestamp that still counts as recent activity.
    const activityCutoff = now.getTime() - SEVEN_DAYS_MS;
    // Search for at least one activity inside the seven-day window.
    const hasRecentActivity = activity.some((item) => {
        // Parse the activity's ISO string into a millisecond timestamp.
        const occurredAt = Date.parse(item.occurredAt);
        // Count only valid timestamps between the cutoff and the supplied current time.
        return Number.isFinite(occurredAt) && occurredAt >= activityCutoff && occurredAt <= now.getTime();
    });
    // Mark the learner inactive when no recent activity was found.
    return !hasRecentActivity;
}

/** Returns true when a recent challenge activity has a failed outcome. */
export function hasChallengeFailure(activity: ReportActivity[]): boolean {
    // Match an activity row that is both a challenge and a failure.
    return activity.some((item) => item.type === 'challenge' && item.outcome === 'failed');
}

/** Returns true when the learner has not been placed yet. */
export function isPlacementUnset(level: number | null): boolean {
    // Compare the supplied level with the contract's unset value.
    return level === null;
}

/** Evaluates each report flag rule and returns the matching code/message pairs. */
export function buildProgressFlags(
    activity: ReportActivity[],
    level: number | null,
    now: Date = new Date(),
): ReportFlag[] {
    // Start with an empty list of matched flags.
    const flags: ReportFlag[] = [];
    // Add the repeated-failure flag when one content id has failed three times.
    if (hasRepeatedFail(activity)) {
        flags.push({ code: 'REPEATED_FAIL', message: 'The same activity has been failed at least three times.' });
    }
    // Add the inactivity flag when the learner has no activity in the last seven days.
    if (isInactive(activity, now)) {
        flags.push({ code: 'INACTIVE', message: 'No learning activity has been recorded in the last 7 days.' });
    }
    // Add the challenge flag when a recent challenge has failed.
    if (hasChallengeFailure(activity)) {
        flags.push({ code: 'CHALLENGE_FAILED', message: 'A recent level-up challenge was failed.' });
    }
    // Add the placement flag when the learner has no level yet.
    if (isPlacementUnset(level)) {
        flags.push({ code: 'PLACEMENT_UNSET', message: 'The placement test has not been taken yet.' });
    }
    // Return the complete list of matched flags.
    return flags;
}

