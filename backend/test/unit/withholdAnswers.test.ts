// Unit tests for withholding the answers to question blocks. Both functions are
// pure, so these run without a database; the route test in
// test/integration/contentRoutes.test.ts checks the same thing through getContent.
import { describe, it, expect } from 'vitest';
import { seesAnswers, withoutAnswers } from '../../src/routes/api/routes.api/contentRoutes/functions/withholdAnswers.js';
import type { ContentPages } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';
import type { AuthedUser } from '../../src/routes/api/routes.api/authRoutes/authApplyAllRoute.js';

const choice = { itemType: 'Multiple Choice' as const,
                 value: { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'], correctOption: 0 } };
const gap = { itemType: 'Fill in the Blank' as const,
              value: { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'] } };
const listen = { itemType: 'Listen and Choose' as const,
                 value: { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?',
                          options: ['Who is that?', 'Where are you?'], correctOption: 1 } };
const text = { itemType: 'Text' as const, value: { title: 'Greetings', text: 'Sawubona' } };
const clip = { itemType: 'Audio' as const, value: { title: 'Hello', fileUrl: 'a.mp3', transcript: 'Sawubona' } };

//Every field name anywhere in the pages, so a test can say one never appears.
const fieldsIn = (pages: ContentPages) => pages.flat().flatMap(block => Object.keys(block.value));

describe('withoutAnswers', () => {
    it('nominal: takes the right answer out of a multiple choice block and keeps the question', () => {
        const [[block]] = withoutAnswers([[choice]]);
        expect(block).toEqual({ itemType: 'Multiple Choice',
                                value: { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'] } });
    });

    it('nominal: takes the accepted spellings out of a fill in the blank block', () => {
        const [[block]] = withoutAnswers([[gap]]);
        expect(block).toEqual({ itemType: 'Fill in the Blank',
                                value: { title: 'Greetings', sentence: 'You say [] in the morning.' } });
    });

    it('nominal: takes the right answer and the transcript out of a listening question and keeps the clip', () => {
        const [[block]] = withoutAnswers([[listen]]);
        // The transcript is what the clip says, so it would answer the question.
        expect(block).toEqual({ itemType: 'Listen and Choose',
                                value: { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3',
                                         options: ['Who is that?', 'Where are you?'] } });
    });

    it('a plain audio clip keeps its transcript: only a listening question would be given away by it', () => {
        expect(withoutAnswers([[clip]])[0][0].value).toHaveProperty('transcript', 'Sawubona');
    });

    it('no answer field survives anywhere, across several pages', () => {
        const fields = fieldsIn(withoutAnswers([[text, choice], [gap], [clip, listen]]));
        expect(fields).not.toContain('correctOption');
        expect(fields).not.toContain('accepted');
    });

    it('blocks with nothing to hide come back exactly as they were', () => {
        expect(withoutAnswers([[text, clip]])).toEqual([[text, clip]]);
    });

    it('a field nobody has listed as safe is withheld, not passed through', () => {
        const withExtra = { ...choice, value: { ...choice.value, explanation: 'Sawubona means I see you' } };
        expect(Object.keys(withoutAnswers([[withExtra]])[0][0].value)).not.toContain('explanation');
    });

    it('a block type it does not know is emptied, not passed through', () => {
        const unknown = { itemType: 'Question', value: { prompt: 'Pick one', choices: ['a', 'b'], correctIndex: 1 } };
        const [[block]] = withoutAnswers([[unknown]] as unknown as ContentPages);
        expect(block).toEqual({ itemType: 'Question', value: {} });
    });

    it('the pages passed in are not changed', () => {
        const pages: ContentPages = [[structuredClone(choice), structuredClone(gap)]];
        withoutAnswers(pages);
        expect(pages).toEqual([[choice, gap]]);
    });

    it('boundary: no pages, and an empty page', () => {
        expect(withoutAnswers([])).toEqual([]);
        expect(withoutAnswers([[]])).toEqual([[]]);
    });
});

describe('seesAnswers', () => {
    const as = (role: AuthedUser['role'], id = 50) => ({ id, role } as AuthedUser);
    const authorId = 7;

    it('the author of the content sees its answers', () => {
        expect(seesAnswers(as('author', authorId), authorId)).toBe(true);
    });

    it('reviewers see the answers of content they did not write', () => {
        expect(seesAnswers(as('moderator'), authorId)).toBe(true);
        expect(seesAnswers(as('administrator'), authorId)).toBe(true);
    });

    it('a learner, a guardian, or another author does not', () => {
        expect(seesAnswers(as('learner'), authorId)).toBe(false);
        expect(seesAnswers(as('guardian'), authorId)).toBe(false);
        expect(seesAnswers(as('author'), authorId)).toBe(false);
    });
});
