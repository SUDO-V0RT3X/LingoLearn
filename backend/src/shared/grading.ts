// Marks a learner's answers to the question blocks in a piece of content. It is
// the only place answers are checked, and it runs on the server: the answers
// themselves never leave it (see contentRoutes/functions/withholdAnswers.ts).
// Tests (learner experience) and the level-up challenge (progression) both use it.
import { ApiError } from './errors/ApiError.js';
import { ANSWER_TOO_LONG, MAX_ANSWER_LENGTH } from './answerRules.js';
import { QUESTION_BLOCK_TYPES, type ContentBlock, type ContentPages } from '../routes/api/routes.api/contentRoutes/types/contentType.js';

/** What a learner sends for one question: a position in its options, or the text typed into the gap. */
export type Answer = number | string | null;

export interface GradedQuestion {
    correct: boolean;
}

export interface GradeResult {
    total: number;
    score: number;
    //Rounded percentage, 0 when there are no questions.
    percent: number;
    questions: GradedQuestion[];
}

/** The question blocks of some content, in the order a learner meets them. */
export function questionBlocksOf(content: ContentPages): ContentBlock[] {
    return content.flat().filter(block => QUESTION_BLOCK_TYPES.includes(block.itemType));
}

//Typed answers are compared without surrounding spaces or letter case, so
//"Sawubona " and "sawubona" both match an accepted "Sawubona".
function sameText(a: string, b: string): boolean {
    return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** Whether one answer to one question block is right. A missing or wrongly-typed answer is wrong, never an error. */
export function isAnswerCorrect(block: ContentBlock, answer: Answer): boolean {
    if (block.itemType === 'Fill in the Blank') {
        const accepted = Array.isArray(block.value.accepted) ? block.value.accepted as unknown[] : [];
        return typeof answer === 'string' && answer.trim() !== ''
            && accepted.some(spelling => typeof spelling === 'string' && spelling.trim() !== '' && sameText(spelling, answer));
    }
    // Multiple Choice and Listen and Choose: the answer is a position in options.
    return typeof answer === 'number' && Number.isInteger(answer) && answer === block.value.correctOption;
}

/**
 * Grades every question in `content` against `answers`, one answer per question
 * in order. Refuses (400) a list of the wrong length or holding anything but
 * whole numbers, text or null, or text longer than MAX_ANSWER_LENGTH, because that
 * is a broken request, not a wrong answer.
 */
export function gradeAnswers(content: ContentPages, answers: unknown): GradeResult {
    const questions = questionBlocksOf(content);
    if (!Array.isArray(answers)) throw new ApiError(400, 'answers must be a list');
    if (answers.length !== questions.length) {
        throw new ApiError(400, `expected ${questions.length} answers, got ${answers.length}`);
    }
    const wellFormed = answers.every(answer =>
        answer === null || typeof answer === 'string' || (typeof answer === 'number' && Number.isInteger(answer)));
    if (!wellFormed) throw new ApiError(400, 'each answer must be a whole number, text, or null');
    if (answers.some(answer => typeof answer === 'string' && answer.length > MAX_ANSWER_LENGTH)) {
        throw new ApiError(400, ANSWER_TOO_LONG);
    }

    const graded = questions.map((block, index) => ({ correct: isAnswerCorrect(block, answers[index] as Answer) }));
    const score = graded.filter(question => question.correct).length;
    return {
        total: questions.length,
        score,
        percent: questions.length === 0 ? 0 : Math.round((score / questions.length) * 100),
        questions: graded,
    };
}
