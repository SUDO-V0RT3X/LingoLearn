import type { Exception } from '@/core/exceptions/models/ExceptionType';
import type { RouteLocationRaw } from 'vue-router';

/**
 * Why the server turned a learner away from content (HTTP 403):
 *   - 'setupRequired':      they have not saved learner setup yet;
 *   - 'parentLinkRequired': they are under 13 and no guardian is linked.
 */
export type AccessRefusal = 'setupRequired' | 'parentLinkRequired';

// The server's messages for the two refusals (backend/src/shared/learnerAccess.ts).
export const LEARNER_SETUP_REQUIRED = 'learner setup must be completed before accessing content';
export const PARENT_LINK_REQUIRED = 'an active parent link is required before accessing content';

/**
 * Reads which refusal a failed request was, or null when it was not one.
 * Only a 403 counts. The setup refusal is recognised by its message; any other
 * 403 from a learner content route is the parent-link rule.
 */
export function accessRefusalFrom(error: Exception | null | undefined): AccessRefusal | null {
  if (!error || error.statusCode !== 403) return null;
  if (error.message?.toLowerCase().includes('learner setup must be completed')) return 'setupRequired';
  return 'parentLinkRequired';
}

/** Where to send a learner for each refusal. */
export function routeForRefusal(refusal: AccessRefusal): RouteLocationRaw {
  return refusal === 'setupRequired'
    ? { name: 'learnerSetup' }
    : { name: 'parentLinking', query: { blocked: 'under13' } };
}
