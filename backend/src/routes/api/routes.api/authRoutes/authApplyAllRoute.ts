// Global auth gate. Everything mounted after it needs a valid session token:
// Authorization: Bearer <token>. There is no header fallback — one would let a
// caller name any user id and role they liked.
import type { Express, Request, Response, NextFunction } from 'express';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { SessionMethods } from './methods/sessionMethods.js';
import type { PublicUser, UserRole } from './types/authType.js';

export type AuthedUser = {
    id: number;
    role: UserRole;
};

/**
 * Verifies the bearer token on every protected API request and puts the caller
 * on res.locals for RoleGuard and the route handlers. Any failure answers 401
 * here, so no handler downstream ever runs without a known user.
 */
export function apply_auth_check_all_api_requests(app: Express) {
    app.use('/api/*', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = await SessionMethods.verifyAuthorizationHeader(req.header('authorization'));
            res.locals.user = { id: user.id, role: user.role } satisfies AuthedUser;
            res.locals.authedUser = user satisfies PublicUser;
            next();
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
