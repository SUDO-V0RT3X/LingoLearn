// Content types sent and returned by the content routes. The pages and blocks are JSON
// inside content. Mirrors frontend features/shared/models/contentType.ts.

export type ContentStatus = 'draft' | 'pending' | 'approved' | 'rejected';

//Quiz or story is derived from the blocks, never sent by the author.
export type ContentKind = 'story' | 'quiz';

//The same strings as the frontend ContentBlockTypes enum.
export const BLOCK_TYPES = ['Text', 'Image', 'Audio', 'Multiple Choice', 'Fill in the Blank', 'Listen and Choose','Pending Selection'] as const;
export type BlockType = typeof BLOCK_TYPES[number];

export interface ContentBlock {
    itemType: BlockType;
    value: Record<string, unknown>;
}

//A list of pages, each a list of blocks.
export type ContentPages = ContentBlock[][];

//The languages content can teach. The same words as learner_settings.target_language.
export const CONTENT_LANGUAGES = ['english', 'zulu'] as const;
export type ContentLanguage = typeof CONTENT_LANGUAGES[number];

export interface ContentType {
    contentId: number;
    authorId: number;
    title: string;
    language: ContentLanguage | null;
    childFriendly: boolean;
    status: ContentStatus;
    //Which submission this is: 0 until first submitted, then one more each time.
    version: number;
    level: number | null;
    chosenTags: string[];
    kind: ContentKind;
    content: ContentPages;
    updatedAt: string;
    submittedAt: string | null;
    //The author's display name, for a reader's byline.
    authorName?: string;
}

//One row in a list: what a dashboard, review queue or explore screen shows
//without loading the pages themselves.
export interface ContentSummary {
    contentId: number;
    authorId: number;
    authorName: string;
    title: string;
    language: ContentLanguage | null;
    childFriendly: boolean;
    status: ContentStatus;
    version: number;
    level: number | null;
    chosenTags: string[];
    kind: ContentKind;
    updatedAt: string;
    submittedAt: string | null;
    locked?: boolean;
}

//A row of the learner-facing list: locked when the content is above the
//learner's level, so Explore can show it without letting it open.
export interface LearnerContentSummary extends ContentSummary {
    locked: boolean;
}

export interface ContentSubmission {
    content: ContentPages;
    title: string;
    language: ContentLanguage;
    childFriendly: boolean;
    level: number;
    chosenTags: string[];
}

//What an author can change while drafting. Only content is required; a field left
//out keeps what was saved. null clears the level and an empty list clears the tags.
export interface ContentDraftInput {
    content: ContentPages;
    title?: string;
    language?: ContentLanguage | null;
    childFriendly?: boolean;
    level?: number | null;
    //In the author's order: the first is the content's theme.
    chosenTags?: string[];
}

//The filters the learner-facing list accepts.
export interface ApprovedContentFilter {
    level?: number;
    language?: ContentLanguage;
    childFriendlyOnly?: boolean;
}

//Block types that make content a quiz: any one of them anywhere in the pages.
export const QUESTION_BLOCK_TYPES: readonly BlockType[] = ['Multiple Choice', 'Fill in the Blank', 'Listen and Choose'];

//Levels an author can assign. The tag set is the theme rows of the tags table.
export const CONTENT_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export function isContentLanguage(value: unknown): value is ContentLanguage {
    return typeof value === 'string' && (CONTENT_LANGUAGES as readonly string[]).includes(value);
}
