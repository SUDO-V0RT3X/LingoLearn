// ============================================================================
// READING — per-page reading progress, so the reader resumes where a learner
// left off. Mounted after the auth gate in routes.ts. Learners only, and only
// for content they may open (contentRoutes/functions/learnerGate.ts).
// Named /api/reading/* so it never clashes with progression's /api/progress/*.
// ============================================================================
import type { Express, Request, Response } from 'express';
import { ReadingMethods } from './methods/readingMethods.js';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';

/** The caller the auth gate verified. */
function caller(res: Response): AuthedUser {
    return res.locals.user as AuthedUser;
}

/** Reads :contentId, answering 400 itself when it is not a whole number. */
function contentIdFrom(req: Request, res: Response): number | null {
    const contentId = Number(req.params.contentId);
    if (!Number.isInteger(contentId)) {
        res.status(400).json({ error: 'contentId must be an integer' });
        return null;
    }

    return contentId;
}

//Registers the reading-progress routes on the app.
export function apply_reading_api_routes(app: Express) {
    const learners = RoleGuard.requireRole('learner');

    //Saves the page the learner is on. 400 for a page outside the content.
    app.put('/api/reading/saveProgress/:contentId', learners, async (req, res) => {
        try {
            const contentId = contentIdFrom(req, res);
            if (contentId === null) return;

            const { page, totalPages } = req.body ?? {};
            if (!Number.isInteger(page) || page < 0) {
                res.status(400).json({ error: 'page must be a whole number from 0' });
                return;
            }
            if (totalPages !== undefined && !Number.isInteger(totalPages)) {
                res.status(400).json({ error: 'totalPages must be a whole number' });
                return;
            }

            res.send(await ReadingMethods.saveProgress(caller(res).id, contentId, page, totalPages));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //The page to resume at: 0 when the learner has not opened it before.
    app.get('/api/reading/getProgress/:contentId', learners, async (req, res) => {
        try {
            const contentId = contentIdFrom(req, res);
            if (contentId === null) return;

            res.send(await ReadingMethods.getProgress(caller(res).id, contentId));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
