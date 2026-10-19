
import type { Express } from 'express';
import { ReviewDetailMethods } from './methods/reviewDetailMethods.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';

export function apply_reviewDetail_api_routes(app: Express) {
    const moderators = RoleGuard.requireRole('moderator', 'administrator');

    //One submitted piece of content, with its pages and decision history.
    app.get('/api/reviewDetail/getReviewDetail/:id', moderators, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id)) {
                res.status(400).json({ error: 'ID must be an integer' });
                return;
            }
            const detail = await ReviewDetailMethods.getReviewDetail(id);
            res.send(detail);
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Every decision made on the signed-in author's own content, for their
    //dashboard. Authors read their own feedback; nobody else's.
    app.get('/api/reviewDetail/getMyFeedback', RoleGuard.requireRole('author', 'administrator'), async (req, res) => {
        try {
            const author = res.locals.user as AuthedUser;
            res.send(await ReviewDetailMethods.getFeedbackForAuthor(author.id));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Approves or rejects it. Rejecting needs a reason: it is what the author
    //sees on their dashboard and works from.
    app.post('/api/reviewDetail/decideContent/:id', moderators, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isInteger(id)) {
                res.status(400).json({ error: 'ID must be an integer' });
                return;
            }

            const { decision, reason } = req.body ?? {};
            if (decision !== 'approved' && decision !== 'rejected') {
                res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
                return;
            }
            if (decision === 'rejected') {
                if (typeof reason !== 'string' || reason.trim() === '') {
                    res.status(400).json({ error: 'a rejection needs a reason' });
                    return;
                }
                const trimmedReason = reason.trim();
                if (trimmedReason.length < 5 || trimmedReason.length > 1000) {
                    res.status(400).json({ error: 'rejection reason must be between 5 and 1000 characters' });
                    return;
                }
            }

            const moderator = res.locals.user as AuthedUser;
            res.send(await ReviewDetailMethods.decideContent(id, moderator.id, { decision, reason }));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
