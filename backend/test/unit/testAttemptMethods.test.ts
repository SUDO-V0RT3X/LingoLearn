import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    queryMock,
    getContentMock,
    requireLearnerMayOpenMock,
    passMarkForLevelMock,
    currentLevelOfMock,
    distinctTestsPassedAtMock,
    getContinueReadingMock,
} = vi.hoisted(() => ({
    queryMock: vi.fn(),
    getContentMock: vi.fn(),
    requireLearnerMayOpenMock: vi.fn(),
    passMarkForLevelMock: vi.fn(),
    currentLevelOfMock: vi.fn(),
    distinctTestsPassedAtMock: vi.fn(),
    getContinueReadingMock: vi.fn(),
}));

vi.mock('../../src/config/db/db_init.js', () => ({
    pool: { query: queryMock },
}));

vi.mock('../../src/routes/api/routes.api/contentRoutes/methods/contentMethods.js', () => ({
    ContentMethods: { getContent: getContentMock },
}));

vi.mock('../../src/routes/api/routes.api/contentRoutes/functions/learnerGate.js', () => ({
    requireLearnerMayOpen: requireLearnerMayOpenMock,
}));

vi.mock('../../src/shared/levelRules.js', () => ({
    MAX_LEVEL: 6,
    TESTS_REQUIRED_PER_LEVEL: 6,
    currentLevelOf: currentLevelOfMock,
    distinctTestsPassedAt: distinctTestsPassedAtMock,
    passMarkForLevel: passMarkForLevelMock,
}));

vi.mock('../../src/routes/api/routes.api/readingRoutes/methods/readingMethods.js', () => ({
    ReadingMethods: { getContinueReading: getContinueReadingMock },
}));

import { TestAttemptMethods } from '../../src/routes/api/routes.api/testAttemptsRoutes/methods/testAttemptMethods.js';

function question(correctOption = 1) {
    return {
        itemType: 'Multiple Choice',
        value: {
            title: 'Question',
            question: 'What does "Yebo" mean?',
            options: ['No', 'Yes'],
            correctOption,
        },
    };
}

function approvedQuiz(questions = [question(), question()]) {
    return {
        contentId: 2,
        status: 'approved',
        level: 2,
        language: 'zulu',
        content: [[{ itemType: 'Text', value: { title: 'Intro', text: 'Hello' } }, ...questions]],
    };
}

beforeEach(() => {
    queryMock.mockReset();
    getContentMock.mockReset();
    requireLearnerMayOpenMock.mockReset().mockResolvedValue({ access: {}, learnerLevel: 2 });
    passMarkForLevelMock.mockReset().mockResolvedValue(70);
    currentLevelOfMock.mockReset().mockResolvedValue(2);
    distinctTestsPassedAtMock.mockReset().mockResolvedValue(2);
    getContinueReadingMock.mockReset().mockResolvedValue([]);
});

