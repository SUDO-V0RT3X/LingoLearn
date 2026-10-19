// Keeps the answers to question blocks away from anyone who is not meant to
// know them. Answers live inside the content JSON beside the question, so a
// reader who is not its author or a reviewer gets a copy with them taken out.
import type { AuthedUser } from '../../authRoutes/authApplyAllRoute.js';
import type { BlockType, ContentBlock, ContentPages } from '../types/contentType.js';

//Block types with nothing to hide: a learner sees them exactly as written.
const OPEN_BLOCK_TYPES = ['Text', 'Image', 'Audio', 'Pending Selection'] as const;
type OpenBlockType = typeof OPEN_BLOCK_TYPES[number];

//For every other block type, the only fields a learner may see. Anything not
//listed is withheld, so a field added to a question later stays hidden until
//someone decides it is safe. A new block type will not compile until it is
//listed here or added to OpenBlockType above.
const LEARNER_FIELDS: Record<Exclude<BlockType, OpenBlockType>, readonly string[]> = {
    'Multiple Choice': ['title', 'question', 'options'],
    'Fill in the Blank': ['title', 'sentence'],
    // No transcript: it is the spoken sentence, so it would give the answer away.
    // A learner meets these only in a test or the challenge (the reader leaves
    // questions out); the author and reviewers still see it.
    'Listen and Choose': ['title', 'fileUrl', 'options'],
    //'Question': ['title', 'prompt', 'choices', 'correctIndex', 'explanation'],
};

/** Whether this reader may see the answers: the content's author, or a reviewer. */
export function seesAnswers(user: AuthedUser, authorId: number): boolean {
    return user.role === 'administrator' || user.role === 'moderator' || user.id === authorId;
}

/**
 * One block with its answers taken out. Blocks with nothing to hide come back as
 * they are. A block type this file does not know (stored before a rename, or
 * written by code that skipped validation) comes back with nothing in it, so an
 * unknown type can never carry its answers through.
 */
function withoutBlockAnswers(block: ContentBlock): ContentBlock {
    if ((OPEN_BLOCK_TYPES as readonly string[]).includes(block.itemType)) return block;

    const visible = LEARNER_FIELDS[block.itemType as keyof typeof LEARNER_FIELDS] ?? [];

    const value = Object.fromEntries(Object.entries(block.value).filter(([field]) => visible.includes(field)));
    return { itemType: block.itemType, value };
}

/** A copy of the pages with every answer taken out. The pages passed in are not changed. */
export function withoutAnswers(content: ContentPages): ContentPages {
    return content.map(page => page.map(withoutBlockAnswers));
}
