// The report service combines read-only values from Identity and cross-slice service interfaces.
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import type { ChallengeStatus, ChildProgressReport } from '../types/childProgressReportType.js';
import { buildProgressFlags } from './childProgressFlagRules.js';
import {
    defaultChildProgressReportDependencies,
    type ChildProgressReportDependencies,
} from './childProgressReportDependencies.js';

// The progress source is asked for no more than ten recent activities.
const RECENT_ACTIVITY_LIMIT = 10;

// This helper converts challenge eligibility fields into the report's state value.
function challengeState(
    challenge: ChallengeStatus,
    now: Date,
): ChildProgressReport['challenge']['state'] {
    // Return max_level when there is no level left to climb to.
    if (challenge.atTopLevel) return 'max_level';
    // Parse the cooldown time when the source returned one.
    const cooldownTime = challenge.cooldownEndsAt === null ? Number.NaN : Date.parse(challenge.cooldownEndsAt);
    // Return cooldown while a valid cooldown timestamp remains in the future.
    if (Number.isFinite(cooldownTime) && cooldownTime > now.getTime()) return 'cooldown';
    // Return eligible when the source marks the challenge available.
    if (challenge.eligible) return 'eligible';
    // Return locked for every remaining status.
    return 'locked';
}

// This class verifies the guardian link and aggregates the report response.
export class ChildProgressReportService {
    // Store the read-only dependency implementations used by this service instance.
    constructor(private readonly dependencies: ChildProgressReportDependencies = defaultChildProgressReportDependencies) {}

    /** Generates a report through the default service instance used by the Express route. */
    static async generateReport(
        childId: number,
        guardianId: number,
        now: Date = new Date(),
    ): Promise<ChildProgressReport> {
        // Forward the request to the default instance so callers can use the repo's static method pattern.
        return childProgressReportService.generateReport(childId, guardianId, now);
    }

    /**
     * Generates one linked learner report. A learner has one level across
     * languages, and My learning counts every test, so the report covers all of
     * the child's learning, whatever language it was in.
     */
    async generateReport(
        childId: number,
        guardianId: number,
        now: Date = new Date(),
    ): Promise<ChildProgressReport> {
        // Query parent_child_links for an active link between this guardian and child.
        const { rowCount } = await pool.query(
            `SELECT 1 FROM parent_child_links WHERE guardian_id = $1 AND learner_id = $2 AND unlinked_at IS NULL`,
            [guardianId, childId],
        );
        // Stop the request when the guardian is not linked to the learner.
        if (rowCount === 0) throw new ApiError(403, 'Access denied');

        // Read the child identity and preference fields through the profile interface.
        const profile = await this.dependencies.childProfiles.getChildProfile(childId);
        // Stop when the linked user no longer resolves to a learner profile.
        if (!profile) throw new ApiError(404, 'Child not found');
        // Read the level, progress summary, challenge status, and activity values concurrently.
        const [level, activityRows, tests, challenge] = await Promise.all([
            this.dependencies.levels.getPlacedLevel(childId),
            this.dependencies.progress.getRecentActivity(childId, RECENT_ACTIVITY_LIMIT),
            this.dependencies.progress.getTestSummary(childId),
            this.dependencies.challenges.getStatus(childId, now),
        ]);
        // Copy, sort, and limit activity rows so the response is newest first and never exceeds ten rows.
        const recentActivity = [...activityRows]
            .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
            .slice(0, RECENT_ACTIVITY_LIMIT);
        // Use the profile timestamp or the newest returned activity timestamp.
        const lastActiveAt = profile.lastActiveAt ?? recentActivity[0]?.occurredAt ?? null;

        // Return the complete read-only report contract.
        return {
            child: {
                id: profile.id, // Copy the learner id.
                firstName: profile.firstName, // Copy the learner first name.
                languages: profile.languages, // Copy the learner language list.
                activeLanguage: profile.activeLanguage, // Record the language the learner is learning.
                lastActiveAt, // Record the latest known activity time.
            },
            summary: {
                level, // Copy the level, null before placement.
                completed: tests.completed, // Copy the number of different tests taken.
                avgScore: tests.avgScore, // Copy the average test score.
                levelUp: {
                    testsPassed: challenge.testsPassed, // Copy the passed-test count.
                    testsRequired: challenge.testsRequired, // Copy the required-test count.
                },
            },
            challenge: {
                state: challengeState(challenge, now), // Convert eligibility to one state.
                cooldownEndsAt: challenge.cooldownEndsAt, // Copy the cooldown end time.
            },
            recentActivity, // Return the sorted and limited activity rows.
            flags: buildProgressFlags(recentActivity, level, now), // Evaluate each pure report flag rule.
            settings: {
                childFriendly: profile.childFriendly, // Copy the child-friendly setting.
            },
        };
    }
}

// The route uses one service instance configured with the default read-only adapters.
export const childProgressReportService = new ChildProgressReportService();
