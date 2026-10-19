// Shapes returned by the reading-progress routes.

//Where a learner is in one piece of content. page is 0-based.
export interface ReadingProgress {
    page: number;
    totalPages: number;
}
