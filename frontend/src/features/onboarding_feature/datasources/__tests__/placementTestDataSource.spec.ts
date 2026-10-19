// Import Vitest's suite, assertion, mock, and setup functions.
import { describe, expect, it, vi, beforeEach } from 'vitest';
// Import API error types used to simulate server-side failures.
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
// Import the shared data-source response wrapper returned to the store.
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
// Import response contracts used to type deterministic test fixtures.
import type {
  StartPlacementResponse,
  SubmitResponse,
} from '../../models/PlacementTestTypes';

// Create endpoint spies before Vitest hoists and evaluates the module mock.
const { placementEndpoints } = vi.hoisted(() => ({
  placementEndpoints: {
    // Stub attempt initialization requests.
    startPlacement: vi.fn(),
    // Stub answer grading and progression requests.
    submitAnswer: vi.fn(),
    // Stub requests that assign the default level after skipping.
    skipPlacement: vi.fn(),
    // Stub requests that complete an active attempt at its current level.
    quitPlacement: vi.fn(),
    // Stub reads of the learner's unfinished attempt.
    getActiveAttempt: vi.fn(),
  },
}));

// Replace the endpoint registry so datasource tests never contact the backend.
vi.mock('@/core/endpoints/endpoints', () => ({
  Endpoints: { Placement: placementEndpoints },
}));

// Import the datasource after the endpoint mock has been installed.
import { PlacementDataSource } from '../PlacementTestDataSource';

// Provide the attempt token and first question used by start tests.
const mockStartData: StartPlacementResponse = {
  // Use a valid-looking stable identifier for subsequent API call assertions.
  attemptId: '11111111-2222-3333-4444-555555555555',
  // Return the first question in the sample ladder.
  question: {
    // Identify the first item.
    id: 'q1',
    // Categorize the prompt for the question heading.
    section: 'Grammar & Vocabulary',
    // Give the learner a direction before selecting an option.
    instructions: 'Choose the correct answer below.',
    // Render the choices as radio controls.
    type: 'multiple-choice',
    // Supply the visible question prompt.
    prompt: 'I have lived here _____ 2019.',
    // Include one answer choice for data-source mapping coverage.
    options: [{ id: 'b', text: 'since' }],
  },
  // Report the sample ladder length for the UI's progress calculations.
  totalQuestions: 5,
};

// Model a successful graded answer that advances rather than completes the attempt.
const mockSubmitData: SubmitResponse = {
  // Mark the supplied answer as correct.
  correct: true,
  // Return the next question to the placement store.
  nextQuestion: {
    // Identify the following question.
    id: 'q2',
    // Preserve its grammar/vocabulary section label.
    section: 'Grammar & Vocabulary',
    // Include the instruction needed by the screen.
    instructions: 'Choose the correct answer below.',
    // Use the multiple-choice answer control.
    type: 'multiple-choice',
    // Provide a prompt used by progression logic tests.
    prompt: 'She _____ to school every day.',
    // Supply the available next-question answer.
    options: [{ id: 'b', text: 'walks' }],
  },
  // Keep this response nonterminal because another item follows.
  isComplete: false,
};

// Build endpoint call doubles that resolve to the supplied wrapped API response.
function endpointResponse<T>(response: $DataSourceResponse<T>) {
  // The datasource installs a response parser and awaits this deterministic promise.
  return { callWithParser: vi.fn().mockResolvedValue(response) };
}

