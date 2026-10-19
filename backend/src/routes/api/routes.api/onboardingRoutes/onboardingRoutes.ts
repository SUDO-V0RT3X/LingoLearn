// ============================================================================
// Onboarding API Routes
// ============================================================================
// Import the Express application type without adding a runtime dependency.
import type { Express } from 'express';
// Import the onboarding owner methods that read, write, and evaluate setup state.
import { OnboardingMethods } from './methods/onboardingMethods.js';
// Import learner-role enforcement for every onboarding endpoint.
import { RoleGuard } from '../../../../shared/roleGuard.js';
// Import the shared route-level exception handler.
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
// Import the authenticated principal type stored by auth middleware.
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';
// Import the boundary validator for untrusted setup form values.
import { validateGuardianDateOfBirthInput, validateOnboardingInput } from './types/onboardingType.js';

/** Reads :childId as a positive integer, or null when it is not one. */
function parseChildId(raw: string | undefined): number | null {
    const childId = Number(raw);
    return Number.isSafeInteger(childId) && childId > 0 ? childId : null;
}

export function apply_onboarding_api_routes(app: Express) {
    // Read the current learner's persisted setup without accepting a client user ID.
    app.get(
        '/api/onboarding/getSettings',
        RoleGuard.requireRole('learner'), //Get the onboarding settings for the authenticated user. Only users with the 'learner' role can access this endpoint.
        async (_req, res) => {
            try {
                // Resolve the caller's authenticated identity from request context.
                const user = res.locals.user as AuthedUser;
                // Fetch only that learner's saved settings through the onboarding owner.
                const settings = await OnboardingMethods.getSettings(user.id);
                // Serialize the saved row for the frontend setup form.
                res.send(settings); //Send the retrieved onboarding settings as the response
            } catch (e) {
                // Convert missing records and unexpected errors to the common API shape.
                genericCatch(_req, res, e);
            }
        },
    );

    app.put(
        '/api/onboarding/saveSettings',
        RoleGuard.requireRole('learner'), // Only users with the 'learner' role can save onboarding settings
        async (req, res) => {
            try {
                // Bind writes to the authenticated learner rather than request-supplied identity.
                const user = res.locals.user as AuthedUser; // Extract authenticated user context
                // Use an empty object when a request body is absent so validation rejects it cleanly.
                const settings = req.body ?? {}; // Fall back to empty object if body is missing

                // Perform server-side validation on client payload before executing database operations
                const validation = validateOnboardingInput(settings);
                if (!validation.valid) {
                    // Return field-level issues before any database write occurs.
                    res.status(400).json({ error: 'Invalid onboarding settings', issues: validation.issues });
                    // Stop here so invalid values cannot reach persistence.
                    return;
                }

                // Persist the learner's preferences into the PostgreSQL learner_settings table
                // Pass only the validated payload to the method that owns onboarding writes.
                const updated = await OnboardingMethods.saveSettings(
                    user,
                    validation.data,
                );

                // Query PostgreSQL to evaluate child safety and access policies based on the stored birth date and parent links
                // Re-evaluate access after saving because the learner's birth date may have changed.
                const access = await OnboardingMethods.getAccess(user.id);

                // Return the updated settings along with the evaluated access permissions
                // Combine persisted preferences and server-derived policy in one response.
                res.send({ ...updated, access });
            } catch (e) {
                // Route validation-independent database and policy failures through one handler.
                genericCatch(req, res, e);
            }
        },
    );

    app.get(
        '/api/onboarding/getAccess',
        RoleGuard.requireRole('learner'), // Only authenticated learners can query their access status
        async (_req, res) => {
            try {
                // Resolve the requesting learner from authenticated middleware.
                const user = res.locals.user as AuthedUser; // Extract authenticated user context
                // Query PostgreSQL to evaluate access based on the saved birth date and parent links
                // Delegate policy rules to the shared onboarding method.
                const access = await OnboardingMethods.getAccess(user.id);
                // Send the evaluated access status (isUnder13, hasActiveParentLink, canAccessContent, contentAudience)
                // Return only computed access flags, not the underlying date or link records.
                res.send(access);
            } catch (e) {
                // Keep access-query failures consistent with other onboarding responses.
                genericCatch(_req, res, e);
            }
        },
    );

    // A linked guardian reads a child's saved date of birth, to correct it.
    app.get(
        '/api/onboarding/children/:childId/dateOfBirth',
        RoleGuard.requireRole('guardian'),
        async (req, res) => {
            try {
                const user = res.locals.user as AuthedUser;
                const childId = parseChildId(req.params.childId);
                if (childId === null) {
                    res.status(400).json({ error: 'Invalid child ID', issues: [] });
                    return;
                }
                res.send(await OnboardingMethods.getChildDateOfBirth(user.id, childId));
            } catch (e) {
                genericCatch(req, res, e);
            }
        },
    );

    // The header's language switch: saves only the language for menus and buttons.
    app.put(
        '/api/onboarding/saveInterfaceLanguage',
        RoleGuard.requireRole('learner'),
        async (req, res) => {
            try {
                const user = res.locals.user as AuthedUser;
                const language = req.body?.interfaceLanguage;
                if (language !== 'english' && language !== 'zulu') {
                    res.status(400).json({ error: "interfaceLanguage must be 'english' or 'zulu'", issues: [] });
                    return;
                }
                res.send(await OnboardingMethods.saveInterfaceLanguage(user.id, language));
            } catch (e) {
                genericCatch(req, res, e);
            }
        },
    );

    // Only a linked guardian may change a learner's date of birth once setup is saved.
    app.put(
        '/api/onboarding/children/:childId/dateOfBirth',
        RoleGuard.requireRole('guardian'),
        async (req, res) => {
            try {
                const user = res.locals.user as AuthedUser;
                const childId = parseChildId(req.params.childId);
                if (childId === null) {
                    res.status(400).json({ error: 'Invalid child ID', issues: [] });
                    return;
                }
                // Same date rule as learner setup.
                const validation = validateGuardianDateOfBirthInput(req.body ?? {});
                if (!validation.valid) {
                    res.status(400).json({ error: 'Invalid date of birth', issues: validation.issues });
                    return;
                }
                const updated = await OnboardingMethods.setChildDateOfBirth(
                    user.id, childId, validation.data.dateOfBirth);
                res.send(updated);
            } catch (e) {
                genericCatch(req, res, e);
            }
        },
    );
}

