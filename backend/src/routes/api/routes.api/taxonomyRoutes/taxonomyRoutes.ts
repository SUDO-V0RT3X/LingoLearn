// Taxonomy routes: the level list, the tag vocabulary, and the tags on one
// piece of content (migrations/400_taxonomy.sql). Everything here is behind the
// auth gate; only an administrator may change the vocabulary or the levels.
// Tags are put on content only by submitting it (contentRoutes), so the owner
// and status checks there are the only way a tag link is ever written.
import type { Express, Request, Response } from 'express';
import { genericCatch } from '../../../../shared/functions/genericRouteCatch.js';
import { RoleGuard } from '../../../../shared/roleGuard.js';
import { TaxonomyMethods } from './methods/taxonomyMethods.js';
import { validateCreateTag, validateUpdateTag, validateUpdateLevel, ALLOWED_TAG_TYPES } from './functions/validateTaxonomy.js';
import type { TagKind } from './types/taxonomyType.js';

/** Reads :contentId, answering 400 itself when it is not a positive integer. */
function contentIdFrom(req: Request, res: Response): number | null {
    const contentId = Number(req.params.contentId);
    if (!Number.isInteger(contentId) || contentId <= 0) {
        res.status(400).json({ error: 'contentId must be a positive integer' });
        return null;
    }

    return contentId;
}

/** Reads :tagId, answering 400 itself when it is not a positive integer. */
function tagIdFrom(req: Request, res: Response): number | null {
    const tagId = Number(req.params.tagId);
    if (!Number.isInteger(tagId) || tagId <= 0) {
        res.status(400).json({ error: 'tagId must be a positive integer' });
        return null;
    }

    return tagId;
}

export function apply_taxonomy_api_routes(app: Express): void {
    app.get('/api/taxonomy/getLevels', async (req, res) => {
        try {
            res.json(await TaxonomyMethods.getLevels());
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    // ?type=theme narrows the list to the tags an author picks from.
    app.get('/api/taxonomy/getTags', async (req, res) => {
        try {
            const filterType = req.query.type as string | undefined;
            if (filterType && !ALLOWED_TAG_TYPES.includes(filterType as TagKind)) {
                res.status(400).json({ error: `type must be one of: ${ALLOWED_TAG_TYPES.join(', ')}` });
                return;
            }

            res.json(await TaxonomyMethods.getTags(filterType as TagKind | undefined));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.post('/api/taxonomy/createTag', RoleGuard.requireRole('administrator'), async (req, res) => {
        const validation = validateCreateTag(req.body);
        if (!validation.valid || !validation.value) {
            res.status(400).json({ error: validation.error });
            return;
        }

        try {
            res.status(201).json(await TaxonomyMethods.createTag(validation.value));
        } catch (e) {
            if ((e as { code?: string }).code === '23505') {
                res.status(409).json({ error: `A tag named "${validation.value.name}" already exists` });
                return;
            }

            genericCatch(req, res, e);
        }
    });

    app.get('/api/taxonomy/getTagsWithUsage', RoleGuard.requireRole('administrator'), async (req, res) => {
        try {
            const filterType = req.query.type as string | undefined;
            if (filterType && !ALLOWED_TAG_TYPES.includes(filterType as TagKind)) {
                res.status(400).json({ error: `type must be one of: ${ALLOWED_TAG_TYPES.join(', ')}` });
                return;
            }

            res.json(await TaxonomyMethods.getTagsWithUsage(filterType as TagKind | undefined));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.put('/api/taxonomy/updateTag/:tagId', RoleGuard.requireRole('administrator'), async (req, res) => {
        const tagId = tagIdFrom(req, res);
        if (tagId === null) return;

        const validation = validateUpdateTag(req.body);
        if (!validation.valid || !validation.value) {
            res.status(400).json({ error: validation.error });
            return;
        }

        try {
            const updated = await TaxonomyMethods.updateTag(tagId, validation.value);
            if (!updated) {
                res.status(404).json({ error: 'Tag not found' });
                return;
            }
            res.json(updated);
        } catch (e) {
            if ((e as { code?: string }).code === '23505') {
                res.status(409).json({ error: `A tag named "${validation.value.name}" already exists` });
                return;
            }

            genericCatch(req, res, e);
        }
    });

    app.delete('/api/taxonomy/deleteTag/:tagId', RoleGuard.requireRole('administrator'), async (req, res) => {
        const tagId = tagIdFrom(req, res);
        if (tagId === null) return;

        try {
            const deleted = await TaxonomyMethods.deleteTag(tagId);
            if (!deleted) {
                res.status(404).json({ error: 'Tag not found' });
                return;
            }
            res.json({ message: 'Tag deleted successfully' });
        } catch (e) {
            if ((e as { code?: string }).code === '23503') {
                res.status(409).json({ error: 'Cannot delete tag because it is currently assigned to content' });
                return;
            }

            genericCatch(req, res, e);
        }
    });

    app.put('/api/taxonomy/updateLevel/:levelNumber', RoleGuard.requireRole('administrator'), async (req, res) => {
        const levelNumber = Number(req.params.levelNumber);
        if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 6) {
            res.status(400).json({ error: 'levelNumber must be an integer between 1 and 6' });
            return;
        }

        const validation = validateUpdateLevel(req.body);
        if (!validation.valid || !validation.value) {
            res.status(400).json({ error: validation.error });
            return;
        }

        try {
            const updated = await TaxonomyMethods.updateLevel(levelNumber, validation.value);
            if (!updated) {
                res.status(404).json({ error: 'Level not found' });
                return;
            }
            res.json(updated);
        } catch (e) {
            genericCatch(req, res, e);
        }
    });

    app.get('/api/taxonomy/getContentTags/:contentId', async (req, res) => {
        const contentId = contentIdFrom(req, res);
        if (contentId === null) return;

        try {
            res.json(await TaxonomyMethods.getContentTags(contentId));
        } catch (e) {
            genericCatch(req, res, e);
        }
    });
}
