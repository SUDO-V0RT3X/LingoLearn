// ============================================================================
// Placement API Routes
// ============================================================================
// Import the Express type used by the shared route registration function.
import type { Express } from 'express';
// Import the placement-owned persistence and grading operations called by routes.
import { PlacementMethods } from './methods/placementMethods.js';
// Import role middleware so only permitted account types reach each handler.
import { RoleGuard } from '../../../../shared/roleGuard.js';
// Import the shared error boundary used to translate exceptions into HTTP responses.
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
// Import the authenticated-user shape populated by the auth middleware.
import type { PublicUser } from '../authRoutes/types/authType.js';
// Import validation for the untrusted learner answer body.
import { validateSubmitAnswerInput } from './types/placementType.js';

/**
 * Registers all REST routes associated with learner placement testing.
 * Mounted after the authentication gate; all routes require an authenticated learner session.
 *
 * @param app - The Express application instance
 */
export function apply_placement_api_routes(app: Express) {
    /**
     * POST /api/placement/startPlacement
     * Initiates a placement test attempt (or continues the learner's unfinished one) and delivers its question.
     * Enforces under-13 parental consent rules: learners under 13 without an active guardian link receive 403.
     */
    app.post(
        '/api/placement/startPlacement',
        RoleGuard.requireRole('learner'),
        async (req, res) => {
            try {
                // Resolve the principal populated by authentication middleware.
                const user = (res.locals.authedUser ?? res.locals.user) as PublicUser;
                // Create a persisted attempt (or continue an unfinished one) and obtain its question.
                const result = await PlacementMethods.startPlacement(user.id);
                // 201 when a new attempt was created; 200 when an unfinished one is continued.
                res.status(result.resumed ? 200 : 201).json(result);
            } catch (e) {
                // Convert any domain or database exception to a standard response.
                genericCatch(req, res, e);
            }
        },
    );

    /**
     * POST /api/placement/skipPlacement
     * Allows a learner to bypass the diagnostic and enter Explore at level 1.
     */
    app.post(
        '/api/placement/skipPlacement',
        RoleGuard.requireRole('learner'),
        async (req, res) => {
            try {
                // Use the authenticated learner ID rather than trusting a body parameter.
                const user = (res.locals.authedUser ?? res.locals.user) as PublicUser;
                // Persist the default Level 1 assignment through the placement owner.
                const result = await PlacementMethods.skipPlacement(user.id);
                // Return the confirmed level assignment to the client.
                res.status(200).json(result);
            } catch (e) {
                // Centralize route error conversion for database and policy failures.
                genericCatch(req, res, e);
            }
        },
    );

    /**
     * GET /api/placement/getLearnerLevel
     * Returns the authenticated learner's saved level through its owning module.
     */
    app.get(
        '/api/placement/getLearnerLevel',
        RoleGuard.requireRole('learner'),
        async (req, res) => {
            try {
                const user = (res.locals.authedUser ?? res.locals.user) as PublicUser;
                const result = await PlacementMethods.getLearnerLevel(user.id);
                res.status(200).json(result);
            } catch (e) {
                genericCatch(req, res, e);
            }
        },
    );

    /**
     * GET /api/placement/getActiveAttempt
     * Returns the learner's unfinished attempt at its current question (no answer key),
     * or { attempt: null }, so the placement screen can carry on after a reload.
     */
    app.get(
        '/api/placement/getActiveAttempt',
        RoleGuard.requireRole('learner'),
        async (req, res) => {
            try {
                const user = (res.locals.authedUser ?? res.locals.user) as PublicUser;
                const result = await PlacementMethods.getActiveAttempt(user.id);
                res.status(200).json(result);
            } catch (e) {
                genericCatch(req, res, e);
            }
        },
    );

    /**
     * POST /api/placement/submitAnswer/:attemptId
     * Submits an answer to the current placement question.
     * Evaluates correctness server-side, records attempts, and returns the next question or the final CEFR placement level.
     */
    app.post(
        '/api/placement/submitAnswer/:attemptId',
        RoleGuard.requireRole('learner'),
        async (req, res) => {
            try {
                // Resolve the authenticated user and the attempt ID in the URL.
                const user = (res.locals.authedUser ?? res.locals.user) as PublicUser;
                const attemptId = req.params.attemptId;

                // Validate request payload
                const validation = validateSubmitAnswerInput(req.body ?? {});
                if (!validation.valid) {
                    // Return structured validation feedback without entering grading logic.
                    res.status(400).json({ error: 'Invalid answer submission', issues: validation.issues });
                    // Stop the route after writing the validation response.
                    return;
                }

                // Grade only sanitized request values and the caller-owned attempt.
                const result = await PlacementMethods.submitAnswer(
                    user.id,
                    attemptId,
                    validation.data,
                );
                // Return the next question or final level using the standard success status.
                res.status(200).json(result);
            } catch (e) {
                // Convert access, ownership, and database failures consistently.
                genericCatch(req, res, e);
            }
        },
    );

    /**
     * POST /api/placement/quitPlacement/:attemptId
     * Completes the attempt and assigns the learner the level of the current question.
     */
    app.post(
        '/api/placement/quitPlacement/:attemptId',
        RoleGuard.requireRole('learner'),
        async (req, res) => {
            try {
                // Derive the learner identity from authentication and the attempt from the path.
                const user = (res.locals.authedUser ?? res.locals.user) as PublicUser;
                // Complete the attempt and assign its current question's level.
                const result = await PlacementMethods.quitPlacement(user.id, req.params.attemptId);
                // Return the same result structure used by answer-based completion.
                res.status(200).json(result);
            } catch (e) {
                // Share standard handling for missing, completed, or inaccessible attempts.
                genericCatch(req, res, e);
            }
        },
    );

    /**
     * POST /api/placement/incrementLearnerLevel/:userId
     * Controlled progression API for downstream systems; administrators only.
     */
    app.post(
        '/api/placement/incrementLearnerLevel/:userId',
        RoleGuard.requireRole('administrator'),
        async (req, res) => {
            try {
                // Parse the downstream target learner ID from the URL path.
                const userId = Number(req.params.userId);
                if (!Number.isSafeInteger(userId) || userId <= 0) {
                    // Reject malformed or non-positive IDs before making a database call.
                    res.status(400).json({ error: 'Invalid learner ID' });
                    // Stop so the method is never invoked with invalid input.
                    return;
                }

                // Delegate the sole learner-level increment operation to PlacementMethods.
                const result = await PlacementMethods.incrementLearnerLevel(userId);
                // Return the updated level assigned by the atomic database operation.
                res.status(200).json(result);
            } catch (e) {
                // Preserve the shared error response contract for unexpected failures.
                genericCatch(req, res, e);
            }
        },
    );
}

