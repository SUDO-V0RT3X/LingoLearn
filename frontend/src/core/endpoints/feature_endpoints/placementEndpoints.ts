// Share the application's request-method enum across endpoint definitions.
import { RequestMethod } from "@/core/http/functions/httpService";
// Describe placement calls with the shared endpoint configuration model.
import { $Endpoint } from "../models/EndpointType";
// Type every request and response against the placement feature's domain model.
import type {
  ActivePlacementResponse,
  LearnerLevelResponse,
  QuitPlacementResponse,
  SkipPlacementResponse,
  StartPlacementResponse,
  SubmitAnswerInput,
  SubmitResponse,
} from "@/features/onboarding_feature/models/PlacementTestTypes";

/**
 * Endpoint definitions for the language placement test feature.
 * Connects frontend data sources to backend placement REST routes.
 */
export class PlacementEndpoints {
  /**
   * Constructs the endpoint definition for starting a new placement test attempt.
   * Calls POST /api/placement/startPlacement to initialize the session and fetch question 1.
   *
   * @returns An endpoint configuration resolving to StartPlacementResponse
   */
  startPlacement(): $Endpoint<StartPlacementResponse> {
    return new $Endpoint<StartPlacementResponse>({
      // Start an assessment attempt using an HTTP POST request.
      method: RequestMethod.POST,
      // Use the placement owner to enforce access and create the attempt.
      route: '/api/placement/startPlacement',
      // The authenticated identity supplies the learner; no body is needed.
      jsonBody: null,
      // The datasource attaches the response parser at call time.
      responseParser: null,
    });
  }

  /**
   * Constructs the endpoint definition for submitting a learner's answer to a question.
   * Calls POST /api/placement/submitAnswer/:attemptId to grade the answer and advance or complete the test.
   *
   * @param attemptId - The unique UUID identifying the active placement session
   * @param input - The question ID and the learner's submitted answer
   * @returns An endpoint configuration resolving to SubmitResponse
   */
  submitAnswer(attemptId: string, input: SubmitAnswerInput): $Endpoint<SubmitResponse> {
    return new $Endpoint<SubmitResponse>({
      // Submit the learner's selected answer as a state-changing request.
      method: RequestMethod.POST,
      // Keep the placement grading action under the placement API namespace.
      route: '/api/placement/submitAnswer',
      // Append the active attempt identifier to address its question session.
      pathParameters: [attemptId],
      // Send only the current question ID and learner response for server grading.
      jsonBody: input,
      // Ensure the backend parses the submitted answer as JSON.
      additionalHeaders: { 'Content-Type': 'application/json' },
      // Allow the data source to define response parsing consistently.
      responseParser: null,
    });
  }

  skipPlacement(): $Endpoint<SkipPlacementResponse> {
    return new $Endpoint<SkipPlacementResponse>({
      // Skipping persists a default level, so represent it as POST.
      method: RequestMethod.POST,
      // Call the placement-owned skip operation.
      route: '/api/placement/skipPlacement',
      // Send an empty JSON object rather than the invalid JSON literal null.
      jsonBody: {},
      // Set JSON content type for Express body parsing.
      additionalHeaders: { 'Content-Type': 'application/json' },
      // Let the datasource parse the assigned-level response.
      responseParser: null,
    });
  }

  quitPlacement(attemptId: string): $Endpoint<QuitPlacementResponse> {
    return new $Endpoint<QuitPlacementResponse>({
      // Quitting persists completion and the learner's current level.
      method: RequestMethod.POST,
      // Distinguish quit from answer grading while remaining under placement ownership.
      route: '/api/placement/quitPlacement',
      // Identify the exact assessment attempt that is being closed.
      pathParameters: [attemptId],
      // The attempt identity is sufficient; send a parseable empty JSON body.
      jsonBody: {},
      // Explicitly mark the body so the backend JSON parser handles it correctly.
      additionalHeaders: { 'Content-Type': 'application/json' },
      // The datasource supplies a typed result parser when making the call.
      responseParser: null,
    });
  }

  /** Reads the learner's unfinished attempt (at its current question), so a reload can carry on. */
  getActiveAttempt(): $Endpoint<ActivePlacementResponse> {
    return new $Endpoint<ActivePlacementResponse>({
      method: RequestMethod.GET,
      route: '/api/placement/getActiveAttempt',
      jsonBody: null,
      responseParser: null,
    });
  }

  /** Reads the learner's saved level and whether they have been placed. */
  getLearnerLevel(): $Endpoint<LearnerLevelResponse> {
    return new $Endpoint<LearnerLevelResponse>({
      method: RequestMethod.GET,
      route: '/api/placement/getLearnerLevel',
      jsonBody: null,
      responseParser: null,
    });
  }
}
