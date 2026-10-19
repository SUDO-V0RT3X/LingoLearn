// Import Express web framework for assembling test application instances
import express from 'express';
// Import Supertest for executing HTTP requests against Express apps without starting a real server
import request from 'supertest';
// Import Vitest testing primitives, assertion functions, and mocking utilities
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Import route declaration function for onboarding endpoints
import { apply_onboarding_api_routes } from '../../src/routes/api/routes.api/onboardingRoutes/onboardingRoutes.js';
// Import controller/data access layer containing business logic methods
import { OnboardingMethods } from '../../src/routes/api/routes.api/onboardingRoutes/methods/onboardingMethods.js';

// Mock the OnboardingMethods layer to isolate route handling, validation, and authorization logic
vi.mock('../../src/routes/api/routes.api/onboardingRoutes/methods/onboardingMethods.js', () => ({
    OnboardingMethods: {
        getSettings: vi.fn(),
        saveSettings: vi.fn(),
        getAccess: vi.fn(),
    },
}));

/**
 * Factory function to bootstrap a minimal Express application with simulated authentication state.
 *
 * @param role - The user role injected into res.locals.user (defaults to 'learner')
 * @param id - The user ID injected into res.locals.user (defaults to 7)
 * @returns Configured Express application instance ready for Supertest calls
 */
function createTestApp(role: 'learner' | 'author' = 'learner', id = 7) {
    const app = express();
    app.use(express.json());
    
    // Middleware simulating session middleware by populating res.locals.user
    app.use((_req, res, next) => {
        res.locals.user = { id, role };
        next();
    });
    
    // Mount onboarding endpoints onto the test app
    apply_onboarding_api_routes(app);
    return app;
}

// Sample valid payload representing user input from the client setup form
const validInput = {
    targetLanguage: 'zulu',
    dateOfBirth: '2005-01-01',
    interfaceLanguage: 'english',
    dailyGoal: 15,
};

// Sample mock database record returned from persistence layer
const savedRow = {
    user_id: 7,
    target_language: 'zulu',
    interface_language: 'english',
    daily_goal: 15,
};

// Sample mock access status evaluated based on age and parent links
const defaultAccess = {
    isUnder13: false,
    hasActiveParentLink: false,
    canAccessContent: true,
    contentAudience: 'general' as const,
};

// Integration test suite for onboarding API routes
describe('onboarding routes', () => {
    // Clear all invocation counts and mock implementations between test runs
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(OnboardingMethods.getAccess).mockResolvedValue(defaultAccess);
    });

    it('returns settings for the authenticated learner', async () => {
        // Arrange: Mock method returning saved settings for the requesting user
        vi.mocked(OnboardingMethods.getSettings).mockResolvedValue(savedRow as never);

        // Act: Issue GET request to settings endpoint
        const response = await request(createTestApp()).get('/api/onboarding/getSettings');

        // Assert: Expect HTTP 200 OK and valid JSON body containing settings
        expect(response.status).toBe(200);
        expect(response.body).toEqual(savedRow);
        // Verify underlying persistence method was queried with the correct user ID from auth context
        expect(OnboardingMethods.getSettings).toHaveBeenCalledWith(7);
    });

    it('uses the authenticated user ID when saving settings and returns evaluated access', async () => {
        // Arrange: Mock save settings method returning updated database row
        vi.mocked(OnboardingMethods.saveSettings).mockResolvedValue(savedRow as never);

        // Act: Issue PUT request with a specific user ID (42) and valid onboarding payload
        const response = await request(createTestApp('learner', 42))
            .put('/api/onboarding/saveSettings')
            .send(validInput);

        // Assert: Expect HTTP 200 OK and confirm controller received user context and input
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ...savedRow, access: defaultAccess });
        expect(OnboardingMethods.saveSettings).toHaveBeenCalledWith(
            { id: 42, role: 'learner' },
            validInput,
        );
        expect(OnboardingMethods.getAccess).toHaveBeenCalledWith(42);
    });

    it('rejects invalid values before calling persistence', async () => {
        // Act: Send request with out-of-bounds date of birth and negative daily goal
        const response = await request(createTestApp())
            .put('/api/onboarding/saveSettings')
            .send({ ...validInput, dateOfBirth: '1800-01-01', dailyGoal: -5 });

        // Assert: Request should fail validation with HTTP 400 Bad Request
        expect(response.status).toBe(400);
        expect(response.body.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'dateOfBirth' }),
            expect.objectContaining({ field: 'dailyGoal' }),
        ]));
        // Ensure invalid requests never hit backend persistence methods
        expect(OnboardingMethods.saveSettings).not.toHaveBeenCalled();
    });

    it('rejects a non-learner role on settings endpoint', async () => {
        // Act: Issue GET request with user role set to 'author' instead of 'learner'
        const response = await request(createTestApp('author')).get('/api/onboarding/getSettings');

        // Assert: Access control middleware should block request with HTTP 403 Forbidden
        expect(response.status).toBe(403);
        expect(OnboardingMethods.getSettings).not.toHaveBeenCalled();
    });

    it('returns evaluated access status on /api/onboarding/getAccess', async () => {
        // Arrange: Mock access evaluation for user 7
        const under13Access = {
            isUnder13: true,
            hasActiveParentLink: false,
            canAccessContent: false,
            contentAudience: 'child' as const,
        };
        vi.mocked(OnboardingMethods.getAccess).mockResolvedValue(under13Access);

        // Act: Issue GET request to access endpoint
        const response = await request(createTestApp('learner', 7)).get('/api/onboarding/getAccess');

        // Assert: Expect HTTP 200 OK and the under-13 access evaluation
        expect(response.status).toBe(200);
        expect(response.body).toEqual(under13Access);
        expect(OnboardingMethods.getAccess).toHaveBeenCalledWith(7);
    });

    it('rejects a non-learner role on access endpoint', async () => {
        // Act: Issue GET request to access endpoint with 'author' role
        const response = await request(createTestApp('author')).get('/api/onboarding/getAccess');

        // Assert: Access control middleware blocks request with HTTP 403 Forbidden
        expect(response.status).toBe(403);
        expect(OnboardingMethods.getAccess).not.toHaveBeenCalled();
    });
});