// Import Express to construct an isolated API application for each route case.
import express from 'express';
// Import Supertest so requests can be made without opening a network listener.
import request from 'supertest';
// Import test hooks, assertions, and mocked-function helpers from Vitest.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Import the production function that registers placement routes on an app.
import { apply_placement_api_routes } from '../../src/routes/api/routes.api/placementRoutes/placementRoutes.js';
// Import the placement owner so each route's delegation can be verified.
import { PlacementMethods } from '../../src/routes/api/routes.api/placementRoutes/methods/placementMethods.js';
import { ApiError } from '../../src/shared/errors/ApiError.js';

// Mock the PlacementMethods layer to isolate route handling, authorization, and input validation
vi.mock('../../src/routes/api/routes.api/placementRoutes/methods/placementMethods.js', () => ({
    PlacementMethods: {
        startPlacement: vi.fn(),
        submitAnswer: vi.fn(),
        skipPlacement: vi.fn(),
        quitPlacement: vi.fn(),
        getLearnerLevel: vi.fn(),
        getActiveAttempt: vi.fn(),
        incrementLearnerLevel: vi.fn(),
    },
}));

/**
 * Creates a test Express app instance with a simulated authenticated user on res.locals.
 *
 * @param role - The authenticated role (defaults to 'learner')
 * @param id - The authenticated user ID (defaults to 10)
 * @returns Configured Express application instance ready for Supertest requests
 */
function createTestApp(role: 'learner' | 'author' | 'moderator' | 'administrator' = 'learner', id = 10) {
    // Build a fresh Express instance to prevent middleware and route state leaking between tests.
    const app = express();
    // Parse JSON requests just as the production server does before API routing.
    app.use(express.json());

    // Populate simulated session context on res.locals
    // Inject identity and role so RoleGuard sees an authenticated principal.
    app.use((_req, res, next) => {
        res.locals.user = { id, role };
        res.locals.authedUser = { id, role, username: 'test-learner' };
        next();
    });

    // Mount placement routes onto test application
    // Register the real handlers while keeping their methods mocked below.
    apply_placement_api_routes(app);
    // Return the app for Supertest to issue isolated in-process requests.
    return app;
}

