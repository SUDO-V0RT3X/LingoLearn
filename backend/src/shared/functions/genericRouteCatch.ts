// Every route handler ends in `catch (e) { genericCatch(req, res, e) }`.
// An ApiError keeps its status + message + issues; anything else is an opaque
// 500 so internals never leak to the client. The log line names the request
// and the error only: request bodies carry passwords and link codes.
import type { Request, Response } from 'express';
import { ApiError } from '../errors/ApiError.js';

export function genericCatch(req: Request, res: Response, e: unknown) {
    if (e instanceof ApiError) {
        res.status(e.status).json({ error: e.message, issues: e.issues });
        return;
    }
    console.error(`Error in ${req.method} ${req.path}:`, e);
    res.status(500).json({ error: 'failed request' });
}
