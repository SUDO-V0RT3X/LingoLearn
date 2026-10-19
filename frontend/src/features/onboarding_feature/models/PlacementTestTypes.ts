/**
 * Model definitions for the language proficiency placement assessment.
 * Directly mirrors backend placement types (WALKTHROUGH.md step 9).
 */

/**
 * An individual selectable option for multiple-choice placement questions.
 */
export interface PlacementOption {
  /** Stable identifier sent back to the server upon learner selection (e.g., 'a', 'b'). */
  id: string;
  /** Human-readable answer text displayed to the learner. */
  text: string;
}

/**
 * Supported question interaction formats.
 */
export type PlacementQuestionType = 'multiple-choice' | 'fill-blank';

/**
 * A placement assessment question.
 * Note: The correct answer key is strictly kept on the server and never returned to the frontend.
 */
export interface PlacementQuestion {
  /** Unique question identifier. */
  id: string;
  /** Section heading (e.g. "Grammar & Vocabulary"). */
  section: string;
  /** Instructional directive for the learner (e.g. "Choose the correct answer below."). */
  instructions: string;
  /** Rendering type ('multiple-choice' or 'fill-blank'). */
  type: PlacementQuestionType;
  /** The question prompt or sentence with a missing segment. */
  prompt: string;
  /** Available answer choices for multiple-choice questions. */
  options?: PlacementOption[];
  /** Level tier number (1 to 6) associated with this question. */
  level_number?: number;
}

/**
 * Final graded level result assigned to the learner upon test completion.
 */
export interface PlacementResult {
  /** The level number (1 to 6) the learner was placed at. */
  levelNumber?: number;
  /** The level's reference label on the app's scale (CONTENT_LEVELS: "A1", "A1+", "A2", "B1", "B2", "C1"). */
  level: string;
  /** Plain title from the server (e.g., "Level 2"); the screen words its own. */
  label: string;
  /** Optional breakdown across specific linguistic competencies. */
  breakdown?: Array<{ skill: string; level: string }>;
}

/**
 * Response payload returned when starting a new placement test.
 */
export interface StartPlacementResponse {
  /** Unique UUID identifying the learner's test session. */
  attemptId: string;
  /** The question to display: the first one, or where an unfinished attempt stopped. */
  question: PlacementQuestion;
  /** The total question cap for this assessment ladder. */
  totalQuestions: number;
  /** 1-based position of `question` in the ladder (1 for a new attempt). */
  questionNumber?: number;
  /** True when the server continued an attempt the learner had already started. */
  resumed?: boolean;
}

/** The learner's unfinished attempt, from GET /api/placement/getActiveAttempt (null when there is none). */
export interface ActivePlacementResponse {
  attempt: StartPlacementResponse | null;
}

export interface SkipPlacementResponse {
  /** The learner's default level after skipping placement. */
  userId: number;
  /** Always 1 when a learner skips the diagnostic. */
  levelNumber: number;
}

/** The learner's saved level, from GET /api/placement/getLearnerLevel. */
export interface LearnerLevelResponse {
  userId: number;
  /** Level 1 to 6; 1 for a learner who has never been placed. */
  levelNumber: number;
  /** Whether a level has been saved (placement, skip or level-up). */
  placed?: boolean;
}

/**
 * Request payload sent when submitting an answer for evaluation.
 */
export interface SubmitAnswerInput {
  /** Identifier of the question being answered. */
  questionId: string;
  /** Selected option ID (multiple choice) or typed text (fill-in-the-blank). */
  answer: string;
}

/**
 * Server evaluation response returned after submitting an answer.
 */
export interface SubmitResponse {
  /** Whether the submitted answer was correct. */
  correct: boolean;
  /** The next question in the ladder, or null if the assessment has concluded. */
  nextQuestion: PlacementQuestion | null;
  /** Whether the assessment is finished (either by incorrect answer or passing all questions). */
  isComplete: boolean;
  /** The final assigned placement level (present only when isComplete is true). */
  result?: PlacementResult;
}

/** Quit uses the same terminal result shape as grading-based completion. */
export type QuitPlacementResponse = SubmitResponse;