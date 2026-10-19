import type { Express, Response } from 'express';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { AdminParentLinkService } from './methods/adminParentLinkService.js';
import { validateCreateLink, validateRelink } from './types/adminParentLinkValidation.js';
import { optionalReason, requirePositiveId } from './types/adminUserValidation.js';

// Reads the authenticated administrator ID populated by the global auth gate.
function adminId(res: Response): number {
    return (res.locals.user as { id: number }).id;
}

/** Registers administrator parent-link create, unlink and relink routes. */
export function apply_admin_parent_link_api_routes(app: Express): void {
    const administrator = RoleGuard.requireRole('administrator');

    app.post('/api/admin/parent-links', administrator, async (req, res) => {
        try {
            const input = validateCreateLink(req.body ?? {});
            const link = await AdminParentLinkService.create(adminId(res), input.guardianId, input.childId, input.reason);
            res.status(201).json({ link });
        } catch (error) { genericCatch(req, res, error); }
    });

    app.post('/api/admin/parent-links/:linkId/unlink', administrator, async (req, res) => {
        try {
            const link = await AdminParentLinkService.unlink(
                adminId(res),
                requirePositiveId(req.params.linkId, 'linkId'),
                optionalReason(req.body?.reason),
            );
            res.json({ link });
        } catch (error) { genericCatch(req, res, error); }
    });

    app.post('/api/admin/parent-links/:linkId/relink', administrator, async (req, res) => {
        try {
            const input = validateRelink(req.body ?? {});
            const link = await AdminParentLinkService.relink(
                adminId(res),
                requirePositiveId(req.params.linkId, 'linkId'),
                input.newGuardianId,
                input.reason,
            );
            res.json({ link });
        } catch (error) { genericCatch(req, res, error); }
    });
}
