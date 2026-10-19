import { beforeEach, describe, expect, it, vi } from 'vitest'; 
// Vitest testing functions: lifecycle hooks, test grouping, assertions, mocking

import { ApiError } from '../../src/shared/errors/ApiError.js'; 
// Custom error class used to represent API errors

import { OnboardingMethods } from '../../src/routes/api/routes.api/onboardingRoutes/methods/onboardingMethods.js'; 
// The module under test: methods for onboarding settings

import { validateOnboardingInput } from '../../src/routes/api/routes.api/onboardingRoutes/types/onboardingType.js'; 
// Function that validates onboarding input payloads

import type { OnboardingInput, OnboardingSettings } from '../../src/routes/api/routes.api/onboardingRoutes/types/onboardingType.js'; 
// Type definitions for input and settings objects

import { makeUser } from '../helpers/fakes.js'; 
// Helper to generate fake user objects for testing

// Mock PostgreSQL so these tests verify the data-access contract without requiring Docker.
const { queryMock } = vi.hoisted(() => ({
    queryMock: vi.fn(), // Create a mock function for database queries
}));

// Replace the real DB pool with our mock
vi.mock('../../src/config/db/db_init.js', () => ({
    pool: { query: queryMock }, // Inject the mock query function into the pool
}));

// Example input the learner would submit
const input: OnboardingInput = {
    // Choose isiZulu as the language whose content the learner plans to study.
    targetLanguage: 'zulu',
    // Supply a valid birth date used by age and access-policy checks.
    dateOfBirth: '2005-01-01',
    // Choose English for controls and instructional copy.
    interfaceLanguage: 'english',
    // Request a fifteen-minute daily learning commitment.
    dailyGoal: 15,
};

// Example row returned from the database
const savedSettings: OnboardingSettings = {
    // Associate the database row with learner ID 7.
    user_id: 7,
    // Return the saved target language from PostgreSQL.
    target_language: 'Zulu',
    // Return the saved interface language from PostgreSQL.
    interface_language: 'English',
    // Return the persisted daily goal in minutes.
    daily_goal: 15,
    // Represent when these preferences were first created.
    created_at: new Date('2026-09-13T08:00:00.000Z'),
    // Represent their most recent saved update.
    updated_at: new Date('2026-09-13T08:00:00.000Z'),
};

