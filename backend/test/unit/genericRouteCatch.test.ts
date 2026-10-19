// genericCatch: ApiErrors keep their status; anything else is an opaque 500
// whose server-side log line never contains the request body (passwords).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { genericCatch } from '../../src/shared/functions/genericRouteCatch.js';
import { ApiError } from '../../src/shared/errors/ApiError.js';

function stubRes() {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    return { res: { status } as never, status, json };
}

const req = { method: 'POST', path: '/api/auth/login', body: { identifier: 'someone', password: 'hunter2-secret' } } as never;

afterEach(() => vi.restoreAllMocks());

describe('genericCatch', () => {
    it('nominal: returns an ApiError with its own status and message, logging nothing', () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { res, status, json } = stubRes();
        genericCatch(req, res, new ApiError(409, 'Code already used'));
        expect(status).toHaveBeenCalledWith(409);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Code already used' }));
        expect(log).not.toHaveBeenCalled();
    });

    it('answers any other error with an opaque 500', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { res, status, json } = stubRes();
        genericCatch(req, res, new Error('connection reset'));
        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith({ error: 'failed request' });
    });

    it('logs the method, path and error, never the request body', () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        genericCatch(req, stubRes().res, new Error('connection reset'));

        const logged = JSON.stringify(log.mock.calls, (_k, v) => (v instanceof Error ? v.message : v));
        expect(logged).toContain('POST /api/auth/login');
        expect(logged).toContain('connection reset');
        expect(logged).not.toContain('hunter2-secret');
        expect(console.log).not.toHaveBeenCalled();
    });
});
