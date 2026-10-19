// These unit tests build the guardian's child report from fake slice services,
// so the combining rules are checked without a database.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    ChallengeStatus,
    ChildReportProfile,
    ReportActivity,
} from '../../src/routes/api/routes.api/authRoutes/types/childProgressReportType.js';

// Hoist the link-check query spy so it exists before Vitest evaluates the mocked module.
const database = vi.hoisted(() => ({ query: vi.fn() }));

// Replace the real PostgreSQL pool: the service itself only checks the guardian link.
vi.mock('../../src/config/db/db_init.js', () => ({ pool: { query: database.query } }));

// Import after declaring the mock so the service receives the fake pool.
import { ChildProgressReportService } from '../../src/routes/api/routes.api/authRoutes/methods/childProgressReportService.js';
import {
    isChildFriendly,
    reportLanguageOf,
    type ChildProgressReportDependencies,
} from '../../src/routes/api/routes.api/authRoutes/methods/childProgressReportDependencies.js';

// The fixed current time keeps the cooldown and inactivity checks deterministic.
const NOW = new Date('2026-10-17T12:00:00.000Z');

const profile: ChildReportProfile = {
    id: 5,
    firstName: 'Young',
    languages: ['zu'],
    activeLanguage: 'zu',
    lastActiveAt: null,
    childFriendly: true,
};

const passedTest: ReportActivity = {
    contentId: 11,
    title: 'Greetings quiz',
    type: 'test',
    score: 100,
    outcome: 'passed',
    occurredAt: '2026-10-16T12:00:00.000Z',
    level: 1,
};

const lockedChallenge: ChallengeStatus = {
    eligible: false, testsPassed: 1, testsRequired: 6, cooldownEndsAt: null, atTopLevel: false,
};

// This helper builds fake dependencies, replacing the parts a test cares about.
function dependencies(over: {
    level?: number | null;
    activity?: ReportActivity[];
    challenge?: ChallengeStatus;
    profile?: ChildReportProfile | null;
} = {}): ChildProgressReportDependencies {
    return {
        childProfiles: { getChildProfile: async () => (over.profile === undefined ? profile : over.profile) },
        levels: { getPlacedLevel: async () => (over.level === undefined ? 1 : over.level) },
        progress: {
            getRecentActivity: async () => over.activity ?? [passedTest],
            getTestSummary: async () => ({ completed: 1, avgScore: 100 }),
        },
        challenges: { getStatus: async () => over.challenge ?? lockedChallenge },
    };
}

beforeEach(() => {
    database.query.mockReset();
    // By default the guardian is linked to the child.
    database.query.mockResolvedValue({ rowCount: 1, rows: [{}] });
});

describe('ChildProgressReportService.generateReport', () => {
    it('combines the level, tests, challenge and activity, with the last activity as last active', async () => {
        const report = await new ChildProgressReportService(dependencies()).generateReport(5, 2, NOW);
        expect(report.summary).toEqual({ level: 1, completed: 1, avgScore: 100, levelUp: { testsPassed: 1, testsRequired: 6 } });
        expect(report.challenge).toEqual({ state: 'locked', cooldownEndsAt: null });
        expect(report.child).toMatchObject({ activeLanguage: 'zu', lastActiveAt: passedTest.occurredAt });
        expect(report.flags).toEqual([]);
        expect(report.settings).toEqual({ childFriendly: true });
        // The link check is bound to both ids, so a guardian only reads their own child.
        expect(database.query).toHaveBeenCalledWith(expect.stringContaining('unlinked_at IS NULL'), [2, 5]);
    });

    it('refuses (403) a guardian who is not actively linked, before reading anything', async () => {
        database.query.mockResolvedValue({ rowCount: 0, rows: [] });
        const getChildProfile = vi.fn();
        const deps = { ...dependencies(), childProfiles: { getChildProfile } };
        await expect(new ChildProgressReportService(deps).generateReport(5, 99, NOW))
            .rejects.toMatchObject({ status: 403, message: 'Access denied' });
        expect(getChildProfile).not.toHaveBeenCalled();
    });

    it('flags a child who has not been placed and has not learned for a week', async () => {
        const report = await new ChildProgressReportService(dependencies({
            level: null,
            activity: [{ ...passedTest, occurredAt: '2026-10-01T12:00:00.000Z' }],
        })).generateReport(5, 2, NOW);
        expect(report.summary.level).toBeNull();
        expect(report.flags.map((flag) => flag.code)).toEqual(['INACTIVE', 'PLACEMENT_UNSET']);
    });

    it('turns the challenge status into eligible, cooldown, or max_level', async () => {
        const build = (challenge: ChallengeStatus) =>
            new ChildProgressReportService(dependencies({ challenge })).generateReport(5, 2, NOW);

        expect((await build({ ...lockedChallenge, eligible: true, testsPassed: 6 })).challenge.state).toBe('eligible');
        const cooling = await build({ ...lockedChallenge, testsPassed: 6, cooldownEndsAt: '2026-10-18T12:00:00.000Z' });
        expect(cooling.challenge).toEqual({ state: 'cooldown', cooldownEndsAt: '2026-10-18T12:00:00.000Z' });
        // A cooldown already over is no cooldown.
        expect((await build({ ...lockedChallenge, cooldownEndsAt: '2026-10-16T12:00:00.000Z' })).challenge.state).toBe('locked');
        expect((await build({ ...lockedChallenge, atTopLevel: true })).challenge.state).toBe('max_level');
    });

    it('returns 404 when the linked account is no longer a learner', async () => {
        await expect(new ChildProgressReportService(dependencies({ profile: null })).generateReport(5, 2, NOW))
            .rejects.toMatchObject({ status: 404 });
    });
});

describe('child report helpers', () => {
    it('child-friendly content is on under 13, off from 13, and on before a date of birth is saved', () => {
        const today = new Date('2026-10-17T00:00:00.000Z');
        expect(isChildFriendly('2017-08-20', today)).toBe(true);
        expect(isChildFriendly('2013-10-17', today)).toBe(false); // 13 today
        expect(isChildFriendly('2013-10-18', today)).toBe(true); // 13 tomorrow
        expect(isChildFriendly(null, today)).toBe(true);
    });

    it('maps the learner\'s target language to the report\'s code', () => {
        expect(reportLanguageOf('zulu')).toBe('zu');
        expect(reportLanguageOf('english')).toBe('en');
        expect(reportLanguageOf(null)).toBe('en');
    });
});