describe('OnboardingMethods', () => {
    // Reset the mock before each test so calls don’t leak between tests
    beforeEach(() => {
        queryMock.mockReset();
    });

    it('gets settings for the authenticated learner', async () => {
        // Simulate DB returning a row
        queryMock.mockResolvedValue({ rows: [savedSettings] });

        // Expect the method to resolve with that row
        await expect(OnboardingMethods.getSettings(7)).resolves.toEqual(savedSettings);

        // Verify the query reads the learner's own row, and reads the date as text
        // so a DATE never comes back shifted by the server's timezone.
        const [sql, parameters] = queryMock.mock.calls[0];
        // Bind the lookup to a single user instead of reading another learner's settings.
        expect(sql).toContain('FROM learner_settings WHERE user_id = $1');
        // Keep a PostgreSQL DATE stable as a calendar-date string at the API boundary.
        expect(sql).toContain("to_char(date_of_birth, 'YYYY-MM-DD')");
        expect(parameters).toEqual([7]);
    });

    it('returns 404 when the learner has not completed setup', async () => {
        // Simulate DB returning no rows
        queryMock.mockResolvedValue({ rows: [] });

        const result = OnboardingMethods.getSettings(7);

        // Expect rejection with ApiError
        await expect(result).rejects.toBeInstanceOf(ApiError);

        // And specifically a 404 with a clear message
        await expect(result).rejects.toMatchObject({
            status: 404,
            message: 'onboarding settings not found',
        });
    });

    it('creates settings for a learner and returns the saved row', async () => {
        // Simulate DB returning the saved row after insert
        queryMock.mockResolvedValue({ rows: [savedSettings] });

        // Expect saveSettings to resolve with that row
        await expect(OnboardingMethods.saveSettings(makeUser(7, 'learner'), input))
            .resolves.toEqual(savedSettings);

        // Verify the SQL was an upsert (INSERT ... ON CONFLICT ... UPDATE)
        const [sql, parameters] = queryMock.mock.calls[0];
        // Create a row for first-time setup.
        expect(sql).toContain('INSERT INTO learner_settings');
        // Keep repeat submissions idempotent by updating the existing learner row.
        expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
        // Return the canonical persisted values from the SQL statement.
        expect(sql).toContain('RETURNING');

        // Verify the parameters match the input values
        expect(parameters).toEqual([7, 'zulu', '2005-01-01', 'english', 15]);
    });

    it('updates all setup fields when the learner submits settings again', async () => {
        // Simulate DB returning updated row
        const updatedSettings = {
            ...savedSettings,
            // Change the interface locale: a learner of isiZulu may read isiZulu menus.
            interface_language: 'zulu',
            // Change the daily study goal from the earlier fixture.
            daily_goal: 30,
        };
        queryMock.mockResolvedValue({ rows: [updatedSettings] });

        // Expect saveSettings to resolve with updated row
        await expect(OnboardingMethods.saveSettings(makeUser(7, 'learner'), {
            ...input,
            interfaceLanguage: 'zulu',
            dailyGoal: 30,
        })).resolves.toEqual(updatedSettings);

        // Verify the parameters reflect the updated values
        expect(queryMock.mock.calls[0][1]).toEqual([7, 'zulu', '2005-01-01', 'zulu', 30]);
        // Ensure SQL updates the timestamp and all relevant fields
        // Refresh the modification time whenever preferences are overwritten.
        expect(queryMock.mock.calls[0][0]).toContain('updated_at = now()');
        expect(queryMock.mock.calls[0][0]).toContain('(user_id, target_language, date_of_birth, interface_language, daily_goal)');
    });

    it('stores English as the interface language of a learner of English, whatever was sent', async () => {
        queryMock.mockResolvedValue({ rows: [{ ...savedSettings, target_language: 'english', interface_language: 'english' }] });

        await OnboardingMethods.saveSettings(makeUser(7, 'learner'), {
            ...input,
            targetLanguage: 'english',
            interfaceLanguage: 'zulu',
        });

        // The setup row and the account both get English.
        expect(queryMock.mock.calls[0][1]).toEqual([7, 'english', '2005-01-01', 'english', 15]);
        expect(queryMock.mock.calls[1][1]).toEqual([7, 'english']);
    });

    it('reads a learner of English back with English menus, whatever an older row holds', async () => {
        queryMock.mockResolvedValue({ rows: [savedSettings] });

        await OnboardingMethods.getSettings(7);

        expect(queryMock.mock.calls[0][0]).toContain("CASE WHEN target_language = 'english' THEN 'english' ELSE interface_language END");
    });

    it('keeps settings isolated between users', async () => {
        // Simulate DB returning different rows for different user IDs
        queryMock
            .mockResolvedValueOnce({ rows: [{ ...savedSettings, user_id: 7 }] })
            .mockResolvedValueOnce({ rows: [{ ...savedSettings, user_id: 8, target_language: 'English' }] });

        // Expect each user to get their own settings
        await expect(OnboardingMethods.getSettings(7)).resolves.toMatchObject({ user_id: 7 });
        await expect(OnboardingMethods.getSettings(8)).resolves.toMatchObject({ user_id: 8 });

        // Verify queries were parameterized with correct user IDs
        expect(queryMock.mock.calls[0][1]).toEqual([7]);
        expect(queryMock.mock.calls[1][1]).toEqual([8]);
    });

    it('passes malicious text as a parameter instead of interpolating it into SQL', async () => {
        // Simulate an attempted SQL injection
        const maliciousLanguage = "Zulu'); DROP TABLE learner_settings; --";
        queryMock.mockResolvedValue({ rows: [savedSettings] });

        // Save settings with malicious input
        await OnboardingMethods.saveSettings(makeUser(7, 'learner'), {
            ...input,
            targetLanguage: maliciousLanguage,
        });

        const [sql, parameters] = queryMock.mock.calls[0];
        // Ensure SQL string does not contain the malicious text
        expect(sql).not.toContain(maliciousLanguage);
        // Ensure malicious text is safely passed as a parameter
        expect(parameters).toContain(maliciousLanguage);
    });

    it('propagates database failures to the route error handler', async () => {
        // Simulate DB throwing an error
        const databaseError = new Error('database unavailable');
        queryMock.mockRejectedValue(databaseError);

        // Expect the method to reject with that same error
        await expect(OnboardingMethods.getSettings(7)).rejects.toBe(databaseError);
    });
});

describe('validateOnboardingInput', () => {
    it('accepts a complete valid payload', () => {
        // Valid input should return { valid: true, data: input }
        expect(validateOnboardingInput(input)).toEqual({ valid: true, data: input });
    });

    it('rejects a negative daily goal', () => {
        // Negative dailyGoal should be invalid
        const result = validateOnboardingInput({ ...input, dailyGoal: -1 });

        expect(result).toMatchObject({ valid: false });
        // Do not expose sanitized data when the whole payload is invalid.
        expect(result.valid && result.data).toBeFalsy();
        // Identify the daily goal as the specific input requiring correction.
        if (!result.valid) expect(result.issues).toContainEqual(expect.objectContaining({ field: 'dailyGoal' }));
    });

    it('rejects invalid dates of birth', () => {
        // A date before the supported minimum should be invalid.
        const tooOld = validateOnboardingInput({ ...input, dateOfBirth: '1899-01-01' });
        // A future date should also fail the calendar-boundary validation.
        const tooYoung = validateOnboardingInput({ ...input, dateOfBirth: '2999-01-01' });

        // Confirm both dates are rejected rather than passed to SQL.
        expect(tooOld).toMatchObject({ valid: false });
        expect(tooYoung).toMatchObject({ valid: false });
    });

    it('reports missing fields without throwing', () => {
        // Empty object should report all required fields missing
        const result = validateOnboardingInput({});

        expect(result.valid).toBe(false);
        if (!result.valid) {
            // Report all missing form properties in the request-validation response.
            expect(result.issues.map(issue => issue.field)).toEqual([
                'targetLanguage',
                'dateOfBirth',
                'interfaceLanguage',
                'dailyGoal',
            ]);
        }
    });

    it('rejects non-object payloads safely', () => {
        // Null or non-object payload should be rejected with a clear issue
        expect(validateOnboardingInput(null)).toEqual({
            valid: false,
            issues: [{ field: 'body', message: 'request body must be an object' }],
        });
    });
});