describe('TestAttemptMethods.submitTest', () => {
    it('rejects content that is not approved without writing an attempt', async () => {
        getContentMock.mockResolvedValue({ ...approvedQuiz(), status: 'draft' });

        await expect(TestAttemptMethods.submitTest(1, 2, [1, 1])).rejects.toThrow('content not found');
        expect(queryMock).not.toHaveBeenCalled();
    });

    it('rejects content without questions', async () => {
        getContentMock.mockResolvedValue(approvedQuiz([]));

        await expect(TestAttemptMethods.submitTest(1, 2, [])).rejects.toThrow('this content has no test');
        expect(queryMock).not.toHaveBeenCalled();
    });

    it('validates answer count and answer shape before writing', async () => {
        getContentMock.mockResolvedValue(approvedQuiz());

        await expect(TestAttemptMethods.submitTest(1, 2, [1])).rejects.toThrow('expected 2 answers');
        await expect(TestAttemptMethods.submitTest(1, 2, [1, {}])).rejects.toThrow('each answer must be a whole number');
        expect(queryMock).not.toHaveBeenCalled();
    });

    it('checks learner access, scores the attempt and stores the level-aware result', async () => {
        getContentMock.mockResolvedValue(approvedQuiz());
        queryMock.mockResolvedValue({ rows: [{ id: 7 }] });

        const result = await TestAttemptMethods.submitTest(1, 2, [1, 0]);

        expect(requireLearnerMayOpenMock).toHaveBeenCalledWith(1, expect.objectContaining({ contentId: 2 }));
        expect(passMarkForLevelMock).toHaveBeenCalledWith(2);
        expect(queryMock).toHaveBeenCalledTimes(1);
        expect(queryMock.mock.calls[0][0]).toContain('INSERT INTO test_attempts');
        expect(queryMock.mock.calls[0][1]).toEqual([2, 1, 2, 'zulu', '[1,0]', 2, 1, 50, false]);
        expect(result).toEqual({
            attemptId: 7,
            contentId: 2,
            total: 2,
            score: 1,
            percent: 50,
            passed: false,
            passMark: 70,
            countsTowardLevelUp: true,
            questions: [{ correct: true }, { correct: false }],
        });
    });

    it('a test below the learner\'s level is practice: it does not count toward levelling up', async () => {
        getContentMock.mockResolvedValue(approvedQuiz());
        requireLearnerMayOpenMock.mockResolvedValue({ access: {}, learnerLevel: 3 });
        queryMock.mockResolvedValue({ rows: [{ id: 8 }] });

        const result = await TestAttemptMethods.submitTest(1, 2, [1, 1]);
        expect(result).toMatchObject({ passed: true, countsTowardLevelUp: false });
    });

    it('nothing counts toward levelling up at the top level', async () => {
        getContentMock.mockResolvedValue({ ...approvedQuiz(), level: 6 });
        requireLearnerMayOpenMock.mockResolvedValue({ access: {}, learnerLevel: 6 });
        queryMock.mockResolvedValue({ rows: [{ id: 9 }] });

        expect((await TestAttemptMethods.submitTest(1, 2, [1, 1])).countsTowardLevelUp).toBe(false);
    });
});

describe('TestAttemptMethods.getMyLearning', () => {
    it('combines level progress, statistics, history and continue-reading data', async () => {
        queryMock
            .mockResolvedValueOnce({ rows: [{ completed: '4', passed: '3', average: '75' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: 11,
                    content_id: 2,
                    title: 'Zulu Greetings Quiz',
                    level: 2,
                    score: 4,
                    total: 5,
                    percent: 80,
                    passed: true,
                    submitted_at: new Date('2026-09-26T10:00:00.000Z'),
                }],
            })
            .mockResolvedValueOnce({
                rows: [{
                    content_id: 2,
                    title: 'Zulu Greetings Quiz',
                    level: 2,
                    best_percent: 80,
                    passed: true,
                    attempts: '2',
                    last_submitted_at: new Date('2026-09-26T10:00:00.000Z'),
                }],
            });
        getContinueReadingMock.mockResolvedValue([{
            contentId: 9,
            title: 'A story',
            page: 1,
            totalPages: 3,
            updatedAt: '2026-09-26T10:00:00.000Z',
        }]);

        const result = await TestAttemptMethods.getMyLearning(5);

        // Every statistic is per distinct test: the average is of each test's best percent.
        expect(queryMock.mock.calls[0][0]).toContain('MAX(percent) AS best_percent');
        expect(queryMock.mock.calls[0][0]).toContain('GROUP BY content_id');

        expect(currentLevelOfMock).toHaveBeenCalledWith(5);
        expect(distinctTestsPassedAtMock).toHaveBeenCalledWith(5, 2);
        expect(result).toEqual({
            currentLevel: 2,
            testsPassedAtLevel: 2,
            testsRequired: 6,
            readyForChallenge: false,
            testsCompleted: 4,
            testsPassed: 3,
            averagePercent: 75,
            history: [{
                attemptId: 11,
                contentId: 2,
                title: 'Zulu Greetings Quiz',
                level: 2,
                score: 4,
                total: 5,
                percent: 80,
                passed: true,
                submittedAt: '2026-09-26T10:00:00.000Z',
            }],
            bestResults: [{
                contentId: 2,
                title: 'Zulu Greetings Quiz',
                level: 2,
                bestPercent: 80,
                passed: true,
                attempts: 2,
                lastSubmittedAt: '2026-09-26T10:00:00.000Z',
            }],
            continueReading: [{
                contentId: 9,
                title: 'A story',
                page: 1,
                totalPages: 3,
                updatedAt: '2026-09-26T10:00:00.000Z',
            }],
        });
    });
});
