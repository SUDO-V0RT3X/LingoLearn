import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../src/config/db/db_init.js', () => ({
    pool: { query: queryMock, connect: vi.fn() },
}));

import { deriveKind, ContentMethods } from '../../src/routes/api/routes.api/contentRoutes/methods/contentMethods.js';
//import { BLOCK_TYPES, QUESTION_BLOCK_TYPES } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';

const block = (itemType: string) => ({ itemType, value: {} });

//A database row shaped like what SUMMARY_COLUMNS returns.
function row(overrides: Record<string, unknown> = {}) {
    return {
        id: 1, author_id: 3, author_name: 'Ada Lovelace', title: 'A title',
        language: 'zulu', child_friendly: false, status: 'approved', level: 2,
        chosen_tags: [], content: [[block('Text')]],
        updated_at: new Date('2026-09-26T10:00:00.000Z'), submitted_at: null,
        ...overrides,
    };
}

beforeEach(() => queryMock.mockReset());


describe('deriveKind', () => {
    it('is a story when there are no pages', () => {
        expect(deriveKind([] as never)).toBe('story');
    });

    it('is a story when there are only Text, Image and Audio blocks', () => {
        expect(deriveKind([[block('Text'), block('Image')], [block('Audio')]] as never)).toBe('story');
    });

    it('is a quiz when a Question block is present', () => {
        expect(deriveKind([[block('Text'), block('Multiple Choice')]] as never)).toBe('quiz');
    });

    it('is a quiz when the Question is on a later page', () => {
        expect(deriveKind([[block('Text')], [block('Text')], [block('Multiple Choice')]] as never)).toBe('quiz');
    });

    it('is still a quiz for the content builder question types', () => {
        expect(deriveKind([[block('Multiple Choice')]] as never)).toBe('quiz');
    });
});

describe('ContentMethods.getLearnerLevel', () => {
    it('starts learners without a row at level 1', async () => {
        queryMock.mockResolvedValue({ rows: [] });
        expect(await ContentMethods.getLearnerLevel(5)).toBe(1);
    });

    it('returns the stored level', async () => {
        queryMock.mockResolvedValue({ rows: [{ level_number: 4 }] });
        expect(await ContentMethods.getLearnerLevel(5)).toBe(4);
    });
});

describe('ContentMethods.getApprovedContent (locked content, LIN-58)', () => {
    it('locks content above the learner level and unlocks content at or below it', async () => {
        queryMock.mockResolvedValue({
            rows: [row({ id: 1, level: 1 }), row({ id: 2, level: 2 }), row({ id: 3, level: 3 })],
        });

        const result = await ContentMethods.getApprovedContent({}, 2);

        expect(result.map((c) => c.locked)).toEqual([false, false, true]);
    });

    it('does not add a locked flag when no learner level is given', async () => {
        queryMock.mockResolvedValue({ rows: [row()] });
        const [item] = await ContentMethods.getApprovedContent({});
        expect(item).not.toHaveProperty('locked');
    });

    it('does not add a locked flag to content without a level', async () => {
        queryMock.mockResolvedValue({ rows: [row({ level: null })] });
        const [item] = await ContentMethods.getApprovedContent({}, 2);
        expect(item).not.toHaveProperty('locked');
    });

    it('returns summaries without the pages, plus the author name', async () => {
        queryMock.mockResolvedValue({ rows: [row()] });
        const [item] = await ContentMethods.getApprovedContent({}, 2);
        expect(item).not.toHaveProperty('content');
        expect(item.authorName).toBe('Ada Lovelace');
        expect(item.contentId).toBe(1);
    });

    it('marks a content with a Question block as a quiz', async () => {
        queryMock.mockResolvedValue({ rows: [row({ content: [[block('Multiple Choice')]] })] });
        const [item] = await ContentMethods.getApprovedContent({}, 2);
        expect(item.kind).toBe('quiz');
    });

    it('passes the filters to the query as parameters', async () => {
        queryMock.mockResolvedValue({ rows: [] });
        await ContentMethods.getApprovedContent({ level: 2, language: 'zulu', childFriendlyOnly: true });
        expect(queryMock.mock.calls[0][1]).toEqual([2, 'zulu', true]);
    });

    it('uses null and false when no filters are given', async () => {
        queryMock.mockResolvedValue({ rows: [] });
        await ContentMethods.getApprovedContent({});
        expect(queryMock.mock.calls[0][1]).toEqual([null, null, false]);
    });
});