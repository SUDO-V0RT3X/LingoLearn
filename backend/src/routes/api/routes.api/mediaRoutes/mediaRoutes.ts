// Upload and list endpoints for the audio clips and images that content blocks
// point at. Authors only: these routes sit behind the auth gate and write to
// disk. There is deliberately no delete route — approved content may still
// reference a file, and nothing tracks that yet.
import type { Express, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import type { AuthedUser } from '../authRoutes/authApplyAllRoute.js';
import { CONTENT_LIMITS } from '../contentRoutes/functions/validateContent.js';
import { validateUploadedAudio } from './functions/validateAudio.js';
import { STORED_EXTENSION, validateUploadedImage } from './functions/validateImage.js';
import { listUploads, storeImage, storeUpload } from './functions/mediaStorage.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Files are held in memory so they can be checked before anything is written.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

/**
 * Runs multer and turns its own failures into answers the frontend can show:
 * a file over the limit is 413, not a generic 500.
 */
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

export function apply_media_api_routes(app: Express) {
    const authors = RoleGuard.requireRole('author', 'administrator');

    //Checks the clip, stores it under a generated name, and answers with the
    //relative URL to put in the block.
    app.post('/api/media/uploadAudio', authors, receiveFile, async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file received. Please attach an audio file.' });
                return;
            }

            const problem = validateUploadedAudio(req.file);
            if (problem) {
                res.status(400).json({ error: problem });
                return;
            }

            const title = String(req.body.title ?? '').trim();
            if (title.length > CONTENT_LIMITS.titleLength) {
                res.status(400).json({ error: `title can be at most ${CONTENT_LIMITS.titleLength} characters` });
                return;
            }
            const transcript = String(req.body.transcript ?? '').trim();
            if (transcript.length > CONTENT_LIMITS.transcriptLength) {
                res.status(400).json({ error: `a transcript can be at most ${CONTENT_LIMITS.transcriptLength} characters` });
                return;
            }

            const user = res.locals.user as AuthedUser;
            const stored = await storeUpload(req.file.originalname, req.file.buffer, { title, transcript }, user.id);
            res.status(201).json(stored);
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //The caller's own clips, newest first; an administrator sees everyone's.
    app.get('/api/media/listAudio', authors, async (req, res) => {
        try {
            const user = res.locals.user as AuthedUser;
            res.json(await listUploads(user.role === 'administrator' ? null : user.id));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    //Checks the picture (type, extension and first bytes must agree), stores it
    //under a generated name, and answers with the relative URL for the block.
    app.post('/api/media/uploadImage', authors, receiveFile, async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file received. Please attach an image.' });
                return;
            }

            const check = validateUploadedImage(req.file);
            if (!check.ok) {
                res.status(400).json({ error: check.error });
                return;
            }

            const stored = await storeImage(req.file.buffer, STORED_EXTENSION[check.format]);
            res.status(201).json({ fileUrl: stored.fileUrl });
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
