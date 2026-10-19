// Import API endpoint definitions and configuration
import { Endpoints } from '@/core/endpoints/endpoints';
// Import custom exception models for error handling and error classification
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
// Import standardized response wrapper for data sources
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
// Import Axios response type definition
import type { AxiosResponse } from 'axios';
// Import data transfer models specifically for the placement feature
//
// NOTE: adjust these names to match whatever you exported from PlacementTypes.ts.
//       The three this file depends on are:
//         • StartPlacementResponse — { attemptId, question, totalQuestions }
//         • SubmitAnswerInput      — { questionId, answer }
//         • SubmitResponse         — { correct, nextQuestion, isComplete, result? }
import type {
  // The learner's unfinished attempt, if any.
  ActivePlacementResponse,
  // The learner's saved level and whether they have been placed.
  LearnerLevelResponse,
  // Carry the learner-facing result contract through the network boundary.
  PlacementResult,
  // Describe the question structure displayed by the placement screen.
  PlacementQuestion,
  // Describe the selectable choices attached to multiple-choice questions.
  PlacementOption,
  // Type the completion payload returned when the learner quits a test.
  QuitPlacementResponse,
  // Type the persisted default-level response returned when placement is skipped.
  SkipPlacementResponse,
  // Type the attempt and initial question returned when a test starts.
  SubmitResponse,
  // Type the grade-and-progress result returned after submitting an answer.
  StartPlacementResponse,
  // Type the question identifier and answer sent to the grading endpoint.
  SubmitAnswerInput,
} from '../models/PlacementTestTypes';

/**
 * Backend routes this datasource is written against. If your actual routes
 * differ, update the matching method in `placementEndpoints.ts` — nothing
 * below needs to change, because the datasource only ever calls through
 * `Endpoints.Placement.*`.
 *
 *   POST /api/placement/startPlacement               → startPlacement()
 *   POST /api/placement/submitAnswer/:attemptId      → submitAnswer()
 *
 * If your backend splits "next question" or "result" into their own routes
 * (e.g. GET /api/placement/getNextQuestion/:attemptId), add a matching
 * static method here following the same shape as `submitAnswer()` below.
 */

/**
 * Helper function to generate a standardized failure response wrapper
 * when an unhandled execution exception or network failure occurs.
 *
 * @template T - The expected data payload type
 * @param message - The user-friendly error message to attach to the exception
 * @returns A standardized data source response object with null data and a populated exception
 */
function failedResponse<T>(message: string): $DataSourceResponse<T> {
  return {
    data: null,
    error: new Exception({
      exceptionType: ExceptionType.FAILED,
      message,
      statusCode: 500,
    }),
  };
}

/**
 * Data Source class handling all remote API calls related to the language
 * placement test. Encapsulates network communication and maps backend
 * responses into strongly typed frontend models.
 *
 * Like every datasource in the project, this class never throws: every
 * method resolves with either `{ data, error: null }` or `{ data: null, error }`.
 * Callers (the placement store) only need to check `response.error`.
 */
export class PlacementDataSource {

