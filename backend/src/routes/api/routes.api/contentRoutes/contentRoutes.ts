// ============================================================================
// CONTENT — the content builder's routes, mounted after the auth gate in routes.ts.
// Writing is an author's own work: every write is guarded by role and by
// ownership in ContentMethods. Reading depends on who is asking — an author sees
// their own drafts, a moderator sees what is waiting, everyone sees approved.
//
// Each handler: validate the request at the top → await ContentMethods.x()
// → res.send(result) → genericCatch.
// ============================================================================
import type { Express, Request, Response } from 'express';
import { ContentMethods } from './methods/contentMethods.js';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';
import { checkContentShape, checkDraftFields, checkSubmission } from './functions/validateContent.js';
import { seesAnswers, withoutAnswers } from './functions/withholdAnswers.js';
import { requireLearnerContentAccess } from '../../../../shared/learnerAccess.js';
import { currentLevelOf } from '../../../../shared/levelRules.js';
import { isAboveLevel, requireLearnerMayOpen } from './functions/learnerGate.js';
import { isContentLanguage, type ContentLanguage, type LearnerContentSummary } from './types/contentType.js';

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

//Registers the content routes on the app.
export function apply_content_api_routes(app: Express) {
    const authors = RoleGuard.requireRole('author', 'administrator');

    //Everything the signed-in author has written, for their dashboard.
    app.get('/api/content/getMyContent', authors, async (req, res) => {
        try {
            res.send(await ContentMethods.getMyContent(caller(res).id));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //The review queue: everything waiting for a decision.
    app.get('/api/content/getPendingContent', RoleGuard.requireRole('moderator', 'administrator'), async (req, res) => {
        try {
            res.send(await ContentMethods.getPendingContent());
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Approved content, narrowed by level, language and the child-friendly gate.
    //For a learner the onboarding slice decides: setup must be finished, an
    //under-13 learner needs a guardian linked, and they only ever see
    //child-friendly content whatever the request asks for. Content above a
    //learner's level is listed but marked locked; getContent refuses it.
    app.get('/api/content/getApprovedContent', async (req, res) => {
        try {
            const user = caller(res);
            let forceChildFriendly = false;
            let learnerLevel: number | null = null;
            if (user.role === 'learner') {
                const access = await requireLearnerContentAccess(user.id);
                forceChildFriendly = access.contentAudience === 'child';
                learnerLevel = await currentLevelOf(user.id);
            }

            const { level, language, childFriendlyOnly } = req.query;
            if (level !== undefined && !Number.isInteger(Number(level))) {
                res.status(400).json({ error: 'level must be an integer' });
                return;
            }
            if (language !== undefined && !isContentLanguage(language)) {
                res.status(400).json({ error: 'language must be english or zulu' });
                return;
            }

            const rows = await ContentMethods.getApprovedContent({
                level: level === undefined ? undefined : Number(level),
                language: language as ContentLanguage | undefined,
                childFriendlyOnly: forceChildFriendly || childFriendlyOnly === 'true',
            });
            //Only a learner has a level to be locked out by.
            const withLocks: LearnerContentSummary[] = rows.map(row => ({
                ...row,
                locked: learnerLevel !== null && isAboveLevel(row.level, learnerLevel),
            }));
            res.send(withLocks);
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Returns the content with this id. An author reads their own work, a
    //moderator anything submitted, and any signed-in reader approved content.
    //A learner also passes the same gate as the approved list. Only the author
    //and reviewers get the answers to its questions.
    app.get('/api/content/getContent/:contentId', async (req, res) => {
        try {
            const contentId = contentIdFrom(req, res);
            if (contentId === null) return;

            const result = await ContentMethods.getContent(contentId);
            const user = caller(res);
            const mayRead = result.status === 'approved'
                || user.role === 'administrator'
                || (user.role === 'moderator' && result.status !== 'draft')
                || result.authorId === user.id;

            if (!mayRead) {
                res.status(403).json({ error: 'this content belongs to another author' });
                return;
            }

            //Opening content by its id must not be a way round the list's gate:
            //setup finished, a parent link when under 13, child-friendly content
            //only for a child, and nothing above the learner's level.
            if (user.role === 'learner') await requireLearnerMayOpen(user.id, result);

            res.send(seesAnswers(user, result.authorId) ? result : { ...result, content: withoutAnswers(result.content) });
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Saves new content as a draft and returns it with its new id (201). 400 for malformed content.
    app.post('/api/content/createContent', authors, async (req, res) => {
        try {
            const body = req.body ?? {};
            const problem = checkContentShape(body.content) ?? checkDraftFields(body);
            if (problem) {
                res.status(400).json({ error: problem });
                return;
            }

            res.status(201).send(await ContentMethods.createContent(caller(res).id, body));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Replaces a draft's content. 400 for malformed input, 403 if it is another
    //author's, 404 if none, 409 once it is pending or approved.
    app.put('/api/content/editContent/:contentId', authors, async (req, res) => {
        try {
            const contentId = contentIdFrom(req, res);
            if (contentId === null) return;

            const body = req.body ?? {};
            const problem = checkContentShape(body.content) ?? checkDraftFields(body);
            if (problem) {
                res.status(400).json({ error: problem });
                return;
            }

            res.send(await ContentMethods.editContent(contentId, caller(res).id, body));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Deletes a draft. 400 for a non-integer id, 403 if it is another author's,
    //404 if none, 409 once it is pending or approved.
    app.delete('/api/content/deleteContent/:contentId', authors, async (req, res) => {
        try {
            const contentId = contentIdFrom(req, res);
            if (contentId === null) return;

            await ContentMethods.deleteContent(contentId, caller(res).id);
            res.status(200).json({ message: 'content deleted successfully' });
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Runs the submission checks, then saves everything and sets the draft to pending.
    //400 names the first failed check; 403, 404 and 409 as for editing.
    app.post('/api/content/submitContent/:contentId', authors, async (req, res) => {
        try {
            const contentId = contentIdFrom(req, res);
            if (contentId === null) return;

            const body = req.body ?? {};
            const problem = checkSubmission(body);
            if (problem) {
                res.status(400).json({ error: problem });
                return;
            }

            res.send(await ContentMethods.submitContent(contentId, caller(res).id, body));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
