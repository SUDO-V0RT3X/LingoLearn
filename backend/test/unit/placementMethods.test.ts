// Import Vitest test utilities for isolated service-method verification.
// `beforeEach` → hook that runs before every test to reset shared state.
// `describe`   → groups related tests under a shared label.
// `expect`     → assertion builder used to check expected outcomes.
// `it`         → declares a single test case.
// `vi`         → Vitest's mocking namespace (mock, spy, clear, etc.).
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Import the public placement calculations and service under test.
import {
    // Pure helper that maps a raw score to an assigned tier number.
    calculateAssignedLevel,
    // Canonical English ladder used to mock database reads.
    DEFAULT_QUESTIONS,
    // Canonical isiZulu ladder, whose stored correct answer is always option 'a'.
    DEFAULT_ZULU_QUESTIONS,
    // Option shuffler and learner-safe projection used when serving questions.
    shuffleOptions,
    toPublicQuestion,
    // Pure helper that maps a tier number to the public CEFR DTO.
    formatPlacementResult,
    // The service class whose static methods are being exercised.
    PlacementMethods,
} from '../../src/routes/api/routes.api/placementRoutes/methods/placementMethods.js';
// Import the mocked database pool so each SQL branch can return controlled rows.
import { pool } from '../../src/config/db/db_init.js';
// Import the learner access module to simulate allowed and refused identities.
import * as learnerAccessModule from '../../src/shared/learnerAccess.js';
// Import the safe route exception used by placement policy failures.
import { ApiError } from '../../src/shared/errors/ApiError.js';

// Mock database pool queries to isolate unit tests from live PostgreSQL instances
// The factory returns a stub `pool` whose `query` is a fresh vi.fn() per test file.
vi.mock('../../src/config/db/db_init.js', () => ({
    // Replace the real pool with a lightweight mock object.
    pool: {
        // Spyable query function that individual tests will program per SQL branch.
        query: vi.fn(),
    },
}));
// Mock learner safety access gate middleware
// The real gate performs DB lookups; here we only care about the allow/deny outcome.
vi.mock('../../src/shared/learnerAccess.js', () => ({
    // Expose a vi.fn() so tests can mockResolvedValue or mockRejectedValue per case.
    requireLearnerContentAccess: vi.fn(),
}));

// Small helper that translates a stubbed SQL string into a fake query result.
// Keeps each test focused on the branch under test instead of repeating SQL matching.
function mockEnglishQuestionQuery(sql: unknown, params: unknown[] = []): { rows: unknown[] } | null {
    // Only handle strings that actually target the English question table.
    if (typeof sql !== 'string' || !sql.includes('FROM placement_questions')) return null;
    // Single-row lookups by id return only the matching canonical question.
    if (sql.includes('WHERE id = $1')) {
        // Filter DEFAULT_QUESTIONS by the bound id parameter.
        return { rows: DEFAULT_QUESTIONS.filter((question) => question.id === params[0]) };
    }
    // Any other SELECT against the table returns the entire canonical ladder.
    return { rows: DEFAULT_QUESTIONS };
}

