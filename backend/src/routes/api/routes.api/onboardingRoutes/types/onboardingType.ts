// Import the shared `ValidationIssue` type so validation failures use the same
// shape everywhere in the API (field + message pairs).
import type { ValidationIssue } from '../../../../../shared/errors/ApiError.js';
// Import the shared `LearnerAccess` type so the onboarding response can embed
// the access policy evaluated from the learner's age and parent links.
import type { LearnerAccess } from '../../../../../shared/learnerAccess.js';

/**
 * Shape accepted by the API for saving learner settings. 
 * These property names match the frontend JSON payload (camelCase).
 */
// Exported type describing the request payload the client is allowed to send.
export type OnboardingInput = {
    // The language the learner wants to study: 'english' or 'zulu'.
    targetLanguage: string;
    // The learner's birth date as an ISO-ish string supplied by the client.
    dateOfBirth: string;
    // Language code used to render the UI for this learner (e.g. "en").
    interfaceLanguage: string;
    // How many minutes/lessons per day the learner commits to (1–120).
    dailyGoal: number;
};

/**
 * Shape returned by PostgreSQL. 
 * Database columns use snake_case by convention.
 */
// Exported type mirroring the `onboarding_settings` table row.
export type OnboardingSettings = {
    // Primary key / foreign key back to the owning user.
    user_id: number;
    // Persisted target language code.
    target_language: string;
    // Persisted interface language code.
    interface_language: string;
    // Persisted daily goal number.
    daily_goal: number;
    // Persisted birth date string (stored as a date in Postgres).
    date_of_birth: string;
    // Row creation timestamp set by the database.
    created_at: Date;
    // Row last-modified timestamp set by the database.
    updated_at: Date;
};

/**
 * Shape returned by onboarding endpoints when including the evaluated access policy.
 * This combines saved settings with the access permissions derived from the user's age and parent links.
 */
// Exported intersection type: the DB row plus the derived access policy.
export type OnboardingResponse = OnboardingSettings & {
    // The evaluated access policy telling the client what the learner may do.
    access: LearnerAccess;
};

/**
 * Discriminated union for the validation result.
 * Allows safe access to `data` if valid is true, or `issues` if valid is false.
 */
// Exported union type used as the return value of `validateOnboardingInput`.
export type OnboardingValidation =
    // Happy path: `valid` is the literal `true` and sanitized `data` is present.
    | { valid: true; data: OnboardingInput }
    // Failure path: `valid` is the literal `false` and an issue list is present.
    | { valid: false; issues: ValidationIssue[] };

/**
 * The languages a learner can choose to study. The database enforces the same
 * list (migration 208).
 */
export const TARGET_LANGUAGES = ['english', 'zulu'] as const;
export type TargetLanguage = typeof TARGET_LANGUAGES[number];

