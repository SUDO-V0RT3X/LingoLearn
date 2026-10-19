// Unit tests for the per-IP rate limiter, its on/off switch and the
// trust-proxy parser that keeps req.ip honest. Stub req/res, no database.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit, rateLimitsEnabled } from '../../src/shared/functions/rateLimit.js';
import { trustProxySetting } from '../../src/shared/functions/trustProxy.js';

function call(mw: ReturnType<typeof rateLimit>, ip = '10.0.0.1') {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const setHeader = vi.fn();
    const next = vi.fn();
    mw({ ip } as never, { status, json, setHeader } as never, next);
    return { status, json, setHeader, next };
}

describe('rateLimit', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        process.env.RATE_LIMIT = 'on';
    });
    afterEach(() => {
        vi.useRealTimers();
        delete process.env.RATE_LIMIT;
    });

    it('nominal: lets requests under the limit through', () => {
        const mw = rateLimit({ max: 3, windowMs: 60_000 });
        expect(call(mw).next).toHaveBeenCalledOnce();
        expect(call(mw).next).toHaveBeenCalledOnce();
    });

    it('boundary: allows exactly max requests and refuses the next with 429, its message and Retry-After', () => {
        const mw = rateLimit({ max: 3, windowMs: 60_000, message: 'Too many sign-in attempts.' });
        for (let i = 0; i < 3; i += 1) expect(call(mw).next).toHaveBeenCalledOnce();

        const refused = call(mw);
        expect(refused.next).not.toHaveBeenCalled();
        expect(refused.status).toHaveBeenCalledWith(429);
        expect(refused.json).toHaveBeenCalledWith({ error: 'Too many sign-in attempts.' });
        expect(refused.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    });

    it('boundary: a request is allowed again once the window has passed', () => {
        const mw = rateLimit({ max: 1, windowMs: 60_000 });
        call(mw);
        expect(call(mw).status).toHaveBeenCalledWith(429);
        vi.advanceTimersByTime(60_001);
        expect(call(mw).next).toHaveBeenCalledOnce();
    });

    it('counts each IP separately', () => {
        const mw = rateLimit({ max: 1, windowMs: 60_000 });
        call(mw, '10.0.0.1');
        expect(call(mw, '10.0.0.1').status).toHaveBeenCalledWith(429);
        expect(call(mw, '10.0.0.2').next).toHaveBeenCalledOnce();
    });

    it('with skipSuccessful, hands back attempts that succeed and keeps counting refusals', () => {
        const mw = rateLimit({ max: 2, windowMs: 60_000, skipSuccessful: true });
        // A response stub that runs its finish listeners with a chosen status.
        const attempt = (statusCode: number) => {
            const listeners: Array<() => void> = [];
            const res = {
                statusCode,
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
                setHeader: vi.fn(),
                on: (_event: string, fn: () => void) => { listeners.push(fn); },
            };
            const next = vi.fn();
            mw({ ip: '10.0.0.9' } as never, res as never, next);
            listeners.forEach((fn) => fn());
            return { next, status: res.status };
        };

        for (let i = 0; i < 5; i += 1) expect(attempt(200).next).toHaveBeenCalledOnce();
        expect(attempt(401).next).toHaveBeenCalledOnce();
        expect(attempt(401).next).toHaveBeenCalledOnce();
        expect(attempt(200).status).toHaveBeenCalledWith(429);
    });

    it('lets everything through when limits are switched off', () => {
        process.env.RATE_LIMIT = 'off';
        const mw = rateLimit({ max: 1, windowMs: 60_000 });
        call(mw);
        expect(call(mw).next).toHaveBeenCalledOnce();
    });
});

describe('rateLimitsEnabled', () => {
    it('is on by default outside tests and off under NODE_ENV=test', () => {
        expect(rateLimitsEnabled({ NODE_ENV: 'production' })).toBe(true);
        expect(rateLimitsEnabled({})).toBe(true);
        expect(rateLimitsEnabled({ NODE_ENV: 'test' })).toBe(false);
    });

    it('lets RATE_LIMIT override either way', () => {
        expect(rateLimitsEnabled({ NODE_ENV: 'test', RATE_LIMIT: 'on' })).toBe(true);
        expect(rateLimitsEnabled({ NODE_ENV: 'production', RATE_LIMIT: 'off' })).toBe(false);
    });
});

describe('trustProxySetting', () => {
    it('is off when unset, empty, false or 0', () => {
        expect(trustProxySetting(undefined)).toBe(false);
        expect(trustProxySetting('')).toBe(false);
        expect(trustProxySetting('false')).toBe(false);
        expect(trustProxySetting('0')).toBe(false);
    });

    it('refuses "true", which would let X-Forwarded-For spoof the client IP', () => {
        expect(trustProxySetting('true')).toBe(false);
    });

    it('reads a hop count as a number and passes named or listed addresses through', () => {
        expect(trustProxySetting('1')).toBe(1);
        expect(trustProxySetting(' 2 ')).toBe(2);
        expect(trustProxySetting('loopback')).toBe('loopback');
        expect(trustProxySetting('10.0.0.0/8, loopback')).toBe('10.0.0.0/8, loopback');
    });
});
