// Unit tests for the level lock. isAboveLevel is pure, so these run without a
// database; test/integration/contentRoutes.test.ts and testAttemptsRoutes.test.ts
// check the whole gate through the routes.
import { describe, it, expect } from 'vitest';
import { isAboveLevel } from '../../src/routes/api/routes.api/contentRoutes/functions/learnerGate.js';

describe('isAboveLevel', () => {
    it('nominal: content below the learner\'s level is open', () => {
        expect(isAboveLevel(1, 3)).toBe(false);
    });

    it('boundary: content at the learner\'s own level is open, one above is locked', () => {
        expect(isAboveLevel(3, 3)).toBe(false);
        expect(isAboveLevel(4, 3)).toBe(true);
    });

    it('boundary: the top level is open to a learner at the top level', () => {
        expect(isAboveLevel(6, 6)).toBe(false);
    });

    it('invalid input: content with no level yet is never locked', () => {
        expect(isAboveLevel(null, 1)).toBe(false);
    });
});
