// Design-document class: RoleGuard (unit tests 12–17).
// requireRole() is a middleware factory; the auth gate (IAM slice) populates
// res.locals.user first. 401s for a missing identity also live here so the
// guard is self-sufficient in tests.
import type { Request, Response, NextFunction } from 'express';
import type { AuthedUser } from '../routes/api/routes.api/authRoutes/authApplyAllRoute.js';

export class RoleGuard {
    static requireRole(...roles: AuthedUser['role'][]) {
        return (_req: Request, res: Response, next: NextFunction) => {
            const user = res.locals.user as AuthedUser | undefined;
            if (!user) return res.status(401).json({ error: 'not authenticated' });
            if (!roles.includes(user.role)) {
                return res.status(403).json({ error: 'insufficient role' });
            }
            next();
        };
    }
}
