import type { Express, Request, Response } from 'express';
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';
import { ProgressMethods } from './methods/progressMethods.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';

//reads the authenticated user the auth gate already verified
export function apply_progress_api_routes(app: Express): void {

    function caller(res: Response): AuthedUser {
        return res.locals.user as AuthedUser;
    }

    //is the learner allowed to attempt a level-up challenge now ?
    //every learner may call this for themselves; the server works out their
    //level, tests passed and cooldown, so nothing is taken from the request
    app.get('/api/progress/checkEligibility', RoleGuard.requireRole('learner'), async (req: Request, res: Response) => {
        try {
            res.json(await ProgressMethods.checkEligibility(caller(res).id));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //starts the learner's challenge (or resumes the one already started): the
    //questions come back without their answers, which stay on the server
    app.post('/api/progress/startChallenge', RoleGuard.requireRole('learner'), async (req: Request, res: Response) => {
        try {
            res.json(await ProgressMethods.startChallenge(caller(res).id));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //keeps the answers to the questions the learner has moved past, so leaving
    //and resuming carries on from the next question. Nothing is marked here.
    app.post('/api/progress/saveChallengeAnswers', RoleGuard.requireRole('learner'), async (req: Request, res: Response) => {
        try {
            const { challengeId, answers } = req.body ?? {};
            if (!Number.isSafeInteger(challengeId) || challengeId <= 0) {
                res.status(400).json({ error: 'challengeId (positive integer) is required' });
                return;
            }
            if (!Array.isArray(answers)) {
                res.status(400).json({ error: 'answers must be a list' });
                return;
            }
            res.json(await ProgressMethods.saveChallengeAnswers(caller(res).id, challengeId, answers));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //submission of a started challenge: the server marks the answers against
    //the questions it drew, then levels the learner up or starts the cooldown
    app.post('/api/progress/submitChallenge', RoleGuard.requireRole('learner'), async (req: Request, res: Response) => {
        try {
            const { challengeId, answers } = req.body ?? {};
            if (!Number.isSafeInteger(challengeId) || challengeId <= 0) {
                res.status(400).json({ error: 'challengeId (positive integer) is required' });
                return;
            }
            if (!Array.isArray(answers)) {
                res.status(400).json({ error: 'answers must be a list' });
                return;
            }
            res.json(await ProgressMethods.submitChallenge(caller(res).id, challengeId, answers));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Obtains the level of the learner
    app.get('/api/progress/getMyLevel', RoleGuard.requireRole('learner'), async (req: Request, res: Response) => {
        try {
            const level = await ProgressMethods.getLearnerLevel(caller(res).id);
            res.json({ level });
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