describe('PlacementDataSource (Unit)', () => {
  beforeEach(() => {
    // Reset endpoint call counts and mock outcomes before each case.
    vi.clearAllMocks();
  });

  describe('startPlacement', () => {
    it('returns parsed start response with attempt and first question upon success', async () => {
      // Configure the endpoint to return an attempt and its initial question.
      placementEndpoints.startPlacement.mockReturnValue(
        endpointResponse(new $DataSourceResponse(mockStartData, null)),
      );

      // Call the public datasource operation used by the store.
      const result = await PlacementDataSource.startPlacement();
      // Preserve the parsed payload and report no error.
      expect(result).toEqual({ data: mockStartData, error: null });
      // Confirm the datasource requests a fresh placement attempt exactly once.
      expect(placementEndpoints.startPlacement).toHaveBeenCalledOnce();
    });

    it('preserves and returns API exceptions without throwing (e.g. 403 under-13 refusal)', async () => {
      // Represent the learner access refusal returned by the backend.
      const error = new Exception({
        exceptionType: ExceptionType.FAILED,
        message: 'Parent link required',
        statusCode: 403,
      });

      // Make the endpoint return the typed failure rather than reject its promise.
      placementEndpoints.startPlacement.mockReturnValue(
        endpointResponse(new $DataSourceResponse(null, error)),
      );

      // Preserve the 403 so the store can trigger parent-linking navigation.
      const result = await PlacementDataSource.startPlacement();
      expect(result).toEqual({ data: null, error });
    });

    it('catches unexpected execution errors and returns a safe fallback exception', async () => {
      // Simulate a rejected transport promise rather than a structured API error.
      placementEndpoints.startPlacement.mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network offline')),
      });

      // Normalize the rejection into the datasource's non-throwing response format.
      const result = await PlacementDataSource.startPlacement();
      // No attempt payload exists after the unexpected failure.
      expect(result.data).toBeNull();
      // Provide a fallback exception suitable for the learner-facing UI.
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Failed to start the placement test');
    });
  });

  describe('submitAnswer', () => {
    const attemptId = '11111111-2222-3333-4444-555555555555';
    const input = { questionId: 'q1', answer: 'b' };

    it('returns parsed grading evaluation upon successful submission', async () => {
      // Return a next-question response from the mocked submit endpoint.
      placementEndpoints.submitAnswer.mockReturnValue(
        endpointResponse(new $DataSourceResponse(mockSubmitData, null)),
      );

      // Call grading with the attempt ID and answer body.
      const result = await PlacementDataSource.submitAnswer(attemptId, input);
      // Preserve the backend's progression data for the store.
      expect(result).toEqual({ data: mockSubmitData, error: null });
      // Verify the attempt path and JSON body are forwarded unchanged.
      expect(placementEndpoints.submitAnswer).toHaveBeenCalledWith(attemptId, input);
    });

    it('preserves and returns API error responses without throwing', async () => {
      // Model an expired or unknown placement attempt from the backend.
      const error = new Exception({
        exceptionType: ExceptionType.FAILED,
        message: 'Attempt not found',
        statusCode: 404,
      });

      // Return the error as a response instead of a rejected promise.
      placementEndpoints.submitAnswer.mockReturnValue(
        endpointResponse(new $DataSourceResponse(null, error)),
      );

      // Keep the API's 404 error available to the store and screen.
      const result = await PlacementDataSource.submitAnswer(attemptId, input);
      expect(result).toEqual({ data: null, error });
    });

    it('catches network errors gracefully and returns a standardized failure response', async () => {
      // Simulate a network timeout while submitting a learner response.
      placementEndpoints.submitAnswer.mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Timeout')),
      });

      // Verify the datasource catches the transport error and resolves safely.
      const result = await PlacementDataSource.submitAnswer(attemptId, input);
      // Do not claim that a grading result exists after a timeout.
      expect(result.data).toBeNull();
      // Ensure the failure wrapper carries a typed fallback message.
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Failed to submit your answer');
    });
  });

  describe('skipPlacement', () => {
    it('returns the default level 1 snapshot when a learner skips the assessment', async () => {
      // Represent the confirmed assignment returned by the skip API.
      const payload = { userId: 42, levelNumber: 1 };
      // Make the endpoint return the default-level confirmation.
      placementEndpoints.skipPlacement.mockReturnValue(
        endpointResponse(new $DataSourceResponse(payload, null)),
      );

      // Ask the datasource to execute and parse the skip operation.
      const result = await PlacementDataSource.skipPlacement();
      // Preserve the assigned learner ID and level in the success wrapper.
      expect(result).toEqual({ data: payload, error: null });
      // Confirm the endpoint is invoked exactly once without a request parameter.
      expect(placementEndpoints.skipPlacement).toHaveBeenCalledOnce();
    });

    it('returns API failure without throwing when skipping is rejected', async () => {
      // Create a typed API error for a skip operation the server rejects.
      const error = new Exception({
        exceptionType: ExceptionType.FAILED,
        message: 'Skip action failed',
        statusCode: 400,
      });

      // Return the error payload from the mocked endpoint call.
      placementEndpoints.skipPlacement.mockReturnValue(
        endpointResponse(new $DataSourceResponse(null, error)),
      );

      // Preserve the rejection in the standard response without throwing.
      const result = await PlacementDataSource.skipPlacement();
      expect(result).toEqual({ data: null, error });
    });
  });

  describe('quitPlacement', () => {
    it('returns the final placement result for an attempt', async () => {
      // Model a completed result returned by the attempt-specific quit endpoint.
      const result = {
        correct: false,
        nextQuestion: null,
        isComplete: true,
        result: { levelNumber: 3, level: 'A2', label: 'Level 3' },
      };
      // Configure the mock endpoint to return the completion payload.
      placementEndpoints.quitPlacement.mockReturnValue(
        endpointResponse(new $DataSourceResponse(result, null)),
      );

      // Quit the sample attempt and parse the returned placement result.
      const response = await PlacementDataSource.quitPlacement('test-attempt');
      // Preserve the complete result for the store to render.
      expect(response).toEqual({ data: result, error: null });
      // Ensure the requested attempt ID reaches the endpoint definition.
      expect(placementEndpoints.quitPlacement).toHaveBeenCalledWith('test-attempt');
    });
  });

  describe('getActiveAttempt', () => {
    it('nominal: returns the unfinished attempt at its current question', async () => {
      const data = { attempt: { ...mockStartData, questionNumber: 4, resumed: true } };
      placementEndpoints.getActiveAttempt.mockReturnValue(endpointResponse(new $DataSourceResponse(data, null)));

      expect(await PlacementDataSource.getActiveAttempt()).toEqual({ data, error: null });
    });

    it('boundary: passes on { attempt: null } when there is nothing to carry on', async () => {
      placementEndpoints.getActiveAttempt.mockReturnValue(endpointResponse(new $DataSourceResponse({ attempt: null }, null)));

      expect(await PlacementDataSource.getActiveAttempt()).toEqual({ data: { attempt: null }, error: null });
    });

    it('invalid: returns the refusal without throwing, and a safe message when the call throws', async () => {
      const error = new Exception({ exceptionType: ExceptionType.FAILED, message: 'an active parent link is required before accessing content', statusCode: 403 });
      placementEndpoints.getActiveAttempt.mockReturnValue(endpointResponse(new $DataSourceResponse(null, error)));
      expect(await PlacementDataSource.getActiveAttempt()).toEqual({ data: null, error });

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      placementEndpoints.getActiveAttempt.mockImplementation(() => { throw new Error('boom'); });
      const failed = await PlacementDataSource.getActiveAttempt();
      expect(failed.error?.message).toBe('Failed to load your placement test. Please try again.');
      consoleError.mockRestore();
    });
  });
});

