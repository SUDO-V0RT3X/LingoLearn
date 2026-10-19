import { requirePositiveId, optionalReason } from './adminUserValidation.js';

// Validates a new guardian-child link request.
export function validateCreateLink(body: Record<string, unknown>) {
    return {
        guardianId: requirePositiveId(body.guardianId, 'guardianId'),
        childId: requirePositiveId(body.childId, 'childId'),
        reason: optionalReason(body.reason),
    };
}

// Validates the guardian selected for a relink request.
export function validateRelink(body: Record<string, unknown>) {
    return {
        newGuardianId: requirePositiveId(body.newGuardianId, 'newGuardianId'),
        reason: optionalReason(body.reason),
    };
}
