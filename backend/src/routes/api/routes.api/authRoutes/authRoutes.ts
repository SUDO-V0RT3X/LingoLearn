// Identity and access routes, in two halves.
//   apply_authorization_api_routes  — mounted BEFORE the gate: you cannot hold a
//                                     session while asking for one.
//   apply_auth_session_api_routes   — mounted AFTER the gate: the caller is
//                                     already verified and sits on res.locals.
import type { Express, Response } from 'express';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { rateLimit } from '../../../../shared/functions/rateLimit.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { AccountMethods } from './methods/accountMethods.js';
import { ParentLinkMethods } from './methods/parentLinkMethods.js';
import { SessionMethods } from './methods/sessionMethods.js';
import type { PublicUser } from './types/authType.js';

/** The caller the auth gate verified for this request. */
function routeUser(res: Response): PublicUser {
    return res.locals.authedUser as PublicUser;
}

// Per-IP limits on the routes that take a secret. Sign-in and redemption count
// only refused attempts, so switching between demo accounts never trips them,
// while guessing a password or a link code does. Sign-up counts every attempt.
// Off under NODE_ENV=test (see rateLimitsEnabled) or with RATE_LIMIT=off.
const MINUTE = 60_000;
export const AUTH_RATE_LIMITS = {
    login:  { max: 10, windowMs: MINUTE,      message: 'Too many failed sign-in attempts. Please wait a minute and try again.', skipSuccessful: true },
    signup: { max: 10, windowMs: 15 * MINUTE, message: 'Too many accounts created from this network. Please try again in 15 minutes.' },
    redeem: { max: 10, windowMs: MINUTE,      message: 'Too many link codes tried. Please wait a minute and try again.', skipSuccessful: true },
} as const;

/**
 * Public account routes: the role list, signup and login.
 */
export function apply_authorization_api_routes(app: Express) {
    app.get('/api/auth/roles', (_req, res) => {
        res.json({ roles: AccountMethods.roles() });
    });

    app.post('/api/auth/signup', rateLimit(AUTH_RATE_LIMITS.signup), async (req, res) => {
        try {
            res.status(201).json(await AccountMethods.signUp(req.body ?? {}));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.post('/api/auth/login', rateLimit(AUTH_RATE_LIMITS.login), async (req, res) => {
        try {
            res.json(await AccountMethods.login(req.body ?? {}));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}

/**
 * Signed-in account routes: sign out, session restore, the interface language,
 * and parent linking.
 * A linked child's progress report lives in childProgressReportRoutes.ts.
 */
export function apply_auth_session_api_routes(app: Express) {
    app.post('/api/auth/logout', async (req, res) => {
        try {
            await SessionMethods.revokeAuthorizationHeader(req.header('authorization'));
            res.status(204).send();
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.get('/api/auth/me', (_req, res) => {
        res.json({ user: routeUser(res) });
    });

    // The header's language switch, for every role: the account keeps the
    // choice, so it is applied again at the next sign-in on any device.
    app.put('/api/auth/interface-language', async (req, res) => {
        try {
            res.json(await AccountMethods.saveInterfaceLanguage(routeUser(res).id, req.body ?? {}));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.post('/api/auth/link-codes', RoleGuard.requireRole('learner'), async (req, res) => {
        try {
            res.status(201).json(await ParentLinkMethods.createLinkCode(routeUser(res)));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.post('/api/auth/parent-links/redeem', RoleGuard.requireRole('guardian', 'administrator'), rateLimit(AUTH_RATE_LIMITS.redeem), async (req, res) => {
        try {
            res.status(201).json(await ParentLinkMethods.redeemCode(routeUser(res), req.body ?? {}));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.get('/api/auth/children', RoleGuard.requireRole('guardian', 'administrator'), async (req, res) => {
        try {
            res.json({ children: await ParentLinkMethods.getChildren(routeUser(res)) });
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    // A linked child's "My grown-up" page: who they are linked to.
    app.get('/api/auth/my-guardians', RoleGuard.requireRole('learner'), async (req, res) => {
        try {
            res.json({ guardians: await ParentLinkMethods.getMyGuardians(routeUser(res)) });
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
