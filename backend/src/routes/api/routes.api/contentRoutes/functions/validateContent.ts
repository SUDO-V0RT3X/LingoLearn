// Every check the content routes run on a request body, in one place: create,
// edit and submit all validate the same shapes, and submit adds the rules that
// only matter once a moderator will read it.
import { ANSWER_TOO_LONG, MAX_ANSWER_LENGTH } from '../../../../../shared/answerRules.js';
import { BLOCK_TYPES, CONTENT_LEVELS, isContentLanguage, type ContentPages } from '../types/contentType.js';
import { MAX_TAGS_PER_CONTENT } from '../../taxonomyRoutes/functions/validateTaxonomy.js';

/** The message to answer 400 with, or null when the value is fine. */
export type Problem = string | null;

function blank(text: unknown): boolean {
    return typeof text !== 'string' || text.trim() === '';
}

//Where uploaded images are served (mediaRoutes); image blocks may point nowhere else.
export const IMAGE_URL_PREFIX = '/uploads/images/';

//What an author types in a fill in the blank sentence to mark the gap.
const BLANK_MARKER = '[]';

/**
 * The rules a set of answers must pass before a learner is asked them: two of
 * them filled in, none repeating another, and the marked one among them.
 * Answers are compared without case, because two that differ only in case read
 * as the same answer on the screen. Shared by multiple choice and listen and
 * choose, which ask the same question about different material.
 */
function checkAnswers(value: Record<string, unknown>): Problem {
    const options = value.options;
    if (!Array.isArray(options) || !options.every(option => typeof option === 'string')) {
        return 'a question needs a list of answers';
    }

    const filled = (options as string[]).map(option => option.trim()).filter(option => option !== '');
    if (filled.length < 2) return 'every question needs at least two answers';
    if (new Set(filled.map(option => option.toLowerCase())).size !== filled.length) {
        return 'a question cannot offer the same answer twice';
    }

    const correct = value.correctOption;
    if (!Number.isInteger(correct) || (correct as number) < 0 || (correct as number) >= options.length
        || blank(options[correct as number])) {
        return 'every question needs one of its answers marked as the right one';
    }

    return null;
}

/** The rules one question block must pass, or null when it is not a question. */
function checkQuestion(block: { itemType: string; value: Record<string, unknown> }): Problem {
    if (block.itemType === 'Multiple Choice') {
        if (blank(block.value.question)) return 'every multiple choice block needs a question';
        return checkAnswers(block.value);
    }

    if (block.itemType === 'Fill in the Blank') {
        if (blank(block.value.sentence)) return 'every fill in the blank block needs a sentence';
        if (String(block.value.sentence).split(BLANK_MARKER).length !== 2) {
            return `every sentence needs exactly one ${BLANK_MARKER} marking the gap`;
        }
        const accepted = block.value.accepted;
        if (!Array.isArray(accepted) || !accepted.some(answer => !blank(answer))) {
            return 'every fill in the blank block needs a spelling it accepts';
        }
        return null;
    }

    if (block.itemType === 'Listen and Choose') {
        if (blank(block.value.fileUrl)) return 'every listening question needs a file';
        if (blank(block.value.transcript)) return 'every listening question needs a transcript';
        return checkAnswers(block.value);
    }

    return null;
}

//How big a piece of content may get. Far past anything a lesson needs, and
//small enough that no single request can fill the database or the server.
export const CONTENT_LIMITS = {
    pages: 30,
    blocksPerPage: 20,
    //Any one piece of text in a block: a paragraph, a question, a sentence.
    textLength: 2000,
    //A transcript of an audio clip, which can run much longer than a paragraph.
    transcriptLength: 10000,
    //Any list in a block: answers to choose from, accepted spellings. The same
    //six the builder's answer fields stop at.
    listLength: 6,
    titleLength: 120,
} as const;

/** The first problem with a block's value against the limits, or null. */
function checkValueSize(value: Record<string, unknown>): Problem {
    if (typeof value.transcript === 'string' && value.transcript.length > CONTENT_LIMITS.transcriptLength) {
        return `a transcript can be at most ${CONTENT_LIMITS.transcriptLength} characters`;
    }
    for (const [name, field] of Object.entries(value)) {
        if (name === 'transcript') continue;
        const texts = Array.isArray(field) ? field : [field];
        if (Array.isArray(field) && field.length > CONTENT_LIMITS.listLength) {
            return `a block can hold at most ${CONTENT_LIMITS.listLength} answers`;
        }
        if (texts.some(text => typeof text === 'string' && text.length > CONTENT_LIMITS.textLength)) {
            return `text in a block can be at most ${CONTENT_LIMITS.textLength} characters`;
        }
    }
    //Answers to choose from and accepted spellings share the learner's answer limit.
    for (const list of [value.options, value.accepted]) {
        if (Array.isArray(list) && list.some(answer => typeof answer === 'string' && answer.length > MAX_ANSWER_LENGTH)) {
            return ANSWER_TOO_LONG;
        }
    }
    return null;
}

