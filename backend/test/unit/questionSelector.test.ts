import { describe, it, expect } from 'vitest';
import {
    QuestionSelector, CHALLENGE_QUESTION_COUNT, MIN_CHALLENGE_QUESTIONS,
} from '../../src/routes/api/routes.api/progressRoutes/methods/questionSelector.js';
import type { ChallengeCandidate } from '../../src/routes/api/routes.api/progressRoutes/types/progressType.js';
import type { ContentBlock } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';
import { ApiError } from '../../src/shared/errors/ApiError.js';

function makePool(size: number): { contentId: number }[] {
    return Array.from({ length: size }, (_, i) => ({ contentId: i + 1 }));
}

const choice = (question: string): ContentBlock => ({
    itemType: 'Multiple Choice',
    value: { title: '', question, options: ['yes', 'no'], correctOption: 0 },
});

function candidates(count: number, language: string, from = 1): ChallengeCandidate[] {
    return Array.from({ length: count }, (_, i) => ({ contentId: from + i, language, block: choice(`Q${from + i}`) }));
}

describe('QuestionSelector (LIN-74)', () => {
    it('selects exactly the requested count when the pool is larger', () => {
        const result = QuestionSelector.selectQuestions(makePool(20), 15, (arr) => arr);
        expect(result).toHaveLength(15);
    });

    it('returns every question, not fewer or an error, when the pool is smaller than requested', () => {
        const result = QuestionSelector.selectQuestions(makePool(5), 15, (arr) => arr);
        expect(result).toHaveLength(5);
    });

    it('an identity shuffle selects the first N items in original order', () => {
        const result = QuestionSelector.selectQuestions(makePool(20), 3, (arr) => arr);
        expect(result.map((q) => q.contentId)).toEqual([1, 2, 3]);
    });

    it('never returns a duplicate question, even with real randomness', () => {
        const result = QuestionSelector.selectQuestions(makePool(18), 15);
        expect(new Set(result.map((q) => q.contentId)).size).toBe(15);
    });

    it('does not mutate the original pool array', () => {
        const pool = makePool(5);
        QuestionSelector.selectQuestions(pool, 3, (arr) => arr.reverse());
        expect(pool.map((q) => q.contentId)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe('QuestionSelector.drawForChallenge', () => {
    it('draws at most 15 questions from a large pool', () => {
        expect(QuestionSelector.drawForChallenge(candidates(40, 'zulu'), 'zulu')).toHaveLength(CHALLENGE_QUESTION_COUNT);
    });

    it('prefers the learner\'s language when it has enough questions', () => {
        const pool = [...candidates(10, 'english'), ...candidates(MIN_CHALLENGE_QUESTIONS, 'zulu', 100)];
        const drawn = QuestionSelector.drawForChallenge(pool, 'zulu');
        expect(drawn).toHaveLength(MIN_CHALLENGE_QUESTIONS);
        expect(drawn.every((candidate) => candidate.language === 'zulu')).toBe(true);
    });

    it('falls back to every language when the learner\'s own has too few', () => {
        const pool = [...candidates(8, 'english'), ...candidates(2, 'zulu', 100)];
        expect(QuestionSelector.drawForChallenge(pool, 'zulu')).toHaveLength(10);
        expect(QuestionSelector.drawForChallenge(pool, null)).toHaveLength(10);
    });

    it('runs with exactly the minimum number of questions', () => {
        expect(QuestionSelector.drawForChallenge(candidates(MIN_CHALLENGE_QUESTIONS, 'zulu'), 'zulu')).toHaveLength(5);
    });

    it('refuses with 409 when there are fewer than the minimum', () => {
        const attempt = () => QuestionSelector.drawForChallenge(candidates(MIN_CHALLENGE_QUESTIONS - 1, 'zulu'), 'zulu');
        expect(attempt).toThrow(ApiError);
        try { attempt(); } catch (e) { expect((e as ApiError).status).toBe(409); }
    });

    it('leaves out questions that cannot be marked before counting', () => {
        const broken: ChallengeCandidate[] = [
            { contentId: 90, language: 'zulu', block: { itemType: 'Multiple Choice', value: { question: 'Q', options: ['a', ''], correctOption: 1 } } },
            { contentId: 91, language: 'zulu', block: { itemType: 'Fill in the Blank', value: { sentence: 'a []', accepted: [' '] } } },
            { contentId: 92, language: 'zulu', block: { itemType: 'Listen and Choose', value: { fileUrl: '', options: ['a', 'b'], correctOption: 0 } } },
            { contentId: 93, language: 'zulu', block: { itemType: 'Text', value: { text: 'not a question' } } },
        ];
        expect(() => QuestionSelector.drawForChallenge([...candidates(4, 'zulu'), ...broken], 'zulu')).toThrow(ApiError);
    });
});

describe('QuestionSelector.isAnswerable', () => {
    it('accepts each well-formed question type', () => {
        expect(QuestionSelector.isAnswerable(choice('Q'))).toBe(true);
        expect(QuestionSelector.isAnswerable({ itemType: 'Fill in the Blank', value: { sentence: 'I []', accepted: ['am'] } })).toBe(true);
        expect(QuestionSelector.isAnswerable({
            itemType: 'Listen and Choose', value: { fileUrl: '/uploads/audio/a.mp3', options: ['a', 'b'], correctOption: 1 },
        })).toBe(true);
    });

    it('rejects a correct option outside the list', () => {
        expect(QuestionSelector.isAnswerable({
            itemType: 'Multiple Choice', value: { question: 'Q', options: ['a', 'b'], correctOption: 2 },
        })).toBe(false);
    });
});
