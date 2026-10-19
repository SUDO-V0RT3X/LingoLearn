// The one check every learner-facing read of a single piece of content goes
// through: the reader, a test submission and saved reading progress. Keeping it
// in one place means opening content by its id can never be a way round the
// rules the Explore list applies.
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { requireLearnerContentAccess, type LearnerAccess } from '../../../../../shared/learnerAccess.js';
import { currentLevelOf } from '../../../../../shared/levelRules.js';
import type { ContentType } from '../types/contentType.js';

/** Whether content at this level is above a learner's level. Content with no level yet is never locked. */
export function isAboveLevel(contentLevel: number | null, learnerLevel: number): boolean {
    return contentLevel !== null && contentLevel > learnerLevel;
}

/**
 * Refuses (403) a learner content they may not open: setup unfinished, an
 * under-13 learner with no guardian linked, adult content for a child, or
 * content above their level. Returns their access and level for callers that
 * need them. Whether the content is approved is the caller's check.
 */
export async function requireLearnerMayOpen(
    learnerId: number,
    content: Pick<ContentType, 'childFriendly' | 'level'>,
): Promise<{ access: LearnerAccess; learnerLevel: number }> {
    const access = await requireLearnerContentAccess(learnerId);
    if (access.contentAudience === 'child' && !content.childFriendly) {
        throw new ApiError(403, 'this content is not marked child-friendly');
    }

    const learnerLevel = await currentLevelOf(learnerId);
    if (isAboveLevel(content.level, learnerLevel)) {
        throw new ApiError(403, 'this content is above your level');
    }

    return { access, learnerLevel };
}
