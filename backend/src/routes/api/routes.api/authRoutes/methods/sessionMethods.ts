// Session tokens and the auth_sessions rows behind them. The token is signed
// with AUTH_SECRET; the row is what makes sign-out revoke it server side.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { AccountMethods } from './accountMethods.js';
import type { PublicUser, UserRole } from '../types/authType.js';

type SessionTokenPayload = {
    sessionId: string;
    sub: number;
    role: UserRole;
    iat: number;
    exp: number;
};

const sessionDurationMs = 1000 * 60 * 60 * 24 * 7; // 7 days.

/**
 * Reads the signing secret. There is no default: an unset AUTH_SECRET would
 * let anyone who knows the fallback mint a token for any account.
 */
function secret(): string {
    const value = process.env.AUTH_SECRET;
    if (!value) throw new Error('AUTH_SECRET is not set — copy .env.example to .env');
    return value;
}

function encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode<T>(value: string): T {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function sign(value: string): string {
    return createHmac('sha256', secret()).update(value).digest('base64url');
}

/** Compares two signatures in constant time, so a wrong one leaks no timing. */
function signatureMatches(expected: string, actual: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(actual);
    return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Builds the signed token the frontend stores. It carries the session id, user
 * id, role and expiry; revocation state stays in auth_sessions.
 */
function createToken(payload: SessionTokenPayload): string {
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const body = encode(payload);
    return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

/**
 * Takes the raw token out of an Authorization: Bearer header. A missing or
 * malformed header fails the same way an invalid token does.
 */
function parseBearerToken(header: string | undefined): string {
    const [scheme, token] = (header ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'Session invalid');
    return token;
}

/**
 * Splits the token, checks its signature and decodes the payload, so a tampered
 * token is refused before any database work happens.
 */
function parseAndVerifyToken(token: string): SessionTokenPayload {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature || !signatureMatches(sign(`${header}.${body}`), signature)) {
        throw new ApiError(401, 'Session invalid');
    }

    try {
        return decode<SessionTokenPayload>(body);
    } catch {
        throw new ApiError(401, 'Session invalid');
    }
}

export class SessionMethods {
    /**
     * Opens a session row and returns the signed token for it.
     */
    static async createSession(user: PublicUser, ttlMs = sessionDurationMs): Promise<string> {
        const sessionId = randomUUID();
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + ttlMs);

        await pool.query(
            `INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)`,
            [sessionId, user.id, createdAt, expiresAt],
        );

        return createToken({
            sessionId,
            sub: user.id,
            role: user.role,
            iat: Math.floor(createdAt.getTime() / 1000),
            exp: Math.floor(expiresAt.getTime() / 1000),
        });
    }

    /**
     * Verifies a request's bearer token: signature, expiry, a live session row
     * and an active account. Returns the user without any private fields.
     */
    static async verifyAuthorizationHeader(header: string | undefined): Promise<PublicUser> {
        const payload = parseAndVerifyToken(parseBearerToken(header));
        if (payload.exp <= Math.floor(Date.now() / 1000)) throw new ApiError(401, 'Session invalid');

        const { rows } = await pool.query<{ id: string }>(
            `SELECT id FROM auth_sessions
              WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
            [payload.sessionId, payload.sub],
        );
        if (rows.length === 0) throw new ApiError(401, 'Session invalid');

        const user = await AccountMethods.getActiveUser(payload.sub);
        if (!user) throw new ApiError(401, 'Session invalid');

        return user;
    }

    /**
     * Signs out by revoking the session row, so the same token fails on every
     * later request instead of only being dropped by the browser.
     */
    static async revokeAuthorizationHeader(header: string | undefined): Promise<void> {
        const payload = parseAndVerifyToken(parseBearerToken(header));
        const { rowCount } = await pool.query(
            `UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
            [payload.sessionId],
        );

        if (rowCount === 0) throw new ApiError(401, 'Session invalid');
    }
}
