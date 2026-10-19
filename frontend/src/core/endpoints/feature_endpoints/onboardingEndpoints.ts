// Use the shared HTTP verb definitions so endpoints match HttpService behavior.
import { RequestMethod } from "@/core/http/functions/httpService";
// Use the common request descriptor to centralize route and payload handling.
import { $Endpoint } from "../models/EndpointType";
// Type onboarding endpoint payloads against the feature's API contracts.
import type { ChildDateOfBirth, LearnerAccess, OnboardingInput, OnboardingSettings } from "@/features/onboarding_feature/models/OnboardingTypes";

/** Defines the HTTP requests owned by learner onboarding. */
export class OnboardingEndpoints {
  /** Builds the authenticated request that loads the current learner's setup. */
  getSettings(): $Endpoint<OnboardingSettings> {
    return new $Endpoint<OnboardingSettings>({
      // Settings are retrieved without a JSON request body.
      method: RequestMethod.GET,
      // Target the learner-only settings read endpoint.
      route: '/api/onboarding/getSettings',
      // GET does not submit data to the server.
      jsonBody: null,
      // The datasource supplies the parser for the concrete response type.
      responseParser: null,
    });
  }

  /** Builds the idempotent update request for the learner's setup preferences. */
  saveSettings(input: OnboardingInput): $Endpoint<OnboardingSettings> {
    return new $Endpoint<OnboardingSettings>({
      // PUT communicates that the submitted preferences replace the current setup.
      method: RequestMethod.PUT,
      // Route through onboarding so validation and persistence stay feature-owned.
      route: '/api/onboarding/saveSettings',
      // Serialize the validated form payload as JSON.
      jsonBody: input,
      // Tell Express that the request payload is JSON.
      additionalHeaders: { 'Content-Type': 'application/json' },
      // Let the datasource parse the HTTP response into settings.
      responseParser: null,
    });
  }

  /**
   * Constructs the endpoint definition for fetching the learner's evaluated access permissions.
   * Calls GET /api/onboarding/access to determine age safety policies.
   */
  getAccess(): $Endpoint<LearnerAccess> {
    return new $Endpoint<LearnerAccess>({
      // Access is computed by the server from birth date and guardian links.
      method: RequestMethod.GET,
      // Use the policy endpoint instead of reproducing age logic in the client.
      route: '/api/onboarding/getAccess',
      // No request payload is necessary to check the authenticated learner.
      jsonBody: null,
      // Parse the returned policy in the onboarding datasource.
      responseParser: null,
    });
  }

  /** A linked guardian reads a child's saved date of birth. */
  getChildDateOfBirth(childId: number): $Endpoint<ChildDateOfBirth> {
    return new $Endpoint<ChildDateOfBirth>({
      method: RequestMethod.GET,
      route: `/api/onboarding/children/${childId}/dateOfBirth`,
      jsonBody: null,
      responseParser: null,
    });
  }

  /** A linked guardian corrects a child's date of birth (learners cannot change their own). */
  setChildDateOfBirth(childId: number, dateOfBirth: string): $Endpoint<ChildDateOfBirth> {
    return new $Endpoint<ChildDateOfBirth>({
      method: RequestMethod.PUT,
      route: `/api/onboarding/children/${childId}/dateOfBirth`,
      jsonBody: { dateOfBirth },
      additionalHeaders: { 'Content-Type': 'application/json' },
      responseParser: null,
    });
  }
}
