// Unit tests for how the server decides whether content is a story or a quiz.
// deriveKind is pure; importing its module creates the database pool object but
// never connects, so these run without a database.
import { describe, it, expect } from 'vitest';
import { deriveKind } from '../../src/routes/api/routes.api/contentRoutes/methods/contentMethods.js';
import { BLOCK_TYPES, QUESTION_BLOCK_TYPES, type ContentBlock } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';

const block = (itemType: ContentBlock['itemType']): ContentBlock => ({ itemType, value: {} });

describe('deriveKind', () => {
    it('nominal: text, images and audio only is a story', () => {
        expect(deriveKind([[block('Text'), block('Image')], [block('Audio')]])).toBe('story');
    });

    it('nominal: each question type makes it a quiz', () => {
        expect(deriveKind([[block('Text'), block('Multiple Choice')]])).toBe('quiz');
        expect(deriveKind([[block('Text'), block('Fill in the Blank')]])).toBe('quiz');
        expect(deriveKind([[block('Text'), block('Listen and Choose')]])).toBe('quiz');
    });

    it('one question on a later page is enough', () => {
        expect(deriveKind([[block('Text')], [block('Audio')], [block('Multiple Choice')]])).toBe('quiz');
    });

    it('boundary: no pages, an empty page, and a block with no type yet are all stories', () => {
        expect(deriveKind([])).toBe('story');
        expect(deriveKind([[]])).toBe('story');
        expect(deriveKind([[block('Pending Selection')]])).toBe('story');
    });
});

describe('QUESTION_BLOCK_TYPES', () => {
    it('names exactly the three question types', () => {
        expect([...QUESTION_BLOCK_TYPES].sort()).toEqual(['Fill in the Blank', 'Listen and Choose', 'Multiple Choice']);
    });

    it('only names block types that exist', () => {
        for (const type of QUESTION_BLOCK_TYPES) expect(BLOCK_TYPES).toContain(type);
    });
});
