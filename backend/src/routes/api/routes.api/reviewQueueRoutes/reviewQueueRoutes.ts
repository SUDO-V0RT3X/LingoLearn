import type { Express } from 'express';
import { ReviewQueueMethods } from './methods/reviewQueueMethods.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';

export function apply_reviewQueue_api_routes(app: Express) {

    //Everything waiting for a decision. Moderators and administrators only.
    app.get('/api/reviewQueue/getReviewQueue', RoleGuard.requireRole('moderator', 'administrator'), async (req, res) => {
        try {
            const queue =  await ReviewQueueMethods.getReviewQueue();
            res.send(queue);
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

}
