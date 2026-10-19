import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
// App composition, separated from listen() so integration tests can drive it
// with supertest.
import { pool } from './config/db/db_init.js';
import { apply_api_routes } from './routes/routes.js';
import { ApiError } from './shared/errors/ApiError.js';
import { ALLOWED_EXTENSIONS } from './routes/api/routes.api/mediaRoutes/functions/validateAudio.js';
import { STORED_EXTENSION } from './routes/api/routes.api/mediaRoutes/functions/validateImage.js';
import { RECORDINGS_FOLDER } from './routes/api/routes.api/recordingRoutes/functions/recordingFiles.js';
import { trustProxySetting } from './shared/functions/trustProxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/** Whether an error is express's body parser refusing the request body. */
function isUnreadableBody(err: unknown): err is { status: number; type: string } {
    const e = err as { status?: unknown; type?: unknown };
    return typeof e?.type === 'string' && e.type.startsWith('entity.')
        && typeof e.status === 'number' && e.status >= 400 && e.status < 500;
}

/** Every extension an upload can be stored with (validateAudio, validateImage). */
const SERVED_EXTENSIONS = new Set([...ALLOWED_EXTENSIONS, ...Object.values(STORED_EXTENSION)]);

/**
 * Lets a request through to the uploads folder only when it names a media file.
 * The path is decoded first, as express.static does, so an encoded dot or an
 * upper-case extension cannot slip a sidecar past the check. Learners' own
 * recordings (uploads/recordings/) are never served here, however the path is
 * spelled: only their owner can fetch one, from /api/recordings.
 */
function onlyMediaFiles(req: express.Request, res: express.Response, next: express.NextFunction) {
    let requested: string;
    try {
        requested = decodeURIComponent(req.path).toLowerCase();
    } catch {
        res.status(404).end();
        return;
    }

    const normalised = path.posix.normalize(requested.replace(/\\/g, '/'));
    if (normalised.split('/').includes(RECORDINGS_FOLDER)) {
        res.status(404).end();
        return;
    }

    const dot = requested.lastIndexOf('.');
    if (dot === -1 || !SERVED_EXTENSIONS.has(requested.slice(dot))) {
        res.status(404).end();
        return;
    }

    next();
}

export function createApp(): express.Express {
    const app = express();
    // Off unless TRUST_PROXY says how many proxies (or which addresses) sit in
    // front: trusting every hop would let X-Forwarded-For spoof the rate-limit key.
    app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));
    // Every JSON request is small: the largest is a piece of content, whose own
    // limits are in contentRoutes/functions/validateContent.ts. Files are not
    // sent as JSON; uploads go through multer with a limit of their own.
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(cors({ exposedHeaders: ['flag_must_login', 'error'] }));

    // Uploaded audio and images, read-only. express.static answers range
    // requests, which is what lets an audio player seek. Only media files are
    // served: the .meta.json sidecars beside each clip (who uploaded it, its
    // transcript) and anything else in the folder answer 404.
    app.use('/uploads', onlyMediaFiles, express.static(path.join(__dirname, '../uploads')));

    // Health check declared BEFORE the request logger so polling doesn't spam logs.
    app.get('/health', async (_req, res) => {
        try {
            await pool.query('SELECT 1');
            res.json({ ok: true });
        } catch {
            res.status(503).json({ ok: false, error: 'database unreachable' });
        }
    });

    // Server-side request logging (hard requirement).
    app.use((req, _res, next) => { console.log(`${req.method} ${req.originalUrl}`); next(); });

    apply_api_routes(app);

    // secure error handling (hard requirement): ApiError ==> its status + safe
    // message + validation issues; anything else → opaque 500, logged server-side.
    app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        if (res.headersSent) return;
        if (err instanceof ApiError) {
            return res.status(err.status).json({ error: err.message, issues: err.issues });
        }
        // The body parser refusing a request is the client's mistake, not a crash:
        // 413 for a body over the limit, 400 for one that is not valid JSON.
        if (isUnreadableBody(err)) {
            return res.status(err.status).json({
                error: err.status === 413 ? 'request body is too large' : 'request body could not be read',
            });
        }
        console.error(`Unhandled error in ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ error: 'internal server error' });
    });

    return app;
}
