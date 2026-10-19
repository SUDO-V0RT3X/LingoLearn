// Import Vitest's setup, grouping, assertion, and spy utilities.
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Import Pinia helpers so tests can create isolated store instances.
import { createPinia, setActivePinia } from 'pinia';
// Import typed exception helpers for access and request failure fixtures.
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
// Import the response wrapper consumed by placement data-source methods.
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
// Import the API boundary whose responses are controlled in each test.
import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource';
// Import the store whose transitions and derived progress values are tested.
import { placementTestStore } from '../placementTestStore';
// Import the API response types used to validate local fixtures.
import type {
  SkipPlacementResponse,
  StartPlacementResponse,
  SubmitResponse,
} from '@/features/onboarding_feature/models/PlacementTestTypes';

const mockStartData: StartPlacementResponse = {
  // Use a stable attempt ID to verify later requests are tied to the attempt.
  attemptId: 'test-attempt-uuid',
  // Return the question shown immediately after an attempt is created.
  question: {
    // Identify this as the first placement item.
    id: 'q1',
    // Provide the category rendered by the screen.
    section: 'Grammar & Vocabulary',
    // State the task expected from the learner.
    instructions: 'Choose the correct answer below.',
    // Choose the radio-option question renderer.
    type: 'multiple-choice',
    // Provide prompt content for the first question.
    prompt: 'I have lived here _____ 2019.',
    // Provide selectable answers as stable ID and display-text pairs.
    options: [
      { id: 'a', text: 'for' },
      { id: 'b', text: 'since' },
    ],
  },
  // Use a five-item fixture to make progress percentage expectations easy to verify.
  totalQuestions: 5,
};

// Model a correct answer response with another question still pending.
const mockNextQuestionResponse: SubmitResponse = {
  // A correct response advances the ladder without completing it.
  correct: true,
  // Supply the next item the store should place in currentQuestion.
  nextQuestion: {
    // Identify the following ladder item.
    id: 'q2',
    // Keep the same skill grouping for this sample.
    section: 'Grammar & Vocabulary',
    // Supply the direction displayed to the learner.
    instructions: 'Choose the correct answer below.',
    // Keep the next item rendered as multiple choice.
    type: 'multiple-choice',
    // Supply a prompt that can be asserted after advancement.
    prompt: 'She _____ to school every day.',
    // Return the available answer choices.
    options: [{ id: 'b', text: 'walks' }],
  },
  // Keep the attempt active because a next question is present.
  isComplete: false,
};

// Model a terminal response carrying an assessed CEFR level and skill breakdown.
const mockCompletedResponse: SubmitResponse = {
  // This sample result is still terminal even if the backend's correctness flag is true.
  correct: true,
  // No question follows a completed attempt.
  nextQuestion: null,
  // Signal the store to enter its result state.
  isComplete: true,
  // Provide the level content retained for the results screen.
  result: {
    // Set the standardized proficiency code.
    level: 'B1',
    // Set the learner-readable proficiency label.
    label: 'Intermediate',
    // Include per-skill evidence to show breakdown persistence.
    breakdown: [
      { skill: 'Grammar', level: 'B1' },
      { skill: 'Vocabulary', level: 'B1' },
    ],
  },
};

