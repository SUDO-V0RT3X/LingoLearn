// Mirror of the backend's reviewQueueType.ts, which is built from the content
// slice's summary rows.
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
