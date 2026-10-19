import { describe, it, expect } from 'vitest';
import { DecisionMessageBuilder } from '../decisionMessageBuilder';

describe('DecisionMessageBuilder (LIN-39)', () => {
    it('approve message mentions publishing to learners', () => {
        expect(DecisionMessageBuilder.messageFor('approve')).toBe(
            'Approved — will be published to learners.',
        );
    });

    it('reject message mentions feedback to the author', () => {
        expect(DecisionMessageBuilder.messageFor('reject')).toBe(
            'Rejected — feedback sent to the author.',
        );
    });

});