  /**
   * Begins a new placement attempt and fetches the first question.
   *
   * The server is responsible for:
   *   • Applying the same learner-access gate used by /api/content — an
   *     under-13 learner with no linked guardian should get a 403 here, and
   *     the caller should redirect to the parent-linking screen.
   *   • Creating a row in `placement_attempts` and returning its id.
   *   • Selecting the first question from the placement question table and
   *     stripping the correct-answer column before sending it down.
   *
   * @returns A promise resolving to a standardized response containing the
   *          attempt id, the first question, and the total question cap —
   *          or an `Exception` on failure.
   */
  static async startPlacement(): Promise<$DataSourceResponse<StartPlacementResponse>> {
    try {
      // Parser callback to cast the raw Axios HTTP response data to the target model type
      const parser = (response: AxiosResponse) => response.data as StartPlacementResponse;

      // Execute the POST endpoint call passing the response parser
      const response = await Endpoints.Placement.startPlacement().callWithParser(parser);

      // Check if the API request returned an explicit error or missing payload
      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'No placement attempt returned.',
            statusCode: 500,
          }),
        };
      }

      // Return successful response with the attempt and first question
      return { data: response.data, error: null };
    } catch (error) {
      // Catch unexpected code execution failures, log them, and return a safe fallback error
      console.error('Exception in PlacementDataSource.startPlacement:', error);
      return failedResponse('Failed to start the placement test. Please try again.');
    }
  }

  /**
   * Submits the learner's answer to the current question.
   *
   * Correctness is decided server-side — the frontend never sees the answer
   * key. The response tells the screen everything it needs to either advance
   * to the next question, or end the test and show a result.
   *
   * @param attemptId - The id returned by `startPlacement`, identifying this attempt.
   * @param input     - The question id and the learner's answer (option id or typed text).
   * @returns A promise resolving to a standardized response containing the
   *          next question (or completion flag + result) — or an `Exception`.
   */
  static async submitAnswer(
    attemptId: string,
    input: SubmitAnswerInput,
  ): Promise<$DataSourceResponse<SubmitResponse>> {
    try {
      // Parser callback to cast the raw Axios HTTP response data to the target model type
      const parser = (response: AxiosResponse) => response.data as SubmitResponse;

      // Execute the POST endpoint call with the path parameter, request body,
      // and response parser. `attemptId` goes in the URL; `input` in the JSON body.
      const response = await Endpoints.Placement
        .submitAnswer(attemptId, input)
        .callWithParser(parser);

      // Check if the API request returned an explicit error or missing payload
      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'No answer response returned.',
            statusCode: 500,
          }),
        };
      }

      // Return the server's verdict: correct/incorrect, next question or result
      return { data: response.data, error: null };
    } catch (error) {
      // Catch unexpected code execution failures, log them, and return a safe fallback error
      console.error('Exception in PlacementDataSource.submitAnswer:', error);
      return failedResponse('Failed to submit your answer. Please try again.');
    }
  }

  static async skipPlacement(): Promise<$DataSourceResponse<SkipPlacementResponse>> {
    try {
      // Decode the response body as the persisted learner-level assignment.
      const parser = (response: AxiosResponse) => response.data as SkipPlacementResponse;
      // Invoke the onboarding-owned skip endpoint, which assigns Level 1.
      const response = await Endpoints.Placement.skipPlacement().callWithParser(parser);

      // Preserve an API failure or synthesize one if the server returned no payload.
      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'Failed to skip the placement test.',
            statusCode: 500,
          }),
        };
      }

      // Return the successful skip result without changing its API contract.
      return { data: response.data, error: null };
    } catch (error) {
      // Convert unexpected transport or parsing exceptions to a user-safe failure.
      console.error('Exception in PlacementDataSource.skipPlacement:', error);
      // Keep the datasource promise non-throwing for the store caller.
      return failedResponse('Failed to skip the placement test. Please try again.');
    }
  }

  /** Ends an active placement attempt and returns the level assigned by the backend. */
  static async quitPlacement(attemptId: string): Promise<$DataSourceResponse<QuitPlacementResponse>> {
    try {
      // Interpret the server payload using the shared completion-response model.
      const parser = (response: AxiosResponse) => response.data as QuitPlacementResponse;
      // Call the attempt-specific quit endpoint through the centralized endpoint definition.
      const response = await Endpoints.Placement.quitPlacement(attemptId).callWithParser(parser);

      // Preserve the server error, or report a missing completion payload as a failure.
      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'Failed to quit the placement test.',
            statusCode: 500,
          }),
        };
      }

      // Return the backend's assigned-level result to the placement store.
      return { data: response.data, error: null };
    } catch (error) {
      // Log unexpected exceptions for developers while keeping details out of user-facing errors.
      console.error('Exception in PlacementDataSource.quitPlacement:', error);
      // Keep network and parser failures inside the standard response wrapper.
      return failedResponse('Failed to quit the placement test. Please try again.');
    }
  }

  /**
   * Reads the learner's unfinished placement attempt, if any, so the screen can
   * carry on at the same question after a reload. Never starts an attempt.
   */
  static async getActiveAttempt(): Promise<$DataSourceResponse<ActivePlacementResponse>> {
    try {
      const parser = (response: AxiosResponse) => response.data as ActivePlacementResponse;
      const response = await Endpoints.Placement.getActiveAttempt().callWithParser(parser);
      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'No placement attempt returned.',
            statusCode: 500,
          }),
        };
      }
      return { data: response.data, error: null };
    } catch (error) {
      console.error('Exception in PlacementDataSource.getActiveAttempt:', error);
      return failedResponse('Failed to load your placement test. Please try again.');
    }
  }

  /** Reads the learner's saved level, including whether they have been placed yet. */
  static async getLearnerLevel(): Promise<$DataSourceResponse<LearnerLevelResponse>> {
    try {
      const parser = (response: AxiosResponse) => response.data as LearnerLevelResponse;
      const response = await Endpoints.Placement.getLearnerLevel().callWithParser(parser);
      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'No learner level returned.',
            statusCode: 500,
          }),
        };
      }
      return { data: response.data, error: null };
    } catch (error) {
      console.error('Exception in PlacementDataSource.getLearnerLevel:', error);
      return failedResponse('Failed to load your level. Please try again.');
    }
  }
}
