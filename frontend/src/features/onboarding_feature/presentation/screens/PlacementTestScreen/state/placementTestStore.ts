// Import Pinia's store definition utility
import { defineStore } from 'pinia';
// Import custom exception type for standardized error representation
import { Exception } from '@/core/exceptions/models/ExceptionType';
// Import the placement data source that executes HTTP requests via Endpoints.Placement
import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource';
// Import strongly typed placement domain models
import { accessRefusalFrom, type AccessRefusal } from '@/features/onboarding_feature/functions/accessRefusal';
import type {
  PlacementQuestion,
  PlacementResult,
  StartPlacementResponse,
} from '@/features/onboarding_feature/models/PlacementTestTypes';

/**
 * Pinia store managing the reactive state and business actions for the Placement Test flow.
 * Coordinates starting assessment sessions, progressive answer evaluation,
 * tier and level unlock milestone tracking (every 5 questions unlocks a new level),
 * animated progress bar metrics, under-13 access gating refusals (403), and results presentation.
 */
export const placementTestStore = defineStore('placementTestStore', {
  state: () => ({
    /** Unique session attempt UUID returned by the server upon starting the test. */
    // Keep null until the backend creates a persisted attempt for this learner.
    attemptId: null as string | null,

    /** The question currently presented to the learner, or null when complete/loading/intro. */
    // Null hides the question UI when no assessment question is active.
    currentQuestion: null as PlacementQuestion | null,

    /** Total number of questions in this assessment ladder (defaults to 30). */
    // The start response can replace this value when the configured ladder changes.
    totalQuestions: 30,

    /** 1-based position of the current question in the sequence (1 to 30). */
    // Use a separate position for question counters and overall progress display.
    currentIndex: 1,

    /** The learner's current answer input (selected option ID or typed text). */
    // Store an option ID for radio questions or raw text for fill-in questions.
    selectedAnswer: '',

    /** Whether the placement test has completed (either by incorrect answer or passing all questions). */
    // Drives removal of the active question and display of the result phase.
    isComplete: false,

    /** The finalized CEFR level result and breakdown returned upon completing the test. */
    // Keep null until answer grading or quitting returns an assigned level.
    result: null as PlacementResult | null,

    /** Indicates whether the initial assessment session is loading. */
    // Exposes start/skip progress to the screen's loading states.
    isLoading: false,

    /** Indicates whether an answer submission is currently being evaluated by the backend. */
    // Prevent duplicate answer, quit, or other in-flight interactions.
    isSubmitting: false,

    /** Holds any error exception returned from failed network or API calls. */
    // Keep failures typed so the UI can safely display the message and status.
    error: null as Exception | null,

    /** Flag set to true if access is denied due to age safety policy (under-13 without guardian link). */
    // Lets the screen distinguish a policy redirect from an ordinary request failure.
    isAccessBlocked: false,

    /** Which access rule refused the learner (setup not saved, or parent link missing); null otherwise. */
    refusal: null as AccessRefusal | null,

    /**
     * Set to a level number (e.g., 2, 3, 4, 5) immediately after completing a 5-question milestone,
     * triggering a celebratory level unlock animation in the UI.
     */
    unlockedLevel: null as number | null,
  }),

  getters: {
    /**
     * Calculates the overall completion percentage across the entire assessment ladder.
     */
    progressPercent: (state): number => {
      if (state.totalQuestions <= 0) return 0;
      return Math.min(100, Math.round((state.currentIndex / state.totalQuestions) * 100));
    },

    /**
     * Returns the level (1 to 6) of the current question's band of five:
     * questions 1-5 are level 1, 6-10 level 2, and so on.
     */
    currentLevelNumber: (state): number => {
      if (state.currentQuestion?.level_number) {
        return state.currentQuestion.level_number;
      }
      return Math.min(6, Math.max(1, Math.floor((state.currentIndex - 1) / 5) + 1));
    },

    /**
     * Returns the target proficiency level number the learner is working toward unlocking.
     */
    nextLevelNumber: (state): number => {
      const current = state.currentQuestion?.level_number
        ?? Math.floor((state.currentIndex - 1) / 5) + 1;
      return Math.min(6, current + 1);
    },

    /**
     * The 1-based question step index within the current 5-question level tier (1 to 5).
     * E.g., question 1 -> step 1/5; question 5 -> step 5/5; question 6 -> step 1/5.
     */
    tierQuestionIndex: (state): number => {
      return ((state.currentIndex - 1) % 5) + 1;
    },

    /**
     * Number of questions successfully completed within the current 5-question tier (0 to 4).
     * E.g. at question 1: 0 completed in this tier; at question 4: 3 completed.
     */
    questionsAnsweredInTier: (state): number => {
      return (state.currentIndex - 1) % 5;
    },

    /**
     * Calculates the visual progress percentage toward unlocking the next level tier (0% to 100%).
     * Each question in the 5-question tier represents 20% toward the next level unlock.
     */
    tierProgressPercent: (state): number => {
      // Step within current tier (1..5) as percentage of 5 questions
      const stepInTier = ((state.currentIndex - 1) % 5) + 1;
      return Math.min(100, Math.round((stepInTier / 5) * 100));
    },
  },

  actions: {
    /**
     * Initiates a new placement test attempt via the backend.
     * Evaluates learner safety rules: if the learner is under 13 without an active guardian link,
     * the backend responds with HTTP 403 and `isAccessBlocked` is set to true.
     *
     * @returns A promise resolving to boolean indicating success or failure
     */
    async startTest(): Promise<boolean> {
      // Show startup progress before awaiting the request that creates the attempt.
      this.isLoading = true;
      // Remove error state left by a previous attempt to start.
      this.error = null;
      // Clear any old policy refusal before checking access again.
      this.isAccessBlocked = false;
      this.refusal = null;
      // Do not carry an old level-unlock banner into this assessment.
      this.unlockedLevel = null;

      const response = await PlacementDataSource.startPlacement();

      if (response.error != null) {
        // Preserve the server or transport error for the screen's error message.
        this.error = response.error;
        this.noteRefusal(response.error);
        // Leave loading state before reporting that no test was started.
        this.isLoading = false;
        // Return failure so the component remains on the intro/error state.
        return false;
      }

      if (response.data != null) {
        // Show the attempt's question (the first, or where an unfinished attempt stopped).
        this.applyAttempt(response.data);
        // Stop the loading indicator after the first question is ready.
        this.isLoading = false;
        // Tell the component it can enter the question phase.
        return true;
      }

      // Clear loading when the data source returns an empty response without an error.
      this.isLoading = false;
      // Treat an empty payload as unsuccessful rather than opening a broken test.
      return false;
    },

    /**
     * Submits the learner's answer for evaluation by the backend grading ladder.
     * Updates the store with either the next question or the final placement result.
     * If the next question belongs to a higher level tier (e.g. crossing every 5 questions),
     * flags `unlockedLevel` so the UI can trigger a celebratory animation.
     *
     * @param answer - Optional explicit answer string; defaults to `this.selectedAnswer`
     * @returns A promise resolving to boolean indicating successful submission
     */
    async submitAnswer(answer?: string): Promise<boolean> {
      // A grade can only be requested for a persisted attempt's active question.
      if (!this.currentQuestion || !this.attemptId) return false;

      // Prefer an explicit caller answer, otherwise use the reactive form selection.
      const chosenAnswer = (answer ?? this.selectedAnswer).trim();
      // Refuse blank content here as a second guard beyond screen validation.
      if (!chosenAnswer) return false;

      // Lock the active question while its answer is being graded.
      this.isSubmitting = true;
      // Clear prior request failures before sending the new answer.
      this.error = null;

      // Track current level before advancing to detect tier milestone unlock
      const prevLevel = this.currentQuestion.level_number
        ?? Math.floor((this.currentIndex - 1) / 5) + 1;

      // Send only the active question ID and selected answer to server-side grading.
      const response = await PlacementDataSource.submitAnswer(this.attemptId, {
        // Identify which ladder item is being answered.
        questionId: this.currentQuestion.id,
        // Send the normalized learner response, never a client-side correctness claim.
        answer: chosenAnswer,
      });

      if (response.error != null) {
        // Keep the API failure available to the screen.
        this.error = response.error;
        this.noteRefusal(response.error);
        // Release the question controls after the failed request settles.
        this.isSubmitting = false;
        // Tell the component not to advance to another question.
        return false;
      }

      if (response.data != null) {
        if (response.data.isComplete) {
          // Retain the evaluated level and optional skill breakdown.
          this.result = response.data.result ?? null;
          // Signal that the standard result panel should replace the test.
          this.isComplete = true;
          // Remove the old prompt because the assessment has concluded.
          this.currentQuestion = null;
        } else if (response.data.nextQuestion) {
          // Check if advancing to the next question unlocked a new level tier
          const nextLevel = response.data.nextQuestion.level_number
            ?? Math.floor(this.currentIndex / 5) + 1;

          if (nextLevel > prevLevel) {
            // Trigger the level-unlock celebration only when the returned tier advances.
            this.unlockedLevel = nextLevel;
          }

          // Replace the old question with the server-selected next ladder item.
          this.currentQuestion = response.data.nextQuestion;
          // Advance the 1-based progress counter after receiving that next item.
          this.currentIndex += 1;
          // Require a new answer for the newly displayed question.
          this.selectedAnswer = '';
        }

        // Release the busy state after applying the successful response.
        this.isSubmitting = false;
        // Report successful processing so the screen can update focus and phase.
        return true;
      }

      // Release controls if the server returned neither an error nor a payload.
      this.isSubmitting = false;
      // An empty response cannot safely advance or complete the assessment.
      return false;
    },

    /**
     * Picks up the learner's unfinished attempt, if the server has one, so a page
     * reload carries on at the same question instead of showing the intro again.
     * Never starts an attempt. A refusal is recorded like any other request.
     *
     * @returns true when an unfinished attempt was restored
     */
    async resumeTest(): Promise<boolean> {
      this.error = null;
      this.isAccessBlocked = false;
      this.refusal = null;
      const response = await PlacementDataSource.getActiveAttempt();
      if (response.error != null) {
        this.error = response.error;
        this.noteRefusal(response.error);
        return false;
      }
      const attempt = response.data?.attempt;
      if (!attempt) return false;
      this.applyAttempt(attempt);
      return true;
    },

    /** Shows a started or continued attempt at its current question. */
    applyAttempt(attempt: StartPlacementResponse): void {
      // Retain the persisted attempt ID for subsequent answers and quit requests.
      this.attemptId = attempt.attemptId;
      // Present the question selected by the backend.
      this.currentQuestion = attempt.question;
      // Synchronize progress limits with the server-configured ladder length.
      this.totalQuestions = attempt.totalQuestions;
      // A new attempt is at question 1; a continued one where it stopped.
      this.currentIndex = attempt.questionNumber ?? 1;
      // Discard any selection left over from an earlier attempt.
      this.selectedAnswer = '';
      // Mark the attempt as active.
      this.isComplete = false;
      // Remove any result from a previous attempt.
      this.result = null;
      // No level-unlock notice for a level reached before this visit.
      this.unlockedLevel = null;
    },

    async skipPlacement(): Promise<boolean> {
      // Show progress while the backend persists a Level 1 starting assignment.
      this.isLoading = true;
      // Clear an earlier failure before asking to skip.
      this.error = null;

      // Delegate the default-level write to the placement-owned server operation.
      const response = await PlacementDataSource.skipPlacement();
      if (response.error != null) {
        // Preserve the failure so the intro page can explain why navigation stopped.
        this.error = response.error;
        this.noteRefusal(response.error);
        // Stop the loading state when persistence fails.
        this.isLoading = false;
        // Do not navigate to Explore if the Level 1 assignment was not confirmed.
        return false;
      }

      // A skipped diagnostic has no placement attempt to retain.
      this.attemptId = null;
      // Remove any question from a prior assessment session.
      this.currentQuestion = null;
      // Restore the initial counter for a future test if one is started later.
      this.currentIndex = 1;
      // Clear a prior answer from the previous assessment.
      this.selectedAnswer = '';
      // Keep this skip response out of the graded-results state.
      this.isComplete = false;
      // No assessed CEFR result exists when the learner skips.
      this.result = null;
      // Stop loading now the Level 1 write has succeeded.
      this.isLoading = false;
      // Clear any in-progress answer submission state.
      this.isSubmitting = false;
      // A successful skip is not an access-policy refusal.
      this.isAccessBlocked = false;
      this.refusal = null;
      // Remove celebration state from any earlier attempt.
      this.unlockedLevel = null;
      // Let the component navigate to Explore after persistence succeeds.
      return true;
    },

    async quitTest(): Promise<boolean> {
      // Permit quitting only while a persisted attempt has an active question and no request is pending.
      if (!this.attemptId || !this.currentQuestion || this.isSubmitting) return false;

      // Disable conflicting controls while the server closes the attempt.
      this.isSubmitting = true;
      // Clear any old error before requesting completion.
      this.error = null;
      // Ask the backend to assign the level associated with the current question.
      const response = await PlacementDataSource.quitPlacement(this.attemptId);
      // Release the busy state regardless of the returned result.
      this.isSubmitting = false;

      if (response.error != null) {
        // Keep the current question active if the backend could not persist the quit.
        this.error = response.error;
        this.noteRefusal(response.error);
        return false;
      }
      // Require an assigned result before changing the UI to its result panel.
      if (!response.data?.result) return false;

      // Retain the authoritative server result, including its proficiency label.
      this.result = response.data.result;
      // Mark the active attempt complete so the result panel can render.
      this.isComplete = true;
      // Remove the unanswered prompt from the completed test state.
      this.currentQuestion = null;
      // Discard the answer selection because quitting does not submit it.
      this.selectedAnswer = '';
      // Tell the screen the quit operation completed successfully.
      return true;
    },

    /**
     * Records whether a failed request was an access refusal (HTTP 403), and which one,
     * so the screen can send the learner to setup or to parent linking.
     */
    noteRefusal(error: Exception): void {
      this.refusal = accessRefusalFrom(error);
      this.isAccessBlocked = this.refusal !== null;
    },

    /**
     * Clears the active level-unlock banner or celebration notice once acknowledged by the UI.
     */
    clearUnlockedLevel(): void {
      // Remove the milestone value so the level-unlock toast is hidden.
      this.unlockedLevel = null;
    },

    /**
     * Updates the current answer selection.
     *
     * @param id - The chosen option ID or text
     */
    selectOption(id: string): void {
      // Ignore changes when answer requests are in flight or the test has ended.
      if (this.isSubmitting || this.isComplete) return;
      // Save the chosen option ID or typed answer as the active response.
      this.selectedAnswer = id;
    },

    /**
     * Resets the placement test state to clean defaults.
     */
    reset(): void {
      // Clear any persisted attempt token from the prior screen visit.
      this.attemptId = null;
      // Hide any question retained from an earlier test.
      this.currentQuestion = null;
      // Restore the standard six-level ladder length.
      this.totalQuestions = 30;
      // Reset progress to the first question.
      this.currentIndex = 1;
      // Clear the active learner response.
      this.selectedAnswer = '';
      // Return the state to an unfinished assessment.
      this.isComplete = false;
      // Clear any previous placement result.
      this.result = null;
      // Clear loading and request flags from prior activity.
      this.isLoading = false;
      // Clear the submission lock from prior activity.
      this.isSubmitting = false;
      // Remove prior server or network errors.
      this.error = null;
      // Reset any earlier child-access refusal.
      this.isAccessBlocked = false;
      this.refusal = null;
      // Hide any old level-unlock celebration.
      this.unlockedLevel = null;
    },
  },
});

