// One row of the moderator's queue. Built from the content slice's summary, so
// there is one definition of what a piece of content is.
export interface ReviewQueueRow {
    id: number;
    title: string;
    author: string;
    contentType: 'Lesson' | 'Test';
    level: number;
    audience: 'Child-friendly' | 'General';
    language: string | null;
    submittedAt: string;
}