/** Checks the pages-of-blocks shape itself: the same rules for every route. */
export function checkContentShape(content: unknown): Problem {
    if (!Array.isArray(content) || !content.every(page => Array.isArray(page))) {
        return 'content must be a list of pages, each a list of blocks';
    }

    const wellFormed = content.every((page: unknown[]) => page.every(block =>
        block && typeof block === 'object'
        && (BLOCK_TYPES as readonly string[]).includes((block as { itemType: string }).itemType)
        && (block as { value: unknown }).value && typeof (block as { value: unknown }).value === 'object'));
    if (!wellFormed) return 'every block needs a known itemType and a value object';

    if (content.length > CONTENT_LIMITS.pages) return `content can have at most ${CONTENT_LIMITS.pages} pages`;
    if (content.some(page => page.length > CONTENT_LIMITS.blocksPerPage)) {
        return `a page can have at most ${CONTENT_LIMITS.blocksPerPage} blocks`;
    }
    for (const block of (content as ContentPages).flat()) {
        const problem = checkValueSize(block.value);
        if (problem) return problem;
    }

    return null;
}

function titleTooLong(title: unknown): boolean {
    return typeof title === 'string' && title.length > CONTENT_LIMITS.titleLength;
}

const LEVEL_PROBLEM = 'level must be a whole number from 1 to 6';

/** Checks a list of tag names: text, none repeated, and no more than a content may carry. */
function checkChosenTags(chosenTags: unknown): Problem {
    if (!Array.isArray(chosenTags) || !chosenTags.every(tag => typeof tag === 'string')
        || new Set(chosenTags).size !== chosenTags.length) {
        return 'chosenTags must be distinct tags from the fixed set';
    }
    if (chosenTags.length > MAX_TAGS_PER_CONTENT) {
        return `a single piece of content cannot have more than ${MAX_TAGS_PER_CONTENT} tags`;
    }

    return null;
}

/** Checks the optional fields an author may set while drafting. */
export function checkDraftFields(body: Record<string, unknown>): Problem {
    if (body.title !== undefined && typeof body.title !== 'string') return 'title must be text';
    if (titleTooLong(body.title)) return `title can be at most ${CONTENT_LIMITS.titleLength} characters`;
    if (body.language !== undefined && body.language !== null && !isContentLanguage(body.language)) {
        return 'language must be english or zulu';
    }
    if (body.childFriendly !== undefined && typeof body.childFriendly !== 'boolean') {
        return 'childFriendly must be true or false';
    }
    //A draft may not have a level yet, so null is allowed until it is submitted.
    if (body.level !== undefined && body.level !== null && !(CONTENT_LEVELS as readonly unknown[]).includes(body.level)) {
        return LEVEL_PROBLEM;
    }
    if (body.chosenTags !== undefined) return checkChosenTags(body.chosenTags);

    return null;
}

/**
 * Everything that must hold before a moderator sees the content: it is properly
 * described, every page has blocks, every block has a type, and nothing a
 * learner would meet is empty.
 */
export function checkSubmission(body: Record<string, unknown>): Problem {
    const shape = checkContentShape(body.content);
    if (shape) return shape;

    const content = body.content as ContentPages;
    if (blank(body.title)) return 'content needs a title before it is submitted';
    if (titleTooLong(body.title)) return `title can be at most ${CONTENT_LIMITS.titleLength} characters`;
    if (!isContentLanguage(body.language)) return 'language must be english or zulu';
    if (typeof body.childFriendly !== 'boolean') return 'childFriendly must be true or false';
    if (!(CONTENT_LEVELS as readonly unknown[]).includes(body.level)) return LEVEL_PROBLEM;

    const tags = checkChosenTags(body.chosenTags);
    if (tags) return tags;

    if (content.length === 0 || content.some(page => page.length === 0)) return 'every page needs at least one block';

    const blocks = content.flat();
    if (blocks.some(block => block.itemType === 'Pending Selection')) return 'every block needs a type';
    if (blocks.some(block => block.itemType === 'Text' && (blank(block.value.title) || blank(block.value.text)))) {
        return 'every text block needs a title and text';
    }
    if (blocks.some(block => block.itemType === 'Image' && (blank(block.value.fileUrl) || blank(block.value.altText)))) {
        return 'every image needs a file and alt text';
    }
    //Only an image uploaded here, so a learner's browser never loads a link from elsewhere.
    if (blocks.some(block => block.itemType === 'Image' && !String(block.value.fileUrl).startsWith(IMAGE_URL_PREFIX))) {
        return 'every image must be one uploaded here';
    }
    if (blocks.some(block => block.itemType === 'Audio' && blank(block.value.fileUrl))) {
        return 'every audio block needs a file';
    }
    if (blocks.some(block => block.itemType === 'Audio' && blank(block.value.transcript))) {
        return 'every audio clip needs a transcript';
    }

    //Question blocks carry the answers, so nothing half written reaches a moderator.
    for (const block of blocks) {
        const problem = checkQuestion(block);
        if (problem) return problem;
    }

    return null;
}
