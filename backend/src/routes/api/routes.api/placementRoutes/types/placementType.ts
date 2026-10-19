import { ANSWER_TOO_LONG, MAX_ANSWER_LENGTH } from '../../../../../shared/answerRules.js';
import type { ValidationIssue } from '../../../../../shared/errors/ApiError.js';

/**
 * Represents an individual selectable option in a multiple-choice placement question.
 */
export type PlacementOption = {
    /** Stable identifier sent back to the server upon learner selection (e.g., 'a', 'b'). */
    id: string;
    /** Human-readable answer text displayed to the learner. */
    text: string;
};

/**
 * Supported question interaction formats for placement questions.
 */
export type PlacementQuestionType = 'multiple-choice' | 'fill-blank';

/**
 * Public question payload delivered to the client.
 * Note: The correct answer key (correct_id) is deliberately omitted to keep grading strictly server-side.
 */
export type PlacementQuestion = {
    /** Unique identifier for the question (e.g., 'q1'). */
    id: string;
    /** Topic or pedagogical section header (e.g., 'Grammar & Vocabulary'). */
    section: string;
    /** Instructional guidance prompt for the user (e.g., 'Choose the correct answer below.'). */
    instructions: string;
    /** Type of interaction widget to render. */
    type: PlacementQuestionType;
    /** The question stem, prompt, or sentence with a missing word. */
    prompt: string;
    /** Available options for multiple-choice items; omitted for fill-in-the-blank items. */
    options?: PlacementOption[];
    /** Target proficiency level number associated with this question (1 to 6). */
    level_number?: number;
};

/**
 * Final graded proficiency evaluation returned upon completing the placement test.
 */
export type PlacementResult = {
    /** The level number (1 to 6), as saved in learner_levels. */
    levelNumber: number;
    /** The level's reference label on the app's scale ('A1', 'A1+', 'A2', 'B1', 'B2', 'C1'). */
    level: string;
    /** Plain title (e.g., 'Level 2'). */
    label: string;
    /** Optional detailed breakdown across specific competency areas. */
    breakdown?: Array<{ skill: string; level: string }>;
};

/**
 * Payload returned by POST /api/placement/startPlacement.
 */
export type StartPlacementResponse = {
    /** Unique session attempt UUID identifying this test run. */
    attemptId: string;
    /** The question to render: the first one, or where an unfinished attempt stopped. */
    question: PlacementQuestion;
    /** Total number of questions in this assessment ladder. */
    totalQuestions: number;
    /** 1-based position of `question` in the ladder (1 for a new attempt). */
    questionNumber: number;
    /** True when this continues an attempt the learner had already started. */
    resumed: boolean;
};

/**
 * Payload returned by GET /api/placement/getActiveAttempt: the learner's unfinished
 * attempt (so a reload carries on where they were), or null when there is none.
 */
export type ActivePlacementResponse = {
    attempt: StartPlacementResponse | null;
};

/**
 * Client payload sent to POST /api/placement/submitAnswer/:attemptId.
 */
export type SubmitAnswerInput = {
    /** The identifier of the question being answered. */
    questionId: string;
    /** The learner's answer (option id for multiple choice, or typed text for fill-in-the-blank). */
    answer: string;
};

/**
 * Grading evaluation returned by POST /api/placement/submitAnswer/:attemptId.
 */
export type SubmitResponse = {
    /** Whether the submitted answer was correct according to server-side evaluation. */
    correct: boolean;
    /** The next question in the ladder, or null if the assessment has concluded. */
    nextQuestion: PlacementQuestion | null;
    /** Indicates if the placement test is finished (either via early exit on failure or reaching the end). */
    isComplete: boolean;
    /** The finalized level placement; present only when isComplete is true. */
    result?: PlacementResult;
};

/**
 * Validation result for submitting an answer.
 */
export type SubmitAnswerValidation =
    | { valid: true; data: SubmitAnswerInput }
    | { valid: false; issues: ValidationIssue[] };

/**
 * Validates the raw request body payload for the submitAnswer endpoint.
 * Ensures the question ID and answer string are present, well-formed, and within bounds.
 *
 * @param value - The raw untrusted request payload from the client
 * @returns A SubmitAnswerValidation result with sanitized data or validation issues
 */
export function validateSubmitAnswerInput(value: unknown): SubmitAnswerValidation {
    const issues: ValidationIssue[] = [];

    if (typeof value !== 'object' || value === null) {
        return {
            valid: false,
            issues: [{ field: 'body', message: 'request body must be an object' }],
        };
    }

    const payload = value as Record<string, unknown>;

    // 1. Validate questionId
    if (typeof payload.questionId !== 'string' || payload.questionId.trim() === '') {
        issues.push({ field: 'questionId', message: 'questionId is required and must be a non-empty string' });
    }

    // 2. Validate answer
    if (typeof payload.answer !== 'string' || payload.answer.trim() === '') {
        issues.push({ field: 'answer', message: 'answer is required and must be a non-empty string' });
    } else if (payload.answer.length > MAX_ANSWER_LENGTH) {
        issues.push({ field: 'answer', message: ANSWER_TOO_LONG });
    }

    if (issues.length > 0) {
        return { valid: false, issues };
    }

    return {
        valid: true,
        data: {
            questionId: (payload.questionId as string).trim(),
            answer: (payload.answer as string).trim(),
        },
    };
}

