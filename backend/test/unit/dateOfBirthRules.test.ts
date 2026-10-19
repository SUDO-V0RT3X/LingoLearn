// Unit tests for the two date-of-birth rules: a learner cannot change their own
// date of birth after the first setup save, and only a guardian with an active
// link can change it for them. The database is mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/shared/errors/ApiError.js';
import {
    DATE_OF_BIRTH_LOCKED,
    OnboardingMethods,
} from '../../src/routes/api/routes.api/onboardingRoutes/methods/onboardingMethods.js';
import {
    validateGuardianDateOfBirthInput,
    validateOnboardingInput,
} from '../../src/routes/api/routes.api/onboardingRoutes/types/onboardingType.js';
import { makeUser } from '../helpers/fakes.js';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock('../../src/config/db/db_init.js', () => ({ pool: { query: queryMock } }));

const input = { targetLanguage: 'zulu', dateOfBirth: '2005-01-01', interfaceLanguage: 'english', dailyGoal: 15 };
const savedRow = { user_id: 7, target_language: 'zulu', date_of_birth: '2005-01-01', interface_language: 'english', daily_goal: 15 };

beforeEach(() => {
    queryMock.mockReset();
});

describe('learner saveSettings date-of-birth lock', () => {
    it('nominal: the first save (or a save with the same date) returns the saved row', async () => {
        queryMock.mockResolvedValue({ rows: [savedRow] });

        await expect(OnboardingMethods.saveSettings(makeUser(7, 'learner'), input)).resolves.toEqual(savedRow);
        // The update only happens when the stored date matches the one sent.
        expect(queryMock.mock.calls[0][0]).toContain('WHERE learner_settings.date_of_birth = EXCLUDED.date_of_birth');
    });

    it('invalid: a changed date of birth after the first save is refused with 403', async () => {
        // The guarded upsert updates nothing, so no row comes back.
        queryMock.mockResolvedValue({ rows: [] });

        const result = OnboardingMethods.saveSettings(makeUser(7, 'learner'), { ...input, dateOfBirth: '2015-01-01' });

        await expect(result).rejects.toBeInstanceOf(ApiError);
        await expect(result).rejects.toMatchObject({ status: 403, message: DATE_OF_BIRTH_LOCKED });
        expect(DATE_OF_BIRTH_LOCKED).toBe('only a linked guardian can change your date of birth');
    });
});

describe('guardian date-of-birth change', () => {
    it('nominal: a guardian with an active link changes the child\'s date of birth', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
            .mockResolvedValueOnce({ rows: [{ date_of_birth: '2016-03-04' }] });

        await expect(OnboardingMethods.setChildDateOfBirth(3, 9, '2016-03-04'))
            .resolves.toEqual({ childId: 9, dateOfBirth: '2016-03-04' });
        // The link check binds this guardian and this child, and ignores ended links.
        const [linkSql, linkParams] = queryMock.mock.calls[0];
        expect(linkSql).toContain('unlinked_at IS NULL');
        expect(linkParams).toEqual([3, 9]);
        // The update writes only the child's row.
        expect(queryMock.mock.calls[1][1]).toEqual([9, '2016-03-04']);
    });

    it('invalid: a guardian without an active link is refused with 403 and nothing is written', async () => {
        queryMock.mockResolvedValueOnce({ rows: [] });

        await expect(OnboardingMethods.setChildDateOfBirth(3, 9, '2016-03-04'))
            .rejects.toMatchObject({ status: 403 });
        expect(queryMock).toHaveBeenCalledTimes(1);
    });

    it('boundary: a linked child who has not finished setup gives 404', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
            .mockResolvedValueOnce({ rows: [] });

        await expect(OnboardingMethods.setChildDateOfBirth(3, 9, '2016-03-04'))
            .rejects.toMatchObject({ status: 404 });
    });

    it('nominal: a linked guardian reads the saved date, or null before setup', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
            .mockResolvedValueOnce({ rows: [] });

        await expect(OnboardingMethods.getChildDateOfBirth(3, 9)).resolves.toEqual({ childId: 9, dateOfBirth: null });
    });
});

describe('date-of-birth and language validation', () => {
    it('nominal: a past date is accepted for the guardian change', () => {
        expect(validateGuardianDateOfBirthInput({ dateOfBirth: '2016-03-04' }))
            .toEqual({ valid: true, data: { dateOfBirth: '2016-03-04' } });
    });

    it('boundary: today is accepted, 1900-01-01 is accepted, 1899-12-31 is not', () => {
        const today = new Date().toISOString().slice(0, 10);
        expect(validateGuardianDateOfBirthInput({ dateOfBirth: today }).valid).toBe(true);
        expect(validateGuardianDateOfBirthInput({ dateOfBirth: '1900-01-01' }).valid).toBe(true);
        expect(validateGuardianDateOfBirthInput({ dateOfBirth: '1899-12-31' }).valid).toBe(false);
    });

    it('invalid: missing, future and non-date values are refused the same way as setup', () => {
        for (const body of [{}, { dateOfBirth: '2999-01-01' }, { dateOfBirth: 'soon' }, { dateOfBirth: 20160304 }, null]) {
            expect(validateGuardianDateOfBirthInput(body).valid).toBe(false);
        }
    });

    it('nominal: english and zulu are the target languages on offer, case-insensitively', () => {
        expect(validateOnboardingInput({ ...input, targetLanguage: 'english' }).valid).toBe(true);
        const shouted = validateOnboardingInput({ ...input, targetLanguage: ' Zulu ' });
        expect(shouted.valid && shouted.data.targetLanguage).toBe('zulu');
    });

    it('invalid: any other target language is refused', () => {
        for (const targetLanguage of ['tshivenda', 'es', '', 42]) {
            const result = validateOnboardingInput({ ...input, targetLanguage });
            expect(result.valid).toBe(false);
            if (!result.valid) expect(result.issues[0].field).toBe('targetLanguage');
        }
    });
});
