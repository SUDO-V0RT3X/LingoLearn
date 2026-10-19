import type { UserRole } from '@/features/auth_feature/state/authStore';
import { i18n } from '@/i18n';

// Message lookup in the current interface language. Typed loosely: the full
// message schema is too deep for TypeScript to check key by key here.
const translate = (key: string): string => (i18n.global as unknown as { t: (key: string) => string }).t(key);

// The role-change rule the server enforces, mirrored so the modal can disable
// what the server would refuse. Learners sign in with a username and have no
// email; every other role is the reverse, so a change can't cross that line.

export const ALL_ROLES: readonly UserRole[] = ['learner', 'guardian', 'author', 'moderator', 'administrator'];

/** Whether a change from one role to another crosses the learner / non-learner line. */
export function crossesLearnerBoundary(from: UserRole, to: UserRole): boolean {
  return (from === 'learner') !== (to === 'learner');
}

/** Why `to` can't be chosen for someone who is `from` now (in the interface language), or null when it can. */
export function roleChangeBlockedReason(from: UserRole, to: UserRole): string | null {
  if (from === to) return translate('admin.changeRole.currentRole');
  if (crossesLearnerBoundary(from, to)) {
    return from === 'learner' ? translate('admin.changeRole.learnerCantBecome') : translate('admin.changeRole.onlyLearnerSignups');
  }
  return null;
}

/** The roles an administrator may move a `from` account into. */
export function allowedRoleChanges(from: UserRole): UserRole[] {
  return ALL_ROLES.filter((to) => roleChangeBlockedReason(from, to) === null);
}

/** One sentence explaining the rule for this account, in the interface language. */
export function learnerBoundaryExplanation(from: UserRole): string {
  return from === 'learner'
    ? translate('admin.changeRole.boundaryLearner')
    : translate('admin.changeRole.boundaryOther');
}
