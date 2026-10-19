// This route file exposes the guardian report through one read-only GET endpoint.
import type { Express, Request } from 'express';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { ApiError } from '../../../../shared/errors/ApiError.js';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import type { AuthedUser } from './authApplyAllRoute.js';
import { childProgressReportService } from './methods/childProgressReportService.js';
import type { ReportLanguage } from './types/childProgressReportType.js';

// This helper validates the optional report language query value. The report
// covers all of the child's learning (one level across languages), so a valid
// value changes nothing; it is still checked so a bad request is refused.
function checkReportLanguage(req: Request): ReportLanguage | undefined {
    // Read the raw language value from the Express query object.
    const value = req.query.language;
    // Accept a missing value.
    if (value === undefined) return undefined;
    // Accept either supported language code.
    if (value === 'en' || value === 'zu') return value;
    // Reject arrays, objects, and unsupported language strings.
    throw new ApiError(400, 'language must be en or zu');
}

/** Registers the guardian-only child progress report GET route. */
export function apply_child_progress_report_routes(app: Express): void {
    // Register only GET so PUT, PATCH, POST, and DELETE reach the shared 404 handler.
    app.get(
        '/api/guardians/me/children/:childId/report',
        RoleGuard.requireRole('guardian'),
        async (req, res) => {
            try {
                // Convert the child route parameter to a number.
                const childId = Number(req.params.childId);
                // Reject values that are not positive integer user ids.
                if (!Number.isInteger(childId) || childId <= 0) throw new ApiError(400, 'childId must be a positive integer');
                // Refuse an unsupported language query value.
                checkReportLanguage(req);
                // Read the authenticated guardian identity populated by the auth gate.
                const guardian = res.locals.user as AuthedUser;
                // Generate the report; the service checks the guardian is linked to this child.
                const report = await childProgressReportService.generateReport(childId, guardian.id);
                // Return the complete report as JSON.
                res.status(200).json(report);
            } catch (error) {
                // Convert ApiError values and unexpected failures into the shared API response format.
                genericCatch(req, res, error);
            }
        },
    );
}

