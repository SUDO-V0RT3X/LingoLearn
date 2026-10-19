// Import testing suite functions and assertions from Vitest
import { describe, expect, it } from 'vitest';
// Import domain utility functions for age calculation and access control evaluation
import { calculateAge, getLearnerAccess, requireChildForNewGuardianLink } from '../../src/shared/learnerAccess.js';

describe('learner access policy', () => {
    // Use the actual current date dynamically so the test passes regardless of when it is run
    const today = new Date();

    it('calculates exact age before and after a birthday', () => {
        // Calculate a birth date exactly 13 years ago from today
        const birthdayToday = new Date(today);
        birthdayToday.setFullYear(today.getFullYear() - 13);

        // Calculate a birth date where the 13th birthday is tomorrow
        const birthdayTomorrow = new Date(birthdayToday);
        birthdayTomorrow.setDate(birthdayToday.getDate() + 1);

        // Learner born tomorrow relative to the current date is still 12
        expect(calculateAge(birthdayTomorrow, today)).toBe(12);
        
        // Learner whose birthday is today has officially reached 13
        expect(calculateAge(birthdayToday, today)).toBe(13);
    });

    it('blocks under-13 learners without an active parent link', () => {
        // Under-13 learners without verified parental consent/linkage must be completely restricted from content
        expect(getLearnerAccess(12, false)).toEqual({
            isUnder13: true,
            hasActiveParentLink: false,
            canAccessContent: false,
            contentAudience: 'child',
        });
    });

    it('allows linked under-13 learners child content only', () => {
        // Under-13 learners with an active parent link can access learning material, but strictly child-filtered content
        expect(getLearnerAccess(12, true)).toMatchObject({
            isUnder13: true,
            canAccessContent: true,
            contentAudience: 'child',
        });
    });

    it('allows adult learners general content without a parent link', () => {
        // Learners age 13 and older do not require parental linkage and receive access to general content
        expect(getLearnerAccess(13, false)).toMatchObject({
            isUnder13: false,
            canAccessContent: true,
            contentAudience: 'general',
        });
    });
});

describe('a new guardian link is only for a child', () => {
    const today = new Date('2026-10-17T12:00:00Z');
    // A stand-in client answering the learner_settings read with one date of birth (or none).
    const settingsWith = (dateOfBirth: string | null) => ({
        query: async () => ({ rows: dateOfBirth ? [{ date_of_birth: dateOfBirth }] : [] }),
    }) as unknown as Parameters<typeof requireChildForNewGuardianLink>[0];

    it('allows a learner who is 12, up to the day before their 13th birthday', async () => {
        await expect(requireChildForNewGuardianLink(settingsWith('2014-01-01'), 1, today)).resolves.toBeUndefined();
        await expect(requireChildForNewGuardianLink(settingsWith('2013-10-18'), 1, today)).resolves.toBeUndefined();
    });

    it('refuses a learner on their 13th birthday and after', async () => {
        for (const dateOfBirth of ['2013-10-17', '2004-05-15']) {
            await expect(requireChildForNewGuardianLink(settingsWith(dateOfBirth), 1, today))
                .rejects.toMatchObject({ status: 409, message: 'only a learner under 13 can be linked to a guardian' });
        }
    });

    it('refuses a learner who has not saved a date of birth yet', async () => {
        await expect(requireChildForNewGuardianLink(settingsWith(null), 1, today)).rejects.toMatchObject({ status: 409 });
    });
});
