// ============================================================================
// TEST ATTEMPTS — learner tests and the My Learning dashboard, mounted after the
// auth gate in routes.ts. Learners only. Answers are marked here with
// shared/grading.ts; the right answers never leave the server.
//
// Each handler: validate the request at the top → await TestAttemptMethods.x()
// → res.send(result) → genericCatch.
// ============================================================================
import type { Express, Response } from 'express';
import { TestAttemptMethods } from './methods/testAttemptMethods.js';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { requireLearnerContentAccess } from '../../../../shared/learnerAccess.js';
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';

/** The caller the auth gate verified. */
function caller(res: Response): AuthedUser {
    return res.locals.user as AuthedUser;
}

//Registers the test-attempt routes on the app.
export function apply_test_attempts_api_routes(app: Express): void {
    const learners = RoleGuard.requireRole('learner');

    //Marks one attempt at a content's test and records it (201). 400 for a
    //missing contentId, content with no questions, or malformed answers; 403
    //when the learner may not open the content; 404 if it is not approved.
    app.post('/api/testAttempts/submit', learners, async (req, res) => {
        try {
            const { contentId, answers } = req.body ?? {};
            if (!Number.isInteger(contentId) || contentId <= 0) {
                res.status(400).json({ error: 'contentId must be a positive integer' });
                return;
            }

            const learnerId = caller(res).id;
            await requireLearnerContentAccess(learnerId);
            res.status(201).send(await TestAttemptMethods.submitTest(learnerId, contentId, answers));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //The learner's own dashboard: level, progress toward the level-up
    //challenge, statistics, recent history and part-read content.
    app.get('/api/testAttempts/myLearning', learners, async (req, res) => {
        try {
            res.send(await TestAttemptMethods.getMyLearning(caller(res).id));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
