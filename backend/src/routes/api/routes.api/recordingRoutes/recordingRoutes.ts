// ============================================================================
// RECORDINGS — a learner's own read-aloud recording, saved to their account so
// it is still there to compare with the author's audio when they come back.
// Mounted after the auth gate in routes.ts. Learners only; every route acts on
// the caller's own recording, so there is no id that could name someone else's.
// Saving and fetching need content the learner may open (learnerGate.ts);
// deleting does not, so a learner can always remove their own voice.
// ============================================================================
import type { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';
import { NO_SAVED_RECORDING, RecordingMethods } from './methods/recordingMethods.js';
import { MAX_RECORDING_BYTES, recordingPath, validateRecording } from './functions/recordingFiles.js';

// Held in memory so the file is checked before anything is written.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RECORDING_BYTES, files: 1 } });

/** The caller the auth gate verified. */
function caller(res: Response): AuthedUser {
    return res.locals.user as AuthedUser;
}

/** Postgres INTEGER's largest value: a larger id names no content. */
const MAX_ID = 2147483647;

/** Reads :contentId onto res.locals, answering 400 itself when it is not a positive whole number. */
function contentIdParam(req: Request, res: Response, next: NextFunction) {
    const contentId = Number(req.params.contentId);
    if (!Number.isInteger(contentId) || contentId <= 0 || contentId > MAX_ID) {
        res.status(400).json({ error: 'contentId must be an integer' });
        return;
    }
    res.locals.contentId = contentId;
    next();
}

/** Refuses content the learner may not read, before any upload is read. */
async function readableContent(req: Request, res: Response, next: NextFunction) {
    try {
        await RecordingMethods.requireReadable(caller(res).id, res.locals.contentId as number);
        next();
    } catch (e) {
        genericCatch(req, res, e);
    }
}

/** Runs multer, turning its own failures into answers: over the limit is 413, anything else unreadable 400. */
function receiveFile(req: Request, res: Response, next: NextFunction) {
    upload.single('file')(req, res, (error: unknown) => {
        if (error instanceof multer.MulterError) {
            const tooLarge = error.code === 'LIMIT_FILE_SIZE';
            res.status(tooLarge ? 413 : 400).json({
                error: tooLarge ? 'File is larger than the 5 MB limit.' : 'That upload could not be read.',
            });
            return;
        }
        if (error) {
            genericCatch(req, res, error);
            return;
        }
        next();
    });
}

//Registers the recording routes on the app.
export function apply_recording_api_routes(app: Express) {
    const learners = RoleGuard.requireRole('learner');

    //The learner's saved recording for this content, as audio. 404 when there is none.
    app.get('/api/recordings/:contentId', learners, contentIdParam, readableContent, async (req, res) => {
        try {
            const recording = await RecordingMethods.getMine(caller(res).id, res.locals.contentId as number);
            res.sendFile(recordingPath(recording.fileName), {
                headers: {
                    'Content-Type': recording.mimeType,
                    // A learner's voice: never kept by a shared cache, never sniffed as anything but audio.
                    'Cache-Control': 'private, no-store',
                    'X-Content-Type-Options': 'nosniff',
                },
            }, (error) => {
                if (!error || res.headersSent) return;
                // The row is there but the file is not: say there is nothing to play.
                res.status(404).json({ error: NO_SAVED_RECORDING });
            });
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Saves (or replaces) the learner's recording for this content: multipart, field "file".
    app.put('/api/recordings/:contentId', learners, contentIdParam, readableContent, receiveFile, async (req, res) => {
        try {
            const check = validateRecording(req.file);
            if (!check.ok) {
                res.status(400).json({ error: check.error });
                return;
            }
            res.json(await RecordingMethods.save(caller(res).id, res.locals.contentId as number, req.file!.buffer, check.format));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Deletes the learner's recording for this content. 404 when there was none.
    app.delete('/api/recordings/:contentId', learners, contentIdParam, async (req, res) => {
        try {
            await RecordingMethods.remove(caller(res).id, res.locals.contentId as number);
            res.status(204).end();
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
