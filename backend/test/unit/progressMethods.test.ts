// The pieces of the level-up challenge that need no database, tested against
// fixtures: what a learner is sent, and how an attempt is marked. The database
// paths (eligibility, start, submit) are covered end to end in
// test/integration/progressRoutes.test.ts with accounts that test creates.
import { describe, it, expect } from 'vitest';
import { gradeAnswers } from '../../src/shared/grading.js';
import { withoutAnswers } from '../../src/routes/api/routes.api/contentRoutes/functions/withholdAnswers.js';
import { QuestionSelector } from '../../src/routes/api/routes.api/progressRoutes/methods/questionSelector.js';
import type { ContentBlock } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';
import { ApiError } from '../../src/shared/errors/ApiError.js';

const drawn: ContentBlock[] = [
    { itemType: 'Multiple Choice', value: { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba'], correctOption: 0 } },
    { itemType: 'Fill in the Blank', value: { title: '', sentence: 'Ngi[] kahle', accepted: ['philile'] } },
    { itemType: 'Listen and Choose', value: { title: '', fileUrl: '/uploads/audio/a.mp3', transcript: 'Yebo', options: ['No', 'Yes'], correctOption: 1 } },
    { itemType: 'Multiple Choice', value: { title: '', question: 'Bye?', options: ['Sala kahle', 'Sawubona'], correctOption: 0 } },
    { itemType: 'Multiple Choice', value: { title: '', question: 'Thanks?', options: ['Ngiyabonga', 'Yebo'], correctOption: 0 } },
];

describe('ProgressMethods: what a learner is sent', () => {
    it('drawn questions are all answerable', () => {
        expect(drawn.every((block) => QuestionSelector.isAnswerable(block))).toBe(true);
    });

    it('the questions sent to the learner carry no answers, in the same order', () => {
        const sent = withoutAnswers([drawn])[0];
        expect(sent).toHaveLength(drawn.length);
        expect(sent.map((block) => block.itemType)).toEqual(drawn.map((block) => block.itemType));
        for (const block of sent) {
            expect(block.value).not.toHaveProperty('correctOption');
            expect(block.value).not.toHaveProperty('accepted');
        }
        expect(sent[0].value).toMatchObject({ question: 'Hello?', options: ['Sawubona', 'Hamba'] });
    });
});

describe('ProgressMethods: marking a challenge against the stored questions', () => {
    it('all right scores 100%', () => {
        expect(gradeAnswers([drawn], [0, 'philile', 1, 0, 0]).percent).toBe(100);
    });

    it('typed answers ignore case and surrounding spaces', () => {
        expect(gradeAnswers([drawn], [0, '  PHILILE ', 1, 0, 0]).score).toBe(5);
    });

    it('4 of 5 is 80%, 3 of 5 is 60%: the pass mark decides, not the client', () => {
        expect(gradeAnswers([drawn], [0, 'philile', 1, 0, 1]).percent).toBe(80);
        expect(gradeAnswers([drawn], [0, 'philile', 0, 0, 1]).percent).toBe(60);
    });

    it('unanswered questions are wrong, not an error', () => {
        expect(gradeAnswers([drawn], [null, null, null, null, null]).score).toBe(0);
    });

    it('a wrong number of answers is a broken request (400)', () => {
        try {
            gradeAnswers([drawn], [0, 1]);
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError);
            expect((e as ApiError).status).toBe(400);
        }
    });
});