/** True when `value` is one of the languages on offer. */
export function isTargetLanguage(value: unknown): value is TargetLanguage {
    return typeof value === 'string' && (TARGET_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Checks a date of birth the way setup does: a string that parses to a real
 * date, not in the future and not before 1900. Returns the issue, or null.
 * Shared by learner setup and the guardian's date-of-birth correction.
 */
export function validateDateOfBirth(value: unknown): ValidationIssue | null {
    // Parse only when the field is a string; otherwise leave it null so the check fails cleanly.
    const dateOfBirth = typeof value === 'string' ? new Date(value) : null;
    if (
        // The field was missing or not a string.
        dateOfBirth === null ||
        // The string parsed into an Invalid Date (e.g. "not-a-date").
        Number.isNaN(dateOfBirth.getTime()) ||
        // Cannot be born in the future.
        dateOfBirth > new Date() ||
        // The year is before 1900, which is almost certainly a typo.
        dateOfBirth.getUTCFullYear() < 1900
    ) {
        return { field: 'dateOfBirth', message: 'dateOfBirth must be a valid date between 1900 and today' };
    }
    return null;
}

/** What the guardian date-of-birth routes return. */
export type ChildDateOfBirth = {
    childId: number;
    // 'YYYY-MM-DD', or null when the child has not finished setup.
    dateOfBirth: string | null;
};

/** Body of PUT /api/onboarding/children/:childId/dateOfBirth. */
export type GuardianDateOfBirthValidation =
    | { valid: true; data: { dateOfBirth: string } }
    | { valid: false; issues: ValidationIssue[] };

/** Validates a guardian's date-of-birth correction with the same rule as setup. */
export function validateGuardianDateOfBirthInput(value: unknown): GuardianDateOfBirthValidation {
    if (typeof value !== 'object' || value === null) {
        return { valid: false, issues: [{ field: 'body', message: 'request body must be an object' }] };
    }
    const dateOfBirth = (value as Record<string, unknown>).dateOfBirth;
    const issue = validateDateOfBirth(dateOfBirth);
    if (issue) return { valid: false, issues: [issue] };
    return { valid: true, data: { dateOfBirth: dateOfBirth as string } };
}

/**
 * Validates the raw request body payload for the onboarding settings endpoint.
 * Keeps request validation at the API boundary so invalid values never reach SQL.
 * 
 * @param value - The raw, untyped request body
 * @returns An OnboardingValidation object containing either the sanitized data or a list of validation issues
 */
// Exported function that guards the onboarding endpoint's input.
export function validateOnboardingInput(value: unknown): OnboardingValidation {
    // Accumulator array that collects every validation problem found in one pass.
    const issues: ValidationIssue[] = [];

    // 1. Ensure the payload is a valid object
    // Reject `null` and any non-object primitive (string, number, boolean, undefined).
    if (typeof value !== 'object' || value === null) {
        // Return immediately: nothing else can be inspected safely.
        return {
            // Mark the overall result as invalid.
            valid: false,
            // Report a single top-level issue explaining the body shape problem.
            issues: [{ field: 'body', message: 'request body must be an object' }],
        };
    }

    // Narrow the `unknown` type to a plain string-keyed record for property access.
    const input = value as Record<string, unknown>;

    // 2. Validate targetLanguage: one of the languages the app teaches (case-insensitive).
    // Normalise first so 'Zulu ' and 'zulu' mean the same stored value.
    const targetLanguage = typeof input.targetLanguage === 'string' ? input.targetLanguage.trim().toLowerCase() : '';
    if (!isTargetLanguage(targetLanguage)) {
        // Record that `targetLanguage` is missing or not a language on offer.
        issues.push({ field: 'targetLanguage', message: `targetLanguage must be one of: ${TARGET_LANGUAGES.join(', ')}` });
    }

    // 3. Validate dateOfBirth: must parse to a valid Date, be in the past, and be after the year 1900
    const dateIssue = validateDateOfBirth(input.dateOfBirth);
    if (dateIssue) issues.push(dateIssue);

    // 4. Validate interfaceLanguage: must be a non-empty string under 80 characters
    // Same pattern as `targetLanguage`: reject missing, non-string, or whitespace-only values.
    if (typeof input.interfaceLanguage !== 'string' || input.interfaceLanguage.trim().length === 0) {
        // Record that `interfaceLanguage` is missing or effectively empty.
        issues.push({ field: 'interfaceLanguage', message: 'interfaceLanguage must be a non-empty string' });
    // Only check the length cap once we know it is a real string.
    } else if (input.interfaceLanguage.length > 80) {
        // Record that the value exceeds the maximum permitted length.
        issues.push({ field: 'interfaceLanguage', message: 'interfaceLanguage must be at most 80 characters' });
    }

    // 5. Validate dailyGoal: must be a whole number representing minutes/lessons between 1 and 120
    // Reject non-integers (including NaN, Infinity, floats, and non-numbers) and out-of-range values.
    if (!Number.isInteger(input.dailyGoal) || (input.dailyGoal as number) < 1 || (input.dailyGoal as number) > 120) {
        // Record that `dailyGoal` failed the integer/range check.
        issues.push({ field: 'dailyGoal', message: 'dailyGoal must be an integer between 1 and 120' });
    }

    // If any validation rules failed, return the accumulated issues
    // Short-circuit the happy path when at least one issue was recorded.
    if (issues.length > 0) return { valid: false, issues };

    // Return the sanitized, strictly-typed data object
    // At this point every field has been proven valid, so cast to the target type.
    return {
        // Mark the overall result as valid so callers can take the `data` branch.
        valid: true,
        // Rebuild the payload using only the validated fields (drops any extra keys).
        data: {
            // `targetLanguage` is one of TARGET_LANGUAGES, already normalised.
            targetLanguage,
            // `dateOfBirth` is a string by the earlier type check.
            dateOfBirth: input.dateOfBirth as string,
            // `interfaceLanguage` is a string by the earlier type check.
            interfaceLanguage: input.interfaceLanguage as string,
            // `dailyGoal` is an integer by the earlier `Number.isInteger` check.
            dailyGoal: input.dailyGoal as number,
        },
    };
}