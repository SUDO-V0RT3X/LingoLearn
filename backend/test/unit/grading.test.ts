import { describe, it, expect } from 'vitest';
import { gradeAnswers, isAnswerCorrect, questionBlocksOf } from '../../src/shared/grading.js';
import type { ContentBlock, ContentPages } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';

const choice: ContentBlock = { itemType: 'Multiple Choice',
    value: { title: 'Greetings', question: 'How do you say hello?', options: ['Hamba kahle', 'Sawubona'], correctOption: 1 } };
const gap: ContentBlock = { itemType: 'Fill in the Blank',
    value: { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['Sawubona', 'sawubona'] } };
const listen: ContentBlock = { itemType: 'Listen and Choose',
    value: { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?', options: ['Who is that?', 'Where are you?'], correctOption: 0 } };
const text: ContentBlock = { itemType: 'Text', value: { title: 'Read', text: 'Sawubona means hello.' } };

const pages: ContentPages = [[text, choice], [gap, text, listen]];

describe('questionBlocksOf', () => {
    it('nominal: picks the question blocks in reading order, across pages', () => {
        expect(questionBlocksOf(pages).map(block => block.itemType)).toEqual(['Multiple Choice', 'Fill in the Blank', 'Listen and Choose']);
    });

    it('boundary: content with no questions has none', () => {
        expect(questionBlocksOf([[text], []])).toEqual([]);
    });
});

describe('isAnswerCorrect', () => {
    it('nominal: the marked option is right and another option is wrong', () => {
        expect(isAnswerCorrect(choice, 1)).toBe(true);
        expect(isAnswerCorrect(choice, 0)).toBe(false);
    });

    it('a typed answer matches an accepted spelling ignoring case and spaces', () => {
        expect(isAnswerCorrect(gap, '  SAWUBONA ')).toBe(true);
        expect(isAnswerCorrect(gap, 'sanibonani')).toBe(false);
    });

    it('invalid: an empty, missing or wrongly-typed answer is wrong, not an error', () => {
        expect(isAnswerCorrect(gap, '   ')).toBe(false);
        expect(isAnswerCorrect(choice, null)).toBe(false);
        expect(isAnswerCorrect(choice, '1')).toBe(false);
        expect(isAnswerCorrect(gap, 1)).toBe(false);
    });

    it('a listening question is marked like a multiple choice one', () => {
        expect(isAnswerCorrect(listen, 0)).toBe(true);
        expect(isAnswerCorrect(listen, 1)).toBe(false);
    });
});

describe('gradeAnswers', () => {
    it('nominal: counts the right answers and rounds the percentage', () => {
        const result = gradeAnswers(pages, [1, 'sawubona', 1]);
        expect(result).toEqual({ total: 3, score: 2, percent: 67, questions: [{ correct: true }, { correct: true }, { correct: false }] });
    });

    it('boundary: all right, all unanswered, and no questions at all', () => {
        expect(gradeAnswers(pages, [1, 'Sawubona', 0]).percent).toBe(100);
        expect(gradeAnswers(pages, [null, null, null]).score).toBe(0);
        expect(gradeAnswers([[text]], [])).toEqual({ total: 0, score: 0, percent: 0, questions: [] });
    });

    it('invalid: refuses a list of the wrong length with a 400', () => {
        expect(() => gradeAnswers(pages, [1])).toThrow(expect.objectContaining({ status: 400 }));
    });

    it('boundary: a typed answer of exactly 200 characters is marked, one of 201 is refused with a 400', () => {
        expect(gradeAnswers([[gap]], ['x'.repeat(200)]).score).toBe(0);
        expect(() => gradeAnswers([[gap]], ['x'.repeat(201)])).toThrow(expect.objectContaining({ status: 400 }));
    });

    it('invalid: refuses something that is not a list, or holds fractions or objects', () => {
        expect(() => gradeAnswers(pages, 'all of them')).toThrow(expect.objectContaining({ status: 400 }));
        expect(() => gradeAnswers(pages, [1.5, 'a', 0])).toThrow(expect.objectContaining({ status: 400 }));
        expect(() => gradeAnswers(pages, [{}, 'a', 0])).toThrow(expect.objectContaining({ status: 400 }));
    });
});
