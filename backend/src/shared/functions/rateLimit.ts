// In-memory sliding-window rate limiter, keyed by client IP. Opt-in per route:
//   app.post('/api/auth/login', rateLimit({ max: 10, windowMs: 60_000, message }), handler)
// The key is req.ip, which is only trustworthy because app.ts no longer trusts
// X-Forwarded-For by default (see trustProxySetting).
import type { Request, Response, NextFunction } from 'express';

export type RateLimitOptions = {
    /** Requests allowed per key inside one window. */
    max: number;
    /** Window length in milliseconds. */
    windowMs: number;
    /** The 429 message the client sees. */
    message?: string;
    /**
     * Count only refused requests (status 400 and up): a right password or a
     * good link code never uses up the allowance, so signing in and out of the
     * demo accounts all day is fine while guessing still runs into the limit.
     */
    skipSuccessful?: boolean;
};

/**
 * Whether limits are enforced. RATE_LIMIT=off or on wins; otherwise they are on
 * everywhere except NODE_ENV=test, where integration suites sign in far more
 * often than a person could. Read per request so one test file can switch it on.
 */
export function rateLimitsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.RATE_LIMIT === 'off') return false;
    if (env.RATE_LIMIT === 'on') return true;
    return env.NODE_ENV !== 'test';
}

export function rateLimit({
    max,
    windowMs,
    message = 'Too many requests. Please wait a moment and try again.',
    skipSuccessful = false,
}: RateLimitOptions) {
    const hits = new Map<string, number[]>();
    setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [k, ts] of hits) {
            const fresh = ts.filter(t => t > cutoff);
            if (fresh.length === 0) hits.delete(k); else hits.set(k, fresh);
        }
    }, windowMs).unref();

    return (req: Request, res: Response, next: NextFunction) => {
        if (!rateLimitsEnabled()) return next();

        const now = Date.now();
        const key = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
        const fresh = (hits.get(key) ?? []).filter(t => t > now - windowMs);
        if (fresh.length >= max) {
            // Seconds until the oldest request in the window expires.
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil((fresh[0] + windowMs - now) / 1000))));
            res.status(429).json({ error: message });
            return;
        }
        fresh.push(now);
        hits.set(key, fresh);
        if (skipSuccessful && typeof res.on === 'function') {
            // Hand the attempt back once the response turns out to be a success.
            res.on('finish', () => {
                if (res.statusCode >= 400) return;
                const current = hits.get(key);
                const index = current?.indexOf(now) ?? -1;
                if (current && index >= 0) current.splice(index, 1);
            });
        }
        next();
    };
}
