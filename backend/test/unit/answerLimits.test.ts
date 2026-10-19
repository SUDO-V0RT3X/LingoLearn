// The 200-character answer limit, everywhere an answer is written: options and
// accepted spellings an author saves, and the answer a learner types in placement.
import { describe, it, expect } from 'vitest';
import { checkContentShape } from '../../src/routes/api/routes.api/contentRoutes/functions/validateContent.js';
import { validateSubmitAnswerInput } from '../../src/routes/api/routes.api/placementRoutes/types/placementType.js';
import { ANSWER_TOO_LONG, MAX_ANSWER_LENGTH } from '../../src/shared/answerRules.js';

const long = 'x'.repeat(MAX_ANSWER_LENGTH + 1);
const exact = 'x'.repeat(MAX_ANSWER_LENGTH);

describe('author answers', () => {
    it('nominal: options and spellings of exactly 200 characters are accepted', () => {
        expect(checkContentShape([[{ itemType: 'Multiple Choice', value: { title: '', question: 'q', options: [exact, 'b'], correctOption: 0 } }]])).toBeNull();
        expect(checkContentShape([[{ itemType: 'Fill in the Blank', value: { title: '', sentence: 'a []', accepted: [exact] } }]])).toBeNull();
    });

    it('invalid: an option or an accepted spelling over 200 characters is refused', () => {
        expect(checkContentShape([[{ itemType: 'Multiple Choice', value: { title: '', question: 'q', options: ['a', long], correctOption: 0 } }]])).toBe(ANSWER_TOO_LONG);
        expect(checkContentShape([[{ itemType: 'Listen and Choose', value: { title: '', fileUrl: '', transcript: '', options: [long, 'b'], correctOption: 0 } }]])).toBe(ANSWER_TOO_LONG);
        expect(checkContentShape([[{ itemType: 'Fill in the Blank', value: { title: '', sentence: 'a []', accepted: ['ok', long] } }]])).toBe(ANSWER_TOO_LONG);
    });
});

describe('placement answers', () => {
    it('boundary: 200 characters is valid and 201 is refused', () => {
        expect(validateSubmitAnswerInput({ questionId: 'q1', answer: exact }).valid).toBe(true);
        const refused = validateSubmitAnswerInput({ questionId: 'q1', answer: long });
        expect(refused.valid).toBe(false);
    });
});

describe('transcripts', () => {
    const block = (transcript: string) => [[{ itemType: 'Audio' as const, value: { title: '', fileUrl: '/uploads/audio/a.mp3', transcript } }]];

    it('boundary: a transcript of 10000 characters is accepted, longer than the 2000 paragraph limit', () => {
        expect(checkContentShape(block('x'.repeat(10000)))).toBeNull();
    });

    it('invalid: a transcript over 10000 characters is refused', () => {
        expect(checkContentShape(block('x'.repeat(10001)))).toBe('a transcript can be at most 10000 characters');
    });

    it('other text in a block keeps the 2000 limit', () => {
        expect(checkContentShape([[{ itemType: 'Text', value: { title: '', text: 'x'.repeat(2001) } }]]))
            .toBe('text in a block can be at most 2000 characters');
    });
});