// Top-level suite grouping every unit test for the placement service.
describe('Placement Methods (Unit)', () => {
    // Reset shared mock state before every test so tests do not leak into each other.
    beforeEach(() => {
        // Clear SQL call history and any mocked return/rejection values.
        vi.clearAllMocks();
    });

    // Sub-suite for the pure `formatPlacementResult` helper.
    describe('formatPlacementResult', () => {
        // Verifies the tier → reference label mapping and the two-skill breakdown shape.
        it('maps levels 1 through 6 to the app scale (A1, A1+, A2, B1, B2, C1) and skill breakdown', () => {
            // Convert Level 1 into its learner-facing A1 result and skill rows.
            const res1 = formatPlacementResult(1);
            expect(res1.levelNumber).toBe(1);
            expect(res1.level).toBe('A1');
            expect(res1.label).toBe('Level 1');
            // The breakdown must mirror the overall tier for both sub-skills.
            expect(res1.breakdown).toEqual([
                { skill: 'Grammar', level: 'A1' },
                { skill: 'Vocabulary', level: 'A1' },
            ]);

            // The same labels Explore, My learning and Level up use (CONTENT_LEVELS on the frontend).
            expect([1, 2, 3, 4, 5, 6].map((level) => formatPlacementResult(level).level))
                .toEqual(['A1', 'A1+', 'A2', 'B1', 'B2', 'C1']);
            expect(formatPlacementResult(2)).toMatchObject({ levelNumber: 2, level: 'A1+', label: 'Level 2' });
            expect(formatPlacementResult(6)).toMatchObject({ levelNumber: 6, level: 'C1', label: 'Level 6' });
        });

        // No result ever uses the old, different scale.
        it('never names a level C2, Mastery, Beginner or Elementary', () => {
            const text = JSON.stringify([1, 2, 3, 4, 5, 6].map(formatPlacementResult));
            expect(text).not.toMatch(/C2|Mastery|Beginner|Elementary|Intermediate|Advanced/);
        });

        // Verifies the defensive fallback branch inside the helper.
        it('falls back to level 1 (A1) for unrecognized level numbers', () => {
            // Pass an unsupported level number to exercise the safe result fallback.
            const resUnknown = formatPlacementResult(99);
            // Unknown internal values must not generate an invalid result.
            expect(resUnknown).toMatchObject({ levelNumber: 1, level: 'A1', label: 'Level 1' });
        });
    });

    // Sub-suite for the pure `calculateAssignedLevel` helper.
    describe('calculateAssignedLevel', () => {
        // Verifies the backwards-compatible 1:1 mapping for tiny fixtures.
        it('preserves legacy mapping when total questions is capped at 5 or fewer', () => {
            // Preserve old score mapping for minimal test ladders used by fixtures.
            expect(calculateAssignedLevel(0, 5)).toBe(1);
            expect(calculateAssignedLevel(1, 5)).toBe(1);
            expect(calculateAssignedLevel(2, 5)).toBe(2);
            expect(calculateAssignedLevel(3, 5)).toBe(3);
            expect(calculateAssignedLevel(4, 5)).toBe(4);
            // A perfect score on the compact fixture caps at tier 5.
            expect(calculateAssignedLevel(5, 5)).toBe(5);
        });

        // Verifies the 5-question milestone boundaries across all six tiers.
        it('assigns each five-question band to its matching level across all six tiers', () => {
            // Verify boundaries where the assigned level advances between adjacent tiers.
            expect(calculateAssignedLevel(4, 30)).toBe(1);
            // First milestone: 5 correct unlocks tier 2.
            expect(calculateAssignedLevel(5, 30)).toBe(2);
            expect(calculateAssignedLevel(9, 30)).toBe(2);
            // Second milestone: 10 correct unlocks tier 3.
            expect(calculateAssignedLevel(10, 30)).toBe(3);
            // Fifth milestone: 24 still sits in tier 5.
            expect(calculateAssignedLevel(24, 30)).toBe(5);
            // Final milestone: 25 correct unlocks tier 6.
            expect(calculateAssignedLevel(25, 30)).toBe(6);
            // Perfect score stays pinned at the top tier.
            expect(calculateAssignedLevel(30, 30)).toBe(6);
        });

        // Verifies milestone behaviour on a 20-question ladder variant.
        it('unlocks the next level every 5 questions for a 20-question test ladder', () => {
            // Level 1 (A1): 0 - 4 questions correct
            expect(calculateAssignedLevel(0, 20)).toBe(1);
            expect(calculateAssignedLevel(3, 20)).toBe(1);
            expect(calculateAssignedLevel(4, 20)).toBe(1);

            // Level 2 (A1+): 5 - 9 questions correct
            expect(calculateAssignedLevel(5, 20)).toBe(2);
            expect(calculateAssignedLevel(8, 20)).toBe(2);
            expect(calculateAssignedLevel(9, 20)).toBe(2);

            // Level 3: 10 - 14 questions correct (Intermediate B1) - unlocked at 10 questions!
            expect(calculateAssignedLevel(10, 20)).toBe(3);
            expect(calculateAssignedLevel(12, 20)).toBe(3);
            expect(calculateAssignedLevel(14, 20)).toBe(3);

            // Level 4: 15 - 19 questions correct (Upper Intermediate B2) - unlocked at 15 questions!
            expect(calculateAssignedLevel(15, 20)).toBe(4);
            expect(calculateAssignedLevel(18, 20)).toBe(4);
            expect(calculateAssignedLevel(19, 20)).toBe(4);

            // Level 5: 20 questions correct (Advanced C1) - unlocked at 20 questions!
            expect(calculateAssignedLevel(20, 20)).toBe(5);

            // Level 6 (C1): 25+ questions correct - extensible when more questions are added to DB
            expect(calculateAssignedLevel(25, 25)).toBe(6);
        });
    });

    // Sub-suite for `PlacementMethods.startPlacement`.
    describe('PlacementMethods.startPlacement', () => {
        // Verifies the child-safety gate short-circuits before any SQL runs.
        it('rejects with HTTP 403 when learner access check fails (e.g. under-13 without guardian)', async () => {
            // Simulate the central access policy rejecting a learner before placement begins.
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockRejectedValueOnce(
                // The exact ApiError shape produced by the real gate on refusal.
                new ApiError(403, 'an active parent link is required before accessing content'),
            );

            // Require the service to propagate the refusal as a route-safe error.
            await expect(PlacementMethods.startPlacement(42)).rejects.toThrow(
                // Assert the exact message so the route layer can map it to a 403 body.
                'an active parent link is required before accessing content',
            );
            // Ensure no database query occurs after the access gate denies entry.
            expect(pool.query).not.toHaveBeenCalled();
        });

        // Verifies the happy path returns a safe question DTO plus the attempt id.
        it('creates an attempt row and returns question 1 with correct_id stripped and 30 total questions', async () => {
            // Allow this learner through the content safety gate.
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValueOnce({
                // Adult learner, so no under-13 flag.
                isUnder13: false,
                // No parent link required for adults.
                hasActiveParentLink: false,
                // Adult learners can access content.
                canAccessContent: true,
                // Audience marker used by downstream content filtering.
                contentAudience: 'general',
            });

            // Mock database returning questions and attempt creation
            vi.mocked(pool.query).mockImplementation(async (sql: any) => {
                // Route SELECTs against the English table through the shared helper.
                const questionRead = mockEnglishQuestionQuery(sql);
                // Return the fake question rows when the SQL matched the helper.
                if (questionRead) return questionRead as any;
                // Simulate a successful attempt insert that returned the new row's id.
                if (typeof sql === 'string' && sql.includes('INSERT INTO placement_attempts')) {
                    return { rows: [{ id: 'test-attempt-uuid' }] } as any;
                }
                // Any other SQL (e.g. learner_settings lookup) returns an empty set.
                return { rows: [] } as any;
            });

            // Invoke the service under test.
            const result = await PlacementMethods.startPlacement(42);

            // Return the database-generated identifier for the persisted session.
            expect(result.attemptId).toBe('test-attempt-uuid');
            // Return the first question from the active ladder.
            expect(result.question.id).toBe('q1');
            // Keep the private answer key exclusively on the server.
            expect(result.question).not.toHaveProperty('correct_id');
            // Supply the level metadata so the frontend can identify the active tier.
            expect(result.question.level_number).toBe(1);
            // Match the six-level ladder's complete question count.
            expect(result.totalQuestions).toBe(30);
        });

        // Verifies the service refuses to fabricate an attempt id when the insert fails.
        it('does not return an unpersisted synthetic attempt when the insert fails', async () => {
            // Make the attempt insert fail to represent a database/schema error.
            vi.mocked(pool.query).mockImplementation(async (sql: any) => {
                // Route the question SELECT through the shared helper.
                const questionRead = mockEnglishQuestionQuery(sql);
                // Return the fake question rows when the SQL matched the helper.
                if (questionRead) return questionRead as any;
                // Simulate the insert failing with a realistic Postgres error message.
                if (typeof sql === 'string' && sql.includes('INSERT INTO placement_attempts')) {
                    throw new Error('column "target_language" does not exist');
                }
                // Any other SQL returns an empty set.
                return { rows: [] } as any;
            });

            // Never fabricate an attempt token that cannot be used by later grading calls.
            await expect(PlacementMethods.startPlacement(42)).rejects.toThrow(
                // Assert the underlying database error surfaces unchanged.
                'column "target_language" does not exist',
            );
        });
    });

    // Carrying on after a reload: an unfinished attempt is continued, never duplicated.
    describe('resuming an unfinished attempt', () => {
        const adult = { isUnder13: false, hasActiveParentLink: false, canAccessContent: true, contentAudience: 'general' as const };

        // Mocks the database with one unfinished attempt (or none) and records attempt inserts.
        function mockDatabase(unfinished: { id: string; current_question_index: number } | null, placed = false) {
            const inserts: unknown[] = [];
            vi.mocked(pool.query).mockImplementation(async (sql: any, params: any = []) => {
                const questionRead = mockEnglishQuestionQuery(sql, params);
                if (questionRead) return questionRead as any;
                if (typeof sql === 'string' && sql.includes('FROM learner_levels')) {
                    return { rows: placed ? [{}] : [], rowCount: placed ? 1 : 0 } as any;
                }
                if (typeof sql === 'string' && sql.includes('completed = false AND target_language')) {
                    return { rows: unfinished ? [unfinished] : [] } as any;
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO placement_attempts')) {
                    inserts.push(params);
                    return { rows: [{ id: 'new-attempt' }] } as any;
                }
                return { rows: [] } as any;
            });
            return inserts;
        }

        it('nominal: Start continues the unfinished attempt at its current question', async () => {
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValue(adult);
            const inserts = mockDatabase({ id: 'open-attempt', current_question_index: 6 });

            const result = await PlacementMethods.startPlacement(42);

            expect(result).toMatchObject({ attemptId: 'open-attempt', questionNumber: 7, totalQuestions: 30, resumed: true });
            expect(result.question.id).toBe('q7');
            expect(result.question).not.toHaveProperty('correct_id');
            expect(inserts).toEqual([]);
        });

        it('nominal: a learner with nothing unfinished gets a new attempt at question 1', async () => {
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValue(adult);
            const inserts = mockDatabase(null);

            const result = await PlacementMethods.startPlacement(42);

            expect(result).toMatchObject({ attemptId: 'new-attempt', questionNumber: 1, resumed: false });
            expect(inserts).toHaveLength(1);
        });

        it('boundary: an attempt pointing past the ladder is not continued', async () => {
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValue(adult);
            const inserts = mockDatabase({ id: 'stale', current_question_index: 99 });

            const result = await PlacementMethods.startPlacement(42);

            expect(result.attemptId).toBe('new-attempt');
            expect(inserts).toHaveLength(1);
        });

        it('nominal: getActiveAttempt returns the unfinished attempt without creating one', async () => {
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValue(adult);
            const inserts = mockDatabase({ id: 'open-attempt', current_question_index: 0 });

            const { attempt } = await PlacementMethods.getActiveAttempt(42);

            expect(attempt).toMatchObject({ attemptId: 'open-attempt', questionNumber: 1, resumed: true });
            expect(attempt?.question).not.toHaveProperty('correct_id');
            expect(inserts).toEqual([]);
        });

        it('boundary: getActiveAttempt is null with nothing unfinished, or once the learner is placed', async () => {
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValue(adult);
            mockDatabase(null);
            expect(await PlacementMethods.getActiveAttempt(42)).toEqual({ attempt: null });

            mockDatabase({ id: 'open-attempt', current_question_index: 3 }, true);
            expect(await PlacementMethods.getActiveAttempt(42)).toEqual({ attempt: null });
        });

        it('invalid: getActiveAttempt applies the access rule before reading anything', async () => {
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockRejectedValueOnce(
                new ApiError(403, 'an active parent link is required before accessing content'),
            );

            await expect(PlacementMethods.getActiveAttempt(42)).rejects.toThrow('an active parent link is required');
            expect(pool.query).not.toHaveBeenCalled();
        });
    });

    // The question banks: each band of five is written for its level, nothing repeats, nothing gives itself away.
    describe('question banks', () => {
        const banks = { english: DEFAULT_QUESTIONS, zulu: DEFAULT_ZULU_QUESTIONS };

        // The full answer text: the option's words for multiple choice, the typed word otherwise.
        function answerText(question: (typeof DEFAULT_QUESTIONS)[number]): string {
            return question.options?.find((option) => option.id === question.correct_id)?.text ?? question.correct_id;
        }

        for (const [language, bank] of Object.entries(banks)) {
            it(`${language}: six levels of five, in order, each id at its own position`, () => {
                expect(bank).toHaveLength(30);
                bank.forEach((question, index) => {
                    expect(question.order_index).toBe(index);
                    expect(question.level_number).toBe(Math.floor(index / 5) + 1);
                    expect(question.id).toBe(`${language === 'zulu' ? 'zq' : 'q'}${index + 1}`);
                });
            });

            it(`${language}: no prompt repeats another`, () => {
                const prompts = bank.map((question) => question.prompt.toLowerCase());
                expect(new Set(prompts).size).toBe(prompts.length);
            });

            it(`${language}: every answer key is one of the options`, () => {
                for (const question of bank.filter((q) => q.type === 'multiple-choice')) {
                    expect(question.options?.map((option) => option.id)).toContain(question.correct_id);
                }
            });

            it(`${language}: no prompt or instruction contains its own answer`, () => {
                const giveaways = bank.filter((question) => {
                    const answer = answerText(question).toLowerCase();
                    // One- and two-letter answers (concords, articles) are parts of other words.
                    if (answer.length < 3) return false;
                    const pattern = new RegExp(`(^|[^\\p{L}])${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u');
                    return pattern.test(question.prompt.toLowerCase()) || pattern.test(question.instructions.toLowerCase());
                });
                expect(giveaways.map((question) => question.id)).toEqual([]);
            });
        }

        it('english: the first question is a beginner one, not the old present-perfect question', () => {
            expect(DEFAULT_QUESTIONS[0].prompt).not.toContain('2019');
            expect(DEFAULT_QUESTIONS.filter((question) => question.prompt.includes('have lived'))).toHaveLength(1);
        });
    });

    // Sub-suite for `PlacementMethods.submitAnswer`.
    describe('PlacementMethods.submitAnswer', () => {
        // Shared attempt id used across the submit tests.
        const attemptId = 'test-attempt-uuid';
        // Shared learner id used across the submit tests.
        const userId = 42;

        // Allow every submit test through the content gate by default.
        beforeEach(() => {
            // Default to an adult learner with content access.
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValue({
                // Not under 13.
                isUnder13: false,
                // No parent link needed.
                hasActiveParentLink: false,
                // Allowed to access content.
                canAccessContent: true,
                // Audience marker.
                contentAudience: 'general',
            });
        });

        // Verifies the ownership guard rejects unknown or foreign attempts.
        it('throws 404 when attempt is not found for user', async () => {
            // Return no row to represent a missing attempt or another learner's attempt.
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

            // Ownership mismatch and absence share a not-found response.
            await expect(
                PlacementMethods.submitAnswer(userId, attemptId, { questionId: 'q1', answer: 'b' }),
            ).rejects.toThrow('placement attempt not found');
        });

        // Verifies the closed-attempt guard rejects duplicate submissions.
        it('throws 400 when attempt has already been completed', async () => {
            // Return a completed attempt to exercise duplicate-submission protection.
            vi.mocked(pool.query).mockResolvedValueOnce({
                rows: [{ id: attemptId, user_id: userId, score: 3, completed: true }],
            } as any);

            // Reject grading instead of changing a result that has already been saved.
            await expect(
                PlacementMethods.submitAnswer(userId, attemptId, { questionId: 'q1', answer: 'b' }),
            ).rejects.toThrow('placement attempt has already been completed');
        });

        // Verifies a correct answer advances the ladder without closing the attempt.
        it('advances to next question when answer is correct', async () => {
            // Attempt active at question 0
            vi.mocked(pool.query).mockImplementation(async (sql: any) => {
                // Route the single-question SELECT through the shared helper.
                const questionRead = mockEnglishQuestionQuery(sql, ['q1']);
                // Return the fake row for q1 when the SQL matched.
                if (questionRead) return questionRead as any;
                // Simulate the attempt SELECT returning an in-flight attempt.
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    return {
                        rows: [{ id: attemptId, user_id: userId, current_question_index: 0, score: 0, completed: false }],
                    } as any;
                }
                // Simulate the optimistic UPDATE succeeding.
                if (typeof sql === 'string' && sql.includes('UPDATE placement_attempts')) {
                    return { rows: [{ id: attemptId }] } as any;
                }
                // Any other SQL returns an empty set.
                return { rows: [] } as any;
            });

            // Submit correct answer 'b' for q1
            // Grade q1 with its correct answer and inspect the progression response.
            const response = await PlacementMethods.submitAnswer(userId, attemptId, {
                questionId: 'q1',
                answer: 'b',
            });

            // Mark the answer correct while leaving the test active.
            expect(response.correct).toBe(true);
            // Confirm a following question was selected.
            expect(response.isComplete).toBe(false);
            // Move the learner to the second ladder question.
            expect(response.nextQuestion?.id).toBe('q2');
            // Never return the answer key in a client-facing question.
            expect(response.nextQuestion).not.toHaveProperty('correct_id');
        });

        // Verifies the ladder-position guard rejects out-of-sync question ids.
        it('rejects an answer for a question other than the attempt current question', async () => {
            vi.mocked(pool.query).mockImplementation(async (sql: any) => {
                // Route the single-question SELECT through the shared helper.
                const questionRead = mockEnglishQuestionQuery(sql, ['q1']);
                // Return the fake row for q1 when the SQL matched.
                if (questionRead) return questionRead as any;
                // Return an attempt that has already advanced past q1.
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    return {
                        rows: [{
                            id: attemptId,
                            user_id: userId,
                            // Attempt expects the next question (index 1).
                            current_question_index: 1,
                            score: 1,
                            completed: false,
                            target_language: 'english',
                        }],
                    } as any;
                }
                // Any other SQL returns an empty set.
                return { rows: [] } as any;
            });

            await expect(
                PlacementMethods.submitAnswer(userId, attemptId, { questionId: 'q1', answer: 'b' }),
            ).rejects.toMatchObject({ status: 409, message: 'answer does not match the current placement question' });
            // Prove the service short-circuited before attempting the UPDATE.
            expect(pool.query).not.toHaveBeenCalledWith(
                expect.stringContaining('UPDATE placement_attempts'),
                expect.anything(),
            );
        });

        // Verifies the attempt's frozen language prevents cross-ladder submissions.
        it('does not let a question ID switch the attempt to another language ladder', async () => {
            vi.mocked(pool.query).mockImplementation(async (sql: any) => {
                // Return an English attempt positioned on question 0.
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    return {
                        rows: [{
                            id: attemptId,
                            user_id: userId,
                            current_question_index: 0,
                            score: 0,
                            completed: false,
                            target_language: 'english',
                        }],
                    } as any;
                }
                // The English table lookup returns nothing for a Zulu id.
                return { rows: [] } as any;
            });

            await expect(
                PlacementMethods.submitAnswer(userId, attemptId, { questionId: 'zq1', answer: 'a' }),
            ).rejects.toMatchObject({ status: 404, message: 'question not found' });
        });

        // Verifies optimistic-concurrency protection against a stale UPDATE.
        it('rejects an out-of-order concurrent update if the attempt position changed', async () => {
            vi.mocked(pool.query).mockImplementation(async (sql: any) => {
                // Route the single-question SELECT through the shared helper.
                const questionRead = mockEnglishQuestionQuery(sql, ['q1']);
                // Return the fake row for q1 when the SQL matched.
                if (questionRead) return questionRead as any;
                // Return an in-flight attempt still on question 0.
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    return {
                        rows: [{ id: attemptId, user_id: userId, current_question_index: 0, score: 0, completed: false }],
                    } as any;
                }
                // Simulate the optimistic UPDATE matching zero rows (row was modified by another writer).
                if (typeof sql === 'string' && sql.includes('UPDATE placement_attempts')) {
                    return { rows: [] } as any;
                }
                // Any other SQL returns an empty set.
                return { rows: [] } as any;
            });

            await expect(
                PlacementMethods.submitAnswer(userId, attemptId, { questionId: 'q1', answer: 'b' }),
            ).rejects.toMatchObject({ status: 409, message: 'placement attempt changed; reload the current question' });
        });

        // Verifies a wrong answer ends the attempt and persists the accumulated score's tier.
        it('terminates test early, assigns level, and updates learner_levels when answer is incorrect', async () => {
            // Capture the persistence level parameter to verify the awarded tier.
            let savedLevel = null;

            vi.mocked(pool.query).mockImplementation(async (sql: any, params: any) => {
                // Route the single-question SELECT through the shared helper for q6.
                const questionRead = mockEnglishQuestionQuery(sql, ['q6']);
                // Return the fake row for q6 when the SQL matched.
                if (questionRead) return questionRead as any;
                // Simulate an attempt that has already answered 5 correct questions.
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    // Learner had successfully answered 5 questions (Level 1 completed -> Level 2 unlocked)
                    return {
                        rows: [{ id: attemptId, user_id: userId, current_question_index: 5, score: 5, completed: false }],
                    } as any;
                }
                // Capture the tier being persisted by the atomic completion CTE.
                if (typeof sql === 'string' && sql.includes('WITH completed_attempt')) {
                    // params[1] is the levelNumber argument to completeAttempt.
                    savedLevel = params[1];
                    // Return a non-empty row so the service does not throw.
                    return { rows: [{ user_id: userId }] } as any;
                }
                // Any other SQL returns an empty set.
                return { rows: [] } as any;
            });

            // Submit incorrect answer for q6
            const response = await PlacementMethods.submitAnswer(userId, attemptId, {
                questionId: 'q6',
                answer: 'wrong-answer',
            });

            // The answer was graded incorrect.
            expect(response.correct).toBe(false);
            // A wrong answer terminates this adaptive attempt immediately.
            expect(response.isComplete).toBe(true);
            // No further question should be sent after an incorrect response.
            expect(response.nextQuestion).toBeNull();
            // The accumulated score of 5 places the learner at tier 2.
            expect(response.result?.level).toBe('A1+'); // Score of 5 places the learner at level 2 (A1+).
            // Prove the same tier was persisted to learner_levels.
            expect(savedLevel).toBe(2);
        });

        // Verifies the perfect-score terminal path assigns the top tier.
        it('completes test with the top level when all 30 questions are answered correctly', async () => {
            // Capture the final level persisted by the complete-ladder path.
            let savedLevel = null;

            vi.mocked(pool.query).mockImplementation(async (sql: any, params: any) => {
                // Route the single-question SELECT through the shared helper for q30.
                const questionRead = mockEnglishQuestionQuery(sql, ['q30']);
                // Return the fake row for q30 when the SQL matched.
                if (questionRead) return questionRead as any;
                // Simulate an attempt that has answered 29 questions correctly.
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    // Learner answered 29 questions and is submitting the final question (index 29).
                    return {
                        rows: [{ id: attemptId, user_id: userId, current_question_index: 29, score: 29, completed: false }],
                    } as any;
                }
                // Capture the final tier being persisted by the atomic completion CTE.
                if (typeof sql === 'string' && sql.includes('WITH completed_attempt')) {
                    // params[1] is the levelNumber argument to completeAttempt.
                    savedLevel = params[1];
                    // Return a non-empty row so the service does not throw.
                    return { rows: [{ user_id: userId }] } as any;
                }
                // Any other SQL returns an empty set.
                return { rows: [] } as any;
            });

            // Submit the correct answer for final question q30.
            const response = await PlacementMethods.submitAnswer(userId, attemptId, {
                questionId: 'q30',
                answer: 'a',
            });

            // The final answer was correct.
            expect(response.correct).toBe(true);
            // The final correct response must close the attempt.
            expect(response.isComplete).toBe(true);
            // Score 30 awards Level 6, labelled C1 on the app's scale.
            expect(response.result?.level).toBe('C1');
            // Prove the top tier was persisted to learner_levels.
            expect(savedLevel).toBe(6);
        });
    });

    // Sub-suite for `PlacementMethods.quitPlacement`.
    describe('PlacementMethods.quitPlacement', () => {
        // Verifies quitting assigns the tier implied by the current unanswered question.
        it('assigns and returns the level of the current unanswered question', async () => {
            // Simulate the persisted attempt currently positioned at Level 2's first item.
            vi.mocked(pool.query).mockImplementation(async (sql: any, params: any = []) => {
                // Route the single-question SELECT through the shared helper using bound params.
                const questionRead = mockEnglishQuestionQuery(sql, params);
                // Return the fake question rows when the SQL matched.
                if (questionRead) return questionRead as any;
                // Simulate the attempt SELECT returning the current ladder position.
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    return {
                        rows: [{
                            id: 'test-attempt-uuid',
                            // Index 5 is the first question of tier 2.
                            current_question_index: 5,
                            completed: false,
                            target_language: 'english',
                        }],
                    } as any;
                }
                // Simulate the atomic completion CTE succeeding.
                if (typeof sql === 'string' && sql.includes('WITH completed_attempt')) {
                    return { rows: [{ user_id: 42 }] } as any;
                }
                // Any other SQL returns an empty set.
                return { rows: [] } as any;
            });

            // Invoke the service under test.
            const result = await PlacementMethods.quitPlacement(42, 'test-attempt-uuid');

            // Return a complete placement result based on the active question's tier.
            expect(result).toMatchObject({
                // No answer was graded, so this is false.
                correct: false,
                // Quit always closes the attempt.
                isComplete: true,
                // The tier is derived from the active question's position.
                result: { levelNumber: 2, level: 'A1+', label: 'Level 2' },
            });
            // Verify the learner-level write uses Level 2 and the authenticated learner ID.
            expect(pool.query).toHaveBeenCalledWith(
                // Match the completion CTE by its distinctive prefix.
                expect.stringContaining('WITH completed_attempt AS'),
                // Bind order: score (null preserves existing), level, attemptId, userId, expectedIndex.
                [null, 2, 'test-attempt-uuid', 42, 5],
            );
        });
    });

    // Sub-suite for `PlacementMethods.incrementLearnerLevel`.
    describe('PlacementMethods.incrementLearnerLevel', () => {
        // Verifies the atomic cap-at-6 behaviour and the returned DTO shape.
        it('increments atomically and caps at Level 6', async () => {
            // Model PostgreSQL returning the capped level after its atomic upsert.
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ level_number: 6 }] } as any);

            // Request one increment through the public owner method.
            const result = await PlacementMethods.incrementLearnerLevel(42);

            // Return the updated target and resulting level to downstream callers.
            expect(result).toEqual({ userId: 42, levelNumber: 6 });
            // Keep the cap inside the SQL expression so concurrent updates remain bounded.
            expect(pool.query).toHaveBeenCalledWith(
                // Assert the LEAST(6, …) clamp is present in the SQL.
                expect.stringContaining('LEAST(6, learner_levels.level_number + 1)'),
                // Only the user id is bound.
                [42],
            );
        });

        // Verifies bad identifiers are rejected before reaching the database.
        it('rejects invalid learner IDs without querying the database', async () => {
            // Reject zero before it can be interpreted as a database user identifier.
            await expect(PlacementMethods.incrementLearnerLevel(0)).rejects.toThrow('invalid learner id');
            // Confirm bad identifiers do not reach any SQL statement.
            expect(pool.query).not.toHaveBeenCalled();
        });
    });

    // Sub-suite for `PlacementMethods.getLearnerLevel`.
    describe('PlacementMethods.getLearnerLevel', () => {
        // Verifies the saved-level read path returns the persisted tier.
        it('returns the saved level through the placement-owned read operation', async () => {
            // Model the level table returning a stored tier of 4.
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ level_number: 4 }] } as any);

            // Assert the service returns the stored tier alongside the requested user id.
            await expect(PlacementMethods.getLearnerLevel(42)).resolves.toEqual({
                userId: 42,
                levelNumber: 4,
                placed: true,
            });
            // Assert the read targets the level table and binds only the user id.
            expect(pool.query).toHaveBeenCalledWith(
                // Match the level-table SELECT by its distinctive column list.
                expect.stringContaining('SELECT level_number FROM learner_levels'),
                // Only the user id is bound.
                [42],
            );
        });

        // Verifies the default-to-1 behaviour for unplaced learners.
        it('returns Level 1 for a learner without a saved placement row', async () => {
            // Model the level table returning no rows for this learner.
            vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

            // The service must substitute the safe default of tier 1.
            await expect(PlacementMethods.getLearnerLevel(42)).resolves.toEqual({
                userId: 42,
                levelNumber: 1,
                placed: false,
            });
        });
    });

    // Sub-suite for `PlacementMethods.skipPlacement`.
    describe('PlacementMethods.skipPlacement', () => {
        // Verifies skipping cannot bypass the same child-safety gate as starting.
        it('enforces the learner content access gate before assigning Level 1', async () => {
            // Simulate the access gate refusing an under-13 learner without a parent link.
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockRejectedValueOnce(
                // The exact ApiError shape produced by the real gate on refusal.
                new ApiError(403, 'an active parent link is required before accessing content'),
            );

            // The refusal must propagate unchanged so the route can return a 403.
            await expect(PlacementMethods.skipPlacement(42)).rejects.toThrow(
                // Assert the exact gate message.
                'an active parent link is required before accessing content',
            );
            // Prove no level write happened because the gate short-circuited first.
            expect(pool.query).not.toHaveBeenCalled();
        });
    });

    // Sub-suite for option order: the stored isiZulu answer is always 'a', so order must not give it away.
    describe('shuffleOptions / toPublicQuestion', () => {
        it('nominal: keeps every option id and text, and leaves the stored list unchanged', () => {
            const options = [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }, { id: 'c', text: 'three' }];
            const shuffled = shuffleOptions(options);
            expect([...shuffled].sort((x, y) => x.id.localeCompare(y.id))).toEqual(options);
            expect(options.map((o) => o.id)).toEqual(['a', 'b', 'c']);
        });

        it('boundary: a single option, or none, stays as it is', () => {
            expect(shuffleOptions([{ id: 'a', text: 'only' }])).toEqual([{ id: 'a', text: 'only' }]);
            expect(shuffleOptions([])).toEqual([]);
        });

        it('nominal: a fixed random source moves option a away from the front', () => {
            const options = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id }));
            // j = 0 on every step swaps each tail element with the head.
            expect(shuffleOptions(options, () => 0).map((o) => o.id)).toEqual(['b', 'c', 'd', 'a']);
        });

        it('serves isiZulu correct answers in varying positions, not always first', () => {
            const multipleChoice = DEFAULT_ZULU_QUESTIONS.filter((q) => q.type === 'multiple-choice');
            // The bank really does store every isiZulu answer as option 'a'.
            expect(multipleChoice.every((q) => q.correct_id === 'a')).toBe(true);

            const positions = new Set<number>();
            for (const question of multipleChoice) {
                const seen = new Set<number>();
                for (let draw = 0; draw < 40; draw += 1) {
                    const served = toPublicQuestion(question);
                    // The answer key is never sent.
                    expect(served).not.toHaveProperty('correct_id');
                    const index = served.options!.findIndex((o) => o.id === question.correct_id);
                    seen.add(index);
                    positions.add(index);
                }
                // 40 draws all at index 0 would happen with probability 4^-40.
                expect([...seen].some((index) => index !== 0)).toBe(true);
            }
            // Across the bank the answer lands in every position.
            expect(positions.size).toBe(4);
        });

        it('grades by option id whatever order the options were shown in', async () => {
            const zuluFirst = DEFAULT_ZULU_QUESTIONS[0];
            vi.mocked(learnerAccessModule.requireLearnerContentAccess).mockResolvedValueOnce({
                isUnder13: false, hasActiveParentLink: false, canAccessContent: true, contentAudience: 'general',
            });
            vi.mocked(pool.query).mockImplementation(async (sql: any) => {
                if (typeof sql === 'string' && sql.includes('FROM zulu_placement_questions')) {
                    return { rows: sql.includes('WHERE id = $1') ? [zuluFirst] : DEFAULT_ZULU_QUESTIONS } as any;
                }
                if (typeof sql === 'string' && sql.includes('FROM placement_attempts')) {
                    return { rows: [{ id: 'z', user_id: 5, current_question_index: 0, score: 0, completed: false, target_language: 'zulu' }] } as any;
                }
                if (typeof sql === 'string' && sql.includes('UPDATE placement_attempts')) return { rows: [{ id: 'z' }] } as any;
                return { rows: [] } as any;
            });

            const response = await PlacementMethods.submitAnswer(5, 'z', { questionId: zuluFirst.id, answer: 'a' });

            expect(response.correct).toBe(true);
            expect(response.nextQuestion?.options?.map((o) => o.id).sort()).toEqual(
                DEFAULT_ZULU_QUESTIONS[1].options?.map((o) => o.id).sort());
        });
    });
});