describe('Placement API Routes (Unit)', () => {
    beforeEach(() => {
        // Clear mock call history and one-off responses before each route test.
        vi.clearAllMocks();
    });

    describe('POST /api/placement/startPlacement', () => {
        it('refuses entry to non-learner roles with HTTP 403', async () => {
            // Use an author identity to verify the learner-only route guard.
            const app = createTestApp('author');
            // Attempt to start placement with the wrong account role.
            const res = await request(app).post('/api/placement/startPlacement');

            // The request should be forbidden before reaching placement business logic.
            expect(res.status).toBe(403);
            // Confirm the guard prevented any attempt creation call.
            expect(PlacementMethods.startPlacement).not.toHaveBeenCalled();
        });

        it('initializes placement test and returns HTTP 201 with first question', async () => {
            // Model the public response shape returned by a successful start operation.
            const mockStartResponse = {
                attemptId: '11111111-2222-3333-4444-555555555555',
                question: {
                    id: 'q1',
                    section: 'Grammar & Vocabulary',
                    instructions: 'Choose the correct answer below.',
                    type: 'multiple-choice' as const,
                    prompt: 'Hello, my name _____ Alex. What is your name?',
                    options: [{ id: 'b', text: 'is' }],
                },
                totalQuestions: 5,
                questionNumber: 1,
                resumed: false,
            };

            vi.mocked(PlacementMethods.startPlacement).mockResolvedValueOnce(mockStartResponse);

            // Send the request as an authenticated learner with ID 10.
            const app = createTestApp('learner', 10);
            const res = await request(app).post('/api/placement/startPlacement');

            // A newly created attempt should use HTTP 201 and return the method payload.
            expect(res.status).toBe(201);
            expect(res.body).toEqual(mockStartResponse);
            // The handler must use auth context as the learner ID.
            expect(PlacementMethods.startPlacement).toHaveBeenCalledWith(10);
        });

        it('answers 200, not 201, when it continues an unfinished attempt', async () => {
            const resumed = {
                attemptId: '11111111-2222-3333-4444-555555555555',
                question: {
                    id: 'q7', section: 'Grammar & Vocabulary', instructions: 'Choose the correct answer below.',
                    type: 'multiple-choice' as const, prompt: 'An airplane is usually much _____ than a bicycle.',
                    options: [{ id: 'b', text: 'faster' }], level_number: 2,
                },
                totalQuestions: 30,
                questionNumber: 7,
                resumed: true,
            };
            vi.mocked(PlacementMethods.startPlacement).mockResolvedValueOnce(resumed);

            const res = await request(createTestApp('learner', 10)).post('/api/placement/startPlacement');

            expect(res.status).toBe(200);
            expect(res.body).toEqual(resumed);
        });
    });

    describe('GET /api/placement/getActiveAttempt', () => {
        it('nominal: returns the learner\'s unfinished attempt from the placement owner', async () => {
            const attempt = {
                attemptId: '11111111-2222-3333-4444-555555555555',
                question: {
                    id: 'q2', section: 'Grammar & Vocabulary', instructions: 'Choose the correct answer below.',
                    type: 'multiple-choice' as const, prompt: 'What is the opposite of the word "hot"?',
                    options: [{ id: 'c', text: 'cold' }], level_number: 1,
                },
                totalQuestions: 30,
                questionNumber: 2,
                resumed: true,
            };
            vi.mocked(PlacementMethods.getActiveAttempt).mockResolvedValueOnce({ attempt });

            const res = await request(createTestApp('learner', 10)).get('/api/placement/getActiveAttempt');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ attempt });
            expect(PlacementMethods.getActiveAttempt).toHaveBeenCalledWith(10);
        });

        it('boundary: returns { attempt: null } when there is nothing to continue', async () => {
            vi.mocked(PlacementMethods.getActiveAttempt).mockResolvedValueOnce({ attempt: null });

            const res = await request(createTestApp('learner', 10)).get('/api/placement/getActiveAttempt');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ attempt: null });
        });

        it('invalid: passes on the access refusal for a child without a guardian link', async () => {
            vi.mocked(PlacementMethods.getActiveAttempt).mockRejectedValueOnce(
                new ApiError(403, 'an active parent link is required before accessing content'));

            const res = await request(createTestApp('learner', 10)).get('/api/placement/getActiveAttempt');

            expect(res.status).toBe(403);
        });

        it('invalid: rejects non-learners', async () => {
            const res = await request(createTestApp('author')).get('/api/placement/getActiveAttempt');

            expect(res.status).toBe(403);
            expect(PlacementMethods.getActiveAttempt).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/placement/skipPlacement', () => {
        it('accepts an empty JSON object and persists the learner at level 1', async () => {
            const mockSkipResponse = { userId: 10, levelNumber: 1 };
            vi.mocked(PlacementMethods.skipPlacement).mockResolvedValueOnce(mockSkipResponse);

            const app = createTestApp('learner', 10);
            const res = await request(app).post('/api/placement/skipPlacement').send({});

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockSkipResponse);
            expect(PlacementMethods.skipPlacement).toHaveBeenCalledWith(10);
        });

        it('returns the access-policy refusal instead of skipping for a blocked learner', async () => {
            vi.mocked(PlacementMethods.skipPlacement).mockRejectedValueOnce(
                new ApiError(403, 'an active parent link is required before accessing content'),
            );

            const app = createTestApp('learner', 10);
            const res = await request(app).post('/api/placement/skipPlacement').send({});

            expect(res.status).toBe(403);
            expect(PlacementMethods.skipPlacement).toHaveBeenCalledWith(10);
        });
    });

    describe('GET /api/placement/getLearnerLevel', () => {
        it('returns only the authenticated learner level from the placement owner', async () => {
            vi.mocked(PlacementMethods.getLearnerLevel).mockResolvedValueOnce({
                userId: 10,
                levelNumber: 3,
            });

            const app = createTestApp('learner', 10);
            const res = await request(app).get('/api/placement/getLearnerLevel');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ userId: 10, levelNumber: 3 });
            expect(PlacementMethods.getLearnerLevel).toHaveBeenCalledWith(10);
        });

        it('rejects non-learners from reading a learner level', async () => {
            const app = createTestApp('author');
            const res = await request(app).get('/api/placement/getLearnerLevel');

            expect(res.status).toBe(403);
            expect(PlacementMethods.getLearnerLevel).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/placement/submitAnswer/:attemptId', () => {
        const attemptId = '11111111-2222-3333-4444-555555555555';

        it('rejects submissions with missing questionId or answer with HTTP 400', async () => {
            // Build the app once so all malformed payloads use the same learner identity.
            const app = createTestApp('learner', 10);

            // Empty body
            const resEmpty = await request(app)
                .post(`/api/placement/submitAnswer/${attemptId}`)
                .send({});
            expect(resEmpty.status).toBe(400);
            expect(resEmpty.body.error).toBe('Invalid answer submission');
            expect(resEmpty.body.issues).toBeDefined();

            // Missing answer
            const resMissingAns = await request(app)
                .post(`/api/placement/submitAnswer/${attemptId}`)
                .send({ questionId: 'q1' });
            expect(resMissingAns.status).toBe(400);

            // Blank whitespace answer
            const resBlankAns = await request(app)
                .post(`/api/placement/submitAnswer/${attemptId}`)
                .send({ questionId: 'q1', answer: '   ' });
            expect(resBlankAns.status).toBe(400);

            // Invalid payloads must be rejected before server-side grading runs.
            expect(PlacementMethods.submitAnswer).not.toHaveBeenCalled();
        });

        it('grades answer and returns HTTP 200 with progression response', async () => {
            // Model a correct answer that advances to the next question.
            const mockSubmitResponse = {
                correct: true,
                nextQuestion: {
                    id: 'q2',
                    section: 'Grammar & Vocabulary',
                    instructions: 'Choose the correct answer below.',
                    type: 'multiple-choice' as const,
                    prompt: 'She _____ to school every day.',
                    options: [{ id: 'b', text: 'walks' }],
                },
                isComplete: false,
            };

            vi.mocked(PlacementMethods.submitAnswer).mockResolvedValueOnce(mockSubmitResponse);

            // Submit the answer as the learner who owns the attempt.
            const app = createTestApp('learner', 10);
            const res = await request(app)
                .post(`/api/placement/submitAnswer/${attemptId}`)
                .send({ questionId: 'q1', answer: 'b' });

            // Return the grading response and pass the correct authenticated ID and payload.
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockSubmitResponse);
            expect(PlacementMethods.submitAnswer).toHaveBeenCalledWith(10, attemptId, {
                questionId: 'q1',
                answer: 'b',
            });
        });
    });

    describe('POST /api/placement/quitPlacement/:attemptId', () => {
        it('completes the attempt and returns its placement result', async () => {
            // Model a completed attempt whose current tier assigned A2.
            const result = {
                correct: false,
                nextQuestion: null,
                isComplete: true,
                result: { levelNumber: 3, level: 'A2', label: 'Level 3' },
            };
            vi.mocked(PlacementMethods.quitPlacement).mockResolvedValueOnce(result);

            // Quit the specified attempt as its authenticated learner.
            const app = createTestApp('learner', 10);
            const res = await request(app)
                .post('/api/placement/quitPlacement/test-attempt-id');

            // Confirm the route returns the completion payload and passes both IDs correctly.
            expect(res.status).toBe(200);
            expect(res.body).toEqual(result);
            expect(PlacementMethods.quitPlacement).toHaveBeenCalledWith(10, 'test-attempt-id');
        });
    });

    describe('POST /api/placement/incrementLearnerLevel/:userId', () => {
        it('allows administrators to increment a learner through the placement API', async () => {
            // Simulate the next level returned by the placement owner.
            vi.mocked(PlacementMethods.incrementLearnerLevel).mockResolvedValueOnce({
                userId: 42,
                levelNumber: 3,
            });

            // Call the downstream API as an administrator.
            const app = createTestApp('administrator');
            const res = await request(app).post('/api/placement/incrementLearnerLevel/42');

            // Confirm success and verify the requested target learner was passed through.
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ userId: 42, levelNumber: 3 });
            expect(PlacementMethods.incrementLearnerLevel).toHaveBeenCalledWith(42);
        });

        it('prevents learner accounts from directly changing level data', async () => {
            // Use a learner principal to verify writes remain behind the admin API boundary.
            const app = createTestApp('learner');
            const res = await request(app).post('/api/placement/incrementLearnerLevel/42');

            // Deny the request before invoking the increment method.
            expect(res.status).toBe(403);
            expect(PlacementMethods.incrementLearnerLevel).not.toHaveBeenCalled();
        });

        it('rejects malformed learner IDs', async () => {
            // Use an authorized caller but provide a nonnumeric target identifier.
            const app = createTestApp('administrator');
            const res = await request(app).post('/api/placement/incrementLearnerLevel/not-an-id');

            // Validate input before attempting to increment any level record.
            expect(res.status).toBe(400);
            expect(PlacementMethods.incrementLearnerLevel).not.toHaveBeenCalled();
        });
    });
});