describe('placementTestStore (Unit)', () => {
  beforeEach(() => {
    // Give each case a new Pinia context and a pristine store registry.
    setActivePinia(createPinia());
    // Reset datasource spies so each case controls only its own API responses.
    vi.clearAllMocks();
  });

  it('initializes with pristine default state', () => {
    // Create the store without starting an assessment.
    const store = placementTestStore();

    // No backend attempt exists before the start action.
    expect(store.attemptId).toBeNull();
    // No question should render in the initial state.
    expect(store.currentQuestion).toBeNull();
    // Default progress calculations use the complete 30-question ladder.
    expect(store.totalQuestions).toBe(30);
    // Counters are one-based and begin at question one.
    expect(store.currentIndex).toBe(1);
    // There is no answer until the learner selects or types one.
    expect(store.selectedAnswer).toBe('');
    // The assessment has not been completed yet.
    expect(store.isComplete).toBe(false);
    // No assessed level exists before completion.
    expect(store.result).toBeNull();
    // The store is idle and has no active request.
    expect(store.isLoading).toBe(false);
    // Answer controls are not locked by a request.
    expect(store.isSubmitting).toBe(false);
    // No failure has been recorded.
    expect(store.error).toBeNull();
    // Initial state has no access-policy refusal.
    expect(store.isAccessBlocked).toBe(false);
    // The initial counter is 1/30, rounded to three percent.
    expect(store.progressPercent).toBe(3);
  });

  describe('startTest', () => {
    it('populates state and loads question 1 when startPlacement succeeds', async () => {
      vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
        // Return the deterministic start response without making a network request.
        new $DataSourceResponse(mockStartData, null),
      );

      // Create a store and begin an attempt through its public action.
      const store = placementTestStore();
      const success = await store.startTest();

      // Confirm startup reports success and retains the attempt token.
      expect(success).toBe(true);
      expect(store.attemptId).toBe('test-attempt-uuid');
      // Confirm the first question and server-configured ladder length were loaded.
      expect(store.currentQuestion?.id).toBe('q1');
      expect(store.totalQuestions).toBe(5);
      expect(store.currentIndex).toBe(1);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.isAccessBlocked).toBe(false);
      expect(store.progressPercent).toBe(20);
    });

    it('flags isAccessBlocked = true when receiving HTTP 403 under-13 refusal', async () => {
      const error403 = new Exception({
        // Classify the refusal as an API failure.
        exceptionType: ExceptionType.FAILED,
        // Match the user-safe server response for missing guardian consent.
        message: 'Parent link required',
        // Preserve the HTTP code used by the store's access-blocked branch.
        statusCode: 403,
      });

      vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
        new $DataSourceResponse<StartPlacementResponse>(null, error403),
      );

      const store = placementTestStore();
      const success = await store.startTest();

      // A blocked start cannot be reported as a successfully created attempt.
      expect(success).toBe(false);
      // Preserve the typed server refusal for the caller.
      expect(store.error).toEqual(error403);
      // Mark the refusal so the screen can route to parent linking.
      expect(store.isAccessBlocked).toBe(true);
      // Clear the loading state even when the backend denies the request.
      expect(store.isLoading).toBe(false);
    });

    it('tells the setup refusal apart from the parent-link refusal', async () => {
      const store = placementTestStore();
      vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValueOnce(
        new $DataSourceResponse<StartPlacementResponse>(null, new Exception({
          exceptionType: ExceptionType.FORBIDDEN,
          message: 'learner setup must be completed before accessing content',
          statusCode: 403,
        })),
      );
      await store.startTest();
      expect(store.refusal).toBe('setupRequired');
      expect(store.isAccessBlocked).toBe(true);

      vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValueOnce(
        new $DataSourceResponse<StartPlacementResponse>(null, new Exception({
          exceptionType: ExceptionType.FORBIDDEN,
          message: 'an active parent link is required before accessing content',
          statusCode: 403,
        })),
      );
      await store.startTest();
      expect(store.refusal).toBe('parentLinkRequired');
    });

    it('captures generic errors and keeps isAccessBlocked = false on server errors', async () => {
      const error500 = new Exception({
        // Represent a server-side failure unrelated to child access policy.
        exceptionType: ExceptionType.FAILED,
        // Supply the safe failure detail retained by the store.
        message: 'Server error',
        // Use HTTP 500 so the access gate should remain open.
        statusCode: 500,
      });

      vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
        new $DataSourceResponse<StartPlacementResponse>(null, error500),
      );

      const store = placementTestStore();
      const success = await store.startTest();

      // Failed startup does not produce a usable attempt.
      expect(success).toBe(false);
      // Retain the error for display or retry handling.
      expect(store.error).toEqual(error500);
      // Do not treat a generic failure as an age-policy refusal.
      expect(store.isAccessBlocked).toBe(false);
    });
  });

  describe('submitAnswer', () => {
    it('refuses submission when no question or attempt is active', async () => {
      // Start from pristine state, where neither required submission identifier exists.
      const store = placementTestStore();
      // Ask the store to submit despite having no active question or attempt.
      const success = await store.submitAnswer('b');
      // Refuse locally so no invalid request can reach the grading datasource.
      expect(success).toBe(false);
    });

    it('refuses submission when submitted answer is blank', async () => {
      // Create the store and supply the IDs needed to reach answer validation.
      const store = placementTestStore();
      // Provide a fake persisted attempt for the current question.
      store.attemptId = 'test-attempt-uuid';
      // Provide a question so the only invalid part is the blank answer.
      store.currentQuestion = mockStartData.question;

      // Submit whitespace explicitly to test the store's trim-and-reject guard.
      const success = await store.submitAnswer('   ');
      // Do not accept blank text as a submitted answer.
      expect(success).toBe(false);
    });

    it('records a skipped placement as level 1 so the learner can enter explore immediately', async () => {
      // Simulate the placement API confirming the default learner level.
      vi.spyOn(PlacementDataSource, 'skipPlacement').mockResolvedValue(
        new $DataSourceResponse({ userId: 42, levelNumber: 1 }, null),
      );

      // Request the skip through the store's public action.
      const store = placementTestStore();
      const success = await store.skipPlacement();

      // Allow the screen to navigate only after the skip write succeeds.
      expect(success).toBe(true);
      // Skipping is not a graded result and must not show a test-completion panel.
      expect(store.result).toBeNull();
      expect(store.isComplete).toBe(false);
    });

    it('marks access as blocked when the skip endpoint returns HTTP 403', async () => {
      const accessError = new Exception({
        exceptionType: ExceptionType.FAILED,
        message: 'Parent link required',
        statusCode: 403,
      });
      vi.spyOn(PlacementDataSource, 'skipPlacement').mockResolvedValue(
        new $DataSourceResponse<SkipPlacementResponse>(null, accessError),
      );

      const store = placementTestStore();
      await expect(store.skipPlacement()).resolves.toBe(false);

      expect(store.error).toEqual(accessError);
      expect(store.isAccessBlocked).toBe(true);
      expect(store.isLoading).toBe(false);
    });

    it('advances to next question, increments index, and resets selection on progression', async () => {
      // Return a server-approved next question when the current answer is submitted.
      vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(
        new $DataSourceResponse(mockNextQuestionResponse, null),
      );

      // Prepare an active attempt at question one with a selected answer.
      const store = placementTestStore();
      store.attemptId = 'test-attempt-uuid';
      store.currentQuestion = mockStartData.question;
      store.selectedAnswer = 'b';
      store.currentIndex = 1;
      store.totalQuestions = 5;

      const success = await store.submitAnswer();

      // The server accepted the response and supplied another question.
      expect(success).toBe(true);
      // Replace q1 with the q2 response from the backend.
      expect(store.currentQuestion?.id).toBe('q2');
      // Advance the one-based question counter by exactly one.
      expect(store.currentIndex).toBe(2);
      // Clear q1's answer so it cannot be resubmitted for q2.
      expect(store.selectedAnswer).toBe('');
      // Keep the assessment active because more questions remain.
      expect(store.isComplete).toBe(false);
      // Recalculate progress using two completed positions in the five-question fixture.
      expect(store.progressPercent).toBe(40);
    });

    it('marks assessment complete and stores evaluated placement result when test ends', async () => {
      // Configure answer grading to return a terminal evaluated result.
      vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(
        new $DataSourceResponse(mockCompletedResponse, null),
      );

      // Prepare an active attempt and an answer ready for submission.
      const store = placementTestStore();
      store.attemptId = 'test-attempt-uuid';
      store.currentQuestion = mockStartData.question;
      store.selectedAnswer = 'c';

      const success = await store.submitAnswer();

      // Accept the completed response as a successful store operation.
      expect(success).toBe(true);
      // Mark the attempt finished so the results view can render.
      expect(store.isComplete).toBe(true);
      // Remove the now-inactive question from reactive state.
      expect(store.currentQuestion).toBeNull();
      // Retain the server's assigned level and skill breakdown.
      expect(store.result).toEqual(mockCompletedResponse.result);
      // Release the submission lock after applying the result.
      expect(store.isSubmitting).toBe(false);
    });
  });

  describe('selectOption & reset', () => {
    it('updates selectedAnswer when test is interactive', () => {
      // Create a fresh store in an interactive, non-submitting state.
      const store = placementTestStore();
      // Select an option ID through the store action used by the UI.
      store.selectOption('opt-b');
      // Store the selected option for subsequent grading.
      expect(store.selectedAnswer).toBe('opt-b');
    });

    it('ignores option selection while submitting or after completion', () => {
      // Set up an existing response whose value should not change while locked.
      const store = placementTestStore();
      store.selectedAnswer = 'initial';
      store.isSubmitting = true;

      // Try to modify the response while a request is active.
      store.selectOption('new-opt');
      // Confirm in-flight submission locks the original selection.
      expect(store.selectedAnswer).toBe('initial');

      // End the request but mark the assessment as already complete.
      store.isSubmitting = false;
      store.isComplete = true;

      // Try to modify the response after the attempt has ended.
      store.selectOption('new-opt-2');
      // Confirm completed tests also keep the original selection unchanged.
      expect(store.selectedAnswer).toBe('initial');
    });

    it('resets all state back to clean defaults', () => {
      // Populate representative non-default values before calling reset.
      const store = placementTestStore();
      store.attemptId = 'some-uuid';
      store.selectedAnswer = 'ans';
      store.currentIndex = 3;
      store.isComplete = true;

      // Reset should restore the same initial state used when the screen opens.
      store.reset();

      // No prior attempt token should remain.
      expect(store.attemptId).toBeNull();
      // Clear the previous response.
      expect(store.selectedAnswer).toBe('');
      // Restore the first question position.
      expect(store.currentIndex).toBe(1);
      // Return the attempt to its active, not-completed status.
      expect(store.isComplete).toBe(false);
    });
  });

  describe('resumeTest', () => {
    it('nominal: restores an unfinished attempt at its question number, without a level-up notice', async () => {
      const store = placementTestStore();
      vi.spyOn(PlacementDataSource, 'getActiveAttempt').mockResolvedValue(new $DataSourceResponse({
        attempt: { ...mockStartData, question: { ...mockStartData.question, level_number: 2 }, totalQuestions: 30, questionNumber: 7, resumed: true },
      }, null));

      expect(await store.resumeTest()).toBe(true);

      expect(store.attemptId).toBe('test-attempt-uuid');
      expect(store.currentIndex).toBe(7);
      expect(store.totalQuestions).toBe(30);
      expect(store.currentLevelNumber).toBe(2);
      expect(store.unlockedLevel).toBeNull();
      expect(store.isComplete).toBe(false);
    });

    it('boundary: with nothing to carry on, leaves the store as it was', async () => {
      const store = placementTestStore();
      vi.spyOn(PlacementDataSource, 'getActiveAttempt').mockResolvedValue(new $DataSourceResponse({ attempt: null }, null));

      expect(await store.resumeTest()).toBe(false);
      expect(store.attemptId).toBeNull();
      expect(store.currentQuestion).toBeNull();
    });

    it('invalid: records an access refusal so the screen can redirect', async () => {
      const store = placementTestStore();
      vi.spyOn(PlacementDataSource, 'getActiveAttempt').mockResolvedValue(new $DataSourceResponse<never>(null, new Exception({
        exceptionType: ExceptionType.FORBIDDEN,
        message: 'learner setup must be completed before accessing content',
        statusCode: 403,
      })));

      expect(await store.resumeTest()).toBe(false);
      expect(store.isAccessBlocked).toBe(true);
      expect(store.refusal).toBe('setupRequired');
    });

    it('startTest begins at the question number the server gives (a continued attempt)', async () => {
      const store = placementTestStore();
      vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(new $DataSourceResponse({
        ...mockStartData, questionNumber: 4, resumed: true,
      }, null));

      expect(await store.startTest()).toBe(true);
      expect(store.currentIndex).toBe(4);
    });
  });
});
