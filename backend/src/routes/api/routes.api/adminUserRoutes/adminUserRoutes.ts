import type { Express, Response } from 'express';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { AdminUserService } from './methods/adminUserService.js';
import { AdminParentLinkService } from './methods/adminParentLinkService.js';
import { optionalReason, requirePositiveId, validateAdminUserQuery, validateRoleChange } from './types/adminUserValidation.js';

// Reads the authenticated administrator ID populated by the global auth gate.
function adminId(res: Response): number {
    return (res.locals.user as { id: number }).id;
}

/** Registers administrator account-list, role, deactivation and link-list routes. */
export function apply_admin_user_api_routes(app: Express): void {
    const administrator = RoleGuard.requireRole('administrator');

    app.get('/api/admin/users', administrator, async (req, res) => {
        try {
            res.json(await AdminUserService.listUsers(validateAdminUserQuery(req.query as Record<string, unknown>)));
        } catch (error) { genericCatch(req, res, error); }
    });

    app.patch('/api/admin/users/:userId/role', administrator, async (req, res) => {
        try {
            const input = validateRoleChange(req.body ?? {});
            const user = await AdminUserService.changeRole(adminId(res), requirePositiveId(req.params.userId, 'userId'), input.role, input.reason);
            res.json({ user });
        } catch (error) { genericCatch(req, res, error); }
    });

    app.post('/api/admin/users/:userId/deactivate', administrator, async (req, res) => {
        try {
            const user = await AdminUserService.deactivate(
                adminId(res),
                requirePositiveId(req.params.userId, 'userId'),
                optionalReason(req.body?.reason),
            );
            res.json({ user });
        } catch (error) { genericCatch(req, res, error); }
    });

    app.get('/api/admin/users/:userId/links', administrator, async (req, res) => {
        try {
            const links = await AdminParentLinkService.getLinks(requirePositiveId(req.params.userId, 'userId'));
            res.json({ links });
        } catch (error) { genericCatch(req, res, error); }
    });
}
