// Unit tests for the submit-time rules on question blocks. checkSubmission is a
// pure function over a request body, so these run without a database — the
// route tests in test/integration/contentRoutes.test.ts cover the same rules
// through the real endpoint.
import { describe, it, expect } from 'vitest';
import { CONTENT_LIMITS, checkContentShape, checkDraftFields, checkSubmission }
    from '../../src/routes/api/routes.api/contentRoutes/functions/validateContent.js';

//Everything a submission needs besides its blocks.
const submission = (blocks: unknown[]) => ({
    content: [blocks],
    title: 'Saying hello',
    language: 'zulu',
    childFriendly: true,
    level: 2,
    chosenTags: [],
});

const choice = (over: object = {}) => ({
    itemType: 'Multiple Choice',
    value: { title: 'Greetings', question: 'How do you greet someone?',
             options: ['Sawubona', 'Hamba kahle'], correctOption: 0, ...over },
});

const gap = (over: object = {}) => ({
    itemType: 'Fill in the Blank',
    value: { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'], ...over },
});

const listen = (over: object = {}) => ({
    itemType: 'Listen and Choose',
    value: { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?',
             options: ['Who is that?', 'Where are you?'], correctOption: 0, ...over },
});

describe('checkSubmission on multiple choice blocks', () => {
    it('nominal: a finished question is accepted', () => {
        expect(checkSubmission(submission([choice()]))).toBeNull();
    });

    it('invalid input: no question written', () => {
        expect(checkSubmission(submission([choice({ question: '   ' })]))).toMatch(/needs a question/);
    });

    it('boundary: two answers is enough, one is not, and an empty answer does not count', () => {
        expect(checkSubmission(submission([choice({ options: ['Sawubona', 'Hamba kahle'] })]))).toBeNull();
        expect(checkSubmission(submission([choice({ options: ['Sawubona'] })]))).toMatch(/at least two answers/);
        expect(checkSubmission(submission([choice({ options: ['Sawubona', '  '] })]))).toMatch(/at least two answers/);
    });

    it('a third answer left empty is allowed, as long as two are filled in', () => {
        expect(checkSubmission(submission([choice({ options: ['Sawubona', 'Hamba kahle', ''] })]))).toBeNull();
    });

    it('invalid input: the same answer offered twice, whatever the case', () => {
        expect(checkSubmission(submission([choice({ options: ['Sawubona', 'Sawubona'] })])))
            .toMatch(/same answer twice/);
        expect(checkSubmission(submission([choice({ options: ['Sawubona', 'sawubona'] })])))
            .toMatch(/same answer twice/);
    });

    it('invalid input: the mark is out of range, not whole, or on an empty answer', () => {
        expect(checkSubmission(submission([choice({ correctOption: 2 })]))).toMatch(/marked as the right one/);
        expect(checkSubmission(submission([choice({ correctOption: -1 })]))).toMatch(/marked as the right one/);
        expect(checkSubmission(submission([choice({ correctOption: 0.5 })]))).toMatch(/marked as the right one/);
        expect(checkSubmission(submission([choice({ options: ['a', 'b', ' '], correctOption: 2 })])))
            .toMatch(/marked as the right one/);
    });

    it('invalid input: answers that are not a list of text', () => {
        expect(checkSubmission(submission([choice({ options: 'Sawubona' })]))).toMatch(/list of answers/);
        expect(checkSubmission(submission([choice({ options: [1, 2] })]))).toMatch(/list of answers/);
    });
});

describe('checkSubmission on fill in the blank blocks', () => {
    it('nominal: a sentence with one gap and a spelling is accepted', () => {
        expect(checkSubmission(submission([gap()]))).toBeNull();
    });

    it('invalid input: no sentence at all', () => {
        expect(checkSubmission(submission([gap({ sentence: '  ' })]))).toMatch(/needs a sentence/);
    });

    it('boundary: exactly one gap — none and two are both refused', () => {
        expect(checkSubmission(submission([gap({ sentence: 'You say nothing.' })]))).toMatch(/exactly one/);
        expect(checkSubmission(submission([gap({ sentence: 'You say [] and [].' })]))).toMatch(/exactly one/);
    });

    it('boundary: the marker is [] wherever it sits, and ___ no longer marks a gap', () => {
        expect(checkSubmission(submission([gap({ sentence: 'You say [[]] in the morning.' })]))).toBeNull();
        expect(checkSubmission(submission([gap({ sentence: 'You say ___ in the morning.' })]))).toMatch(/exactly one \[\]/);
    });

    it('invalid input: no spelling accepted', () => {
        expect(checkSubmission(submission([gap({ accepted: ['   '] })]))).toMatch(/spelling it accepts/);
        expect(checkSubmission(submission([gap({ accepted: [] })]))).toMatch(/spelling it accepts/);
    });
});

describe('checkSubmission on listen and choose blocks', () => {
    it('nominal: a clip with a transcript and two answers is accepted', () => {
        expect(checkSubmission(submission([listen()]))).toBeNull();
    });

    it('invalid input: no clip, or no transcript', () => {
        expect(checkSubmission(submission([listen({ fileUrl: '' })]))).toMatch(/needs a file/);
        expect(checkSubmission(submission([listen({ transcript: ' ' })]))).toMatch(/needs a transcript/);
    });

    it('it is held to the same answer rules as multiple choice', () => {
        expect(checkSubmission(submission([listen({ options: ['Who is that?'] })]))).toMatch(/at least two answers/);
        expect(checkSubmission(submission([listen({ correctOption: 9 })]))).toMatch(/marked as the right one/);
    });
});

describe('checkSubmission on image blocks', () => {
    const image = (fileUrl: string) => ({ itemType: 'Image', value: { title: 'A hut', fileUrl, altText: 'A round hut' } });

    it('nominal: an image uploaded here is accepted', () => {
        expect(checkSubmission(submission([image('/uploads/images/0b6e.png')]))).toBeNull();
    });

    it('boundary: the folder itself must be the prefix, not just mentioned', () => {
        expect(checkSubmission(submission([image('/uploads/imagesx/a.png')]))).toMatch(/uploaded here/);
        expect(checkSubmission(submission([image('/uploads/audio/a.png')]))).toMatch(/uploaded here/);
    });

    it('invalid input: a link to another site is refused', () => {
        expect(checkSubmission(submission([image('https://example.com/cat.png')]))).toMatch(/uploaded here/);
        expect(checkSubmission(submission([image('//example.com/uploads/images/a.png')]))).toMatch(/uploaded here/);
    });
});

describe('checkSubmission leaves the blocks that are not questions alone', () => {
    it('nominal: text and audio still pass their own rules', () => {
        const text = { itemType: 'Text', value: { title: 'Greetings', text: 'Sawubona' } };
        const clip = { itemType: 'Audio', value: { title: 'Hello', fileUrl: 'a.mp3', transcript: 'Sawubona' } };
        expect(checkSubmission(submission([text, clip]))).toBeNull();
    });

    it('the first problem found is the one reported, whichever block holds it', () => {
        const blank = { itemType: 'Text', value: { title: '', text: '' } };
        expect(checkSubmission(submission([blank, choice({ question: '' })]))).toMatch(/title and text/);
    });
});

describe('content limits, on every write', () => {
    const text = (body = 'Sawubona') => ({ itemType: 'Text', value: { title: 'Greetings', text: body } });
    const pages = (count: number, perPage = 1) => Array.from({ length: count }, () => Array.from({ length: perPage }, () => text()));
    const long = (length: number) => 'a'.repeat(length);

    it('boundary: the most pages is accepted, one more is not', () => {
        expect(checkContentShape(pages(CONTENT_LIMITS.pages))).toBeNull();
        expect(checkContentShape(pages(CONTENT_LIMITS.pages + 1))).toMatch(/at most 30 pages/);
    });

    it('boundary: the most blocks on a page is accepted, one more is not', () => {
        expect(checkContentShape(pages(1, CONTENT_LIMITS.blocksPerPage))).toBeNull();
        expect(checkContentShape(pages(1, CONTENT_LIMITS.blocksPerPage + 1))).toMatch(/at most 20 blocks/);
    });

    it('boundary: the longest text is accepted, one character more is not', () => {
        expect(checkContentShape([[text(long(CONTENT_LIMITS.textLength))]])).toBeNull();
        expect(checkContentShape([[text(long(CONTENT_LIMITS.textLength + 1))]])).toMatch(/at most 2000 characters/);
    });

    it('the text limit reaches inside lists, so one long answer is refused', () => {
        expect(checkContentShape([[choice({ options: ['Sawubona', long(CONTENT_LIMITS.textLength + 1)] })]]))
            .toMatch(/at most 2000 characters/);
    });

    it('boundary: six answers is accepted, seven is not', () => {
        const options = (count: number) => Array.from({ length: count }, (_, i) => `answer ${i}`);
        expect(checkContentShape([[choice({ options: options(CONTENT_LIMITS.listLength) })]])).toBeNull();
        expect(checkContentShape([[choice({ options: options(CONTENT_LIMITS.listLength + 1) })]])).toMatch(/at most 6 answers/);
        expect(checkContentShape([[gap({ accepted: options(CONTENT_LIMITS.listLength + 1) })]])).toMatch(/at most 6 answers/);
    });

    it('boundary: the longest title is accepted, one character more is not, while drafting or submitting', () => {
        expect(checkDraftFields({ title: long(CONTENT_LIMITS.titleLength) })).toBeNull();
        expect(checkDraftFields({ title: long(CONTENT_LIMITS.titleLength + 1) })).toMatch(/at most 120 characters/);
        expect(checkSubmission({ ...submission([choice()]), title: long(CONTENT_LIMITS.titleLength + 1) }))
            .toMatch(/at most 120 characters/);
    });

    it('submitting is held to the same limits as saving', () => {
        expect(checkSubmission({ ...submission([]), content: pages(CONTENT_LIMITS.pages + 1) })).toMatch(/at most 30 pages/);
    });
});
