import { describe, it, expect } from 'vitest';
import { DecisionValidator } from '../decisionValidator';

describe('DecisionValidator (LIN-39)', () => {
    it('rejecting with a blank reason is invalid', () => {
        const result = DecisionValidator.validate('reject', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('A reason is required when rejecting.');
    });

    it('rejecting with a whitespace-only reason is also invalid', () => {
        const result = DecisionValidator.validate('reject', '    ');
        expect(result.valid).toBe(false);
    });

    it('rejecting with a real reason is valid', () => {
        const result = DecisionValidator.validate('reject', 'Missing a transcript.');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });


    it('approving never requires a reason, even blank', () => {
        const result = DecisionValidator.validate('approve', '');
        expect(result.valid).toBe(true);
    });
});