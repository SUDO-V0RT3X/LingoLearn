// Extracted from ReviewQueueScreen.vue's visibleItems computed property,
// so the sort/filter behaviour can be unit tested directly instead of only
// through the rendered table.
import type { ReviewQueueRow } from '../models/ReviewQueueTypes';

export type { ReviewQueueRow };
export type SortOrder = 'oldest' | 'newest';
export type LevelFilter = number | 'any';

//The other ways the queue can be narrowed. Leaving one out keeps every row.
export interface QueueFilters {
    contentType?: ReviewQueueRow['contentType'] | 'any';
    audience?: ReviewQueueRow['audience'] | 'any';
    //Matched against the title and the author, ignoring case.
    search?: string;
}

export class QueueSortFilter {
    static apply(
        items: ReviewQueueRow[],
        sortOrder: SortOrder,
        levelFilter: LevelFilter,
        filters: QueueFilters = {},
    ): ReviewQueueRow[] {
        let result = [...items];
        if (levelFilter !== 'any') {
            result = result.filter((row) => row.level === levelFilter);
        }
        if (filters.contentType && filters.contentType !== 'any') {
            result = result.filter((row) => row.contentType === filters.contentType);
        }
        if (filters.audience && filters.audience !== 'any') {
            result = result.filter((row) => row.audience === filters.audience);
        }
        const search = filters.search?.trim().toLocaleLowerCase() ?? '';
        if (search !== '') {
            result = result.filter((row) =>
                row.title.toLocaleLowerCase().includes(search) || row.author.toLocaleLowerCase().includes(search));
        }
        result.sort((a, b) => {
            const diff = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
            return sortOrder === 'oldest' ? diff : -diff;
        });
        return result;
    }
}
