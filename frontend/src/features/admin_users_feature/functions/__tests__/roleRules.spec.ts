import { describe, expect, it } from 'vitest';
import { allowedRoleChanges, crossesLearnerBoundary, roleChangeBlockedReason } from '../roleRules';

describe('roleRules', () => {
  it('nominal: staff and guardian roles can move between each other', () => {
    expect(allowedRoleChanges('guardian')).toEqual(['author', 'moderator', 'administrator']);
    expect(allowedRoleChanges('moderator')).toEqual(['guardian', 'author', 'administrator']);
  });

  it('boundary: a learner has no role they can be changed to', () => {
    expect(allowedRoleChanges('learner')).toEqual([]);
  });

  it('invalid: crossing into or out of learner is blocked with a reason, either way', () => {
    expect(crossesLearnerBoundary('learner', 'administrator')).toBe(true);
    expect(crossesLearnerBoundary('author', 'learner')).toBe(true);
    expect(crossesLearnerBoundary('author', 'guardian')).toBe(false);
    expect(roleChangeBlockedReason('learner', 'guardian')).toMatch(/Learners/);
    expect(roleChangeBlockedReason('administrator', 'learner')).toMatch(/learner/);
    expect(roleChangeBlockedReason('author', 'author')).toBe('Current role');
    expect(roleChangeBlockedReason('author', 'moderator')).toBeNull();
  });
});
