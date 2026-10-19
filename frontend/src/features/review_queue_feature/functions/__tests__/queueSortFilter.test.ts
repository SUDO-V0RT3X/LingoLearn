import { describe, it, expect } from 'vitest';
import { QueueSortFilter, type ReviewQueueRow } from '../queueSortFilter';

const rows: ReviewQueueRow[] = [
    { id: 1, title: 'A', author: 'x', contentType: 'Lesson', level: 5, audience: 'Child-friendly', language: 'zulu', submittedAt: '2026-09-08T00:00:00Z' },
    { id: 2, title: 'B', author: 'x', contentType: 'Lesson', level: 4, audience: 'General', language: 'english', submittedAt: '2026-09-09T00:00:00Z' },
    { id: 3, title: 'Counting', author: 'Thandi', contentType: 'Test', level: 4, audience: 'Child-friendly', language: 'zulu', submittedAt: '2026-09-10T00:00:00Z' },
];

describe('QueueSortFilter (LIN-38)', () => {
    it('sorts oldest first by default', () => {
        const result = QueueSortFilter.apply(rows, 'oldest', 'any');
        expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it('sorts newest first when sortOrder is "newest"', () => {
        const result = QueueSortFilter.apply(rows, 'newest', 'any');
        expect(result.map((r) => r.id)).toEqual([3, 2, 1]);
    });

    it('filters to only the selected level', () => {
        const result = QueueSortFilter.apply(rows, 'oldest', 4);
        expect(result.map((r) => r.id)).toEqual([2, 3]);
    });

    it('"any" level filter returns every row', () => {
        const result = QueueSortFilter.apply(rows, 'oldest', 'any');
        expect(result).toHaveLength(3);
    });

    it('a level with no matching rows returns an empty array, not an error', () => {
        const result = QueueSortFilter.apply(rows, 'oldest', 6);
        expect(result).toEqual([]);
    });

    it('filters to one type of content', () => {
        expect(QueueSortFilter.apply(rows, 'oldest', 'any', { contentType: 'Test' }).map((r) => r.id)).toEqual([3]);
    });

    it('filters to one audience, combined with a level', () => {
        expect(QueueSortFilter.apply(rows, 'oldest', 4, { audience: 'Child-friendly' }).map((r) => r.id)).toEqual([3]);
    });

    it('searches titles and authors, ignoring case and spaces', () => {
        expect(QueueSortFilter.apply(rows, 'oldest', 'any', { search: '  thandi ' }).map((r) => r.id)).toEqual([3]);
        expect(QueueSortFilter.apply(rows, 'oldest', 'any', { search: 'COUNT' }).map((r) => r.id)).toEqual([3]);
    });

    it('"any" and an empty search keep every row', () => {
        expect(QueueSortFilter.apply(rows, 'oldest', 'any', { contentType: 'any', audience: 'any', search: '' })).toHaveLength(3);
    });

    it('does not change the list it was given', () => {
        const before = rows.map((r) => r.id);
        QueueSortFilter.apply(rows, 'newest', 'any');
        expect(rows.map((r) => r.id)).toEqual(before);
    });
});
