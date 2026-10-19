// Import the test declarations, assertions, and API mocks used by these cases.
import { describe, expect, it, vi } from 'vitest';
// Import typed exception and response values used to simulate backend outcomes.
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
// Import the persisted preferences contract returned by onboarding endpoints.
import type { OnboardingSettings } from '../../models/OnboardingTypes';

// Create endpoint spies before Vitest evaluates the mocked module imports.
const { onboardingEndpoints } = vi.hoisted(() => ({
  onboardingEndpoints: {
    // Stub the GET endpoint for previously saved learner setup.
    getSettings: vi.fn(),
    // Stub the PUT endpoint for preferences submitted by the learner.
    saveSettings: vi.fn(),
    // Stub the GET endpoint that returns server-computed access policy.
    getAccess: vi.fn(),
  },
}));

// Replace the real endpoint registry so these tests perform no HTTP requests.
vi.mock('@/core/endpoints/endpoints', () => ({
  Endpoints: { Onboarding: onboardingEndpoints },
}));

// Load the datasource only after its endpoint dependency has been mocked.
import { OnboardingDataSource } from '../onboardingDataSource';
// Type access-policy fixture data using the public onboarding model.
import type { LearnerAccess } from '../../models/OnboardingTypes';

// Represent the settings row returned by a successful learner settings GET.
const settings: OnboardingSettings = {
  // Identify the learner whose setup is being retrieved.
  user_id: 1,
  // Identify the selected language for learning content.
  target_language: 'zulu',
  // Provide the saved birth date in API string format.
  date_of_birth: '2005-01-01',
  // Provide the saved interface copy preference.
  interface_language: 'english',
  // Provide the saved daily goal in minutes.
  daily_goal: 15,
  // Provide the persisted creation timestamp.
  created_at: '2026-09-13T08:00:00.000Z',
  // Provide the persisted last-update timestamp.
  updated_at: '2026-09-13T08:00:00.000Z',
};

// Represent the camelCase payload sent from the learner setup form.
const input = {
  // Submit isiZulu as the language whose materials the learner wants.
  targetLanguage: 'zulu',
  // Submit a valid date used by the server's safety policy.
  dateOfBirth: '2005-01-01',
  // Submit English as the interface language.
  interfaceLanguage: 'english',
  // Submit a fifteen-minute target for daily study.
  dailyGoal: 15,
};

// Represent an access policy that denies general content pending a parent link.
const accessData: LearnerAccess = {
  // Mark this learner as below the age threshold.
  isUnder13: true,
  // Indicate that no active parent relationship has been established.
  hasActiveParentLink: false,
  // Deny content access until the missing relationship is resolved.
  canAccessContent: false,
  // Limit eventual content results to child-audience material.
  contentAudience: 'child',
};

// Wrap fake API outcomes in the same response shape returned by endpoint calls.
function endpointResponse<T>(response: $DataSourceResponse<T>) {
  // Resolve immediately so tests exercise mapping without network latency.
  return { callWithParser: vi.fn().mockResolvedValue(response) };
}

describe('OnboardingDataSource', () => {
  it('returns parsed settings from a successful GET', async () => {
    // Return the persisted setup fixture from the mocked endpoint.
    onboardingEndpoints.getSettings.mockReturnValue(endpointResponse(new $DataSourceResponse(settings, null)));

    // Verify the datasource returns the typed payload without changing its values.
    await expect(OnboardingDataSource.getSettings()).resolves.toEqual({ data: settings, error: null });
  });

  it('preserves API errors from GET', async () => {
    // Simulate a missing setup record reported by the server.
    const error = new Exception({ exceptionType: ExceptionType.NOT_FOUND, message: 'Not found', statusCode: 404 });
    // Configure the endpoint result to carry the error and no data.
    onboardingEndpoints.getSettings.mockReturnValue(endpointResponse(new $DataSourceResponse(null, error)));

    // Preserve the original 404 for store logic to interpret as first-run setup.
    await expect(OnboardingDataSource.getSettings()).resolves.toEqual({ data: null, error });
  });

  it('sends the onboarding payload through the save endpoint', async () => {
    // Return a successful settings row for the save operation.
    onboardingEndpoints.saveSettings.mockReturnValue(endpointResponse(new $DataSourceResponse(settings, null)));

    // Verify successful persistence is returned in the standard wrapper.
    await expect(OnboardingDataSource.saveSettings(input)).resolves.toEqual({ data: settings, error: null });
    // Ensure the data source forwards the learner's form payload unchanged.
    expect(onboardingEndpoints.saveSettings).toHaveBeenCalledWith(input);
  });

  it('converts unexpected GET failures into a safe frontend exception', async () => {
    // Make the endpoint reject unexpectedly to exercise the catch branch.
    onboardingEndpoints.getSettings.mockReturnValue({
      callWithParser: vi.fn().mockRejectedValue(new Error('network down')),
    });

    // Run the request and inspect the non-throwing datasource response.
    const response = await OnboardingDataSource.getSettings();

    // No settings can be returned when transport fails.
    expect(response.data).toBeNull();
    // Expose a safe learner-facing fallback message rather than raw internals.
    expect(response.error?.message).toBe('Failed to load learner setup. Please try again.');
    // Classify unexpected fetch errors as server failures.
    expect(response.error?.statusCode).toBe(500);
  });

  it('returns parsed access permissions from getAccess()', async () => {
    // Return the child policy fixture from the mocked access endpoint.
    onboardingEndpoints.getAccess.mockReturnValue(endpointResponse(new $DataSourceResponse(accessData, null)));

    // Preserve the full access decision for the screen's route guard.
    await expect(OnboardingDataSource.getAccess()).resolves.toEqual({ data: accessData, error: null });
  });

  it('converts unexpected getAccess failures into a safe frontend exception', async () => {
    // Simulate an unexpected rejection from the policy endpoint.
    onboardingEndpoints.getAccess.mockReturnValue({
      callWithParser: vi.fn().mockRejectedValue(new Error('server error')),
    });

    // Ask the datasource to normalize the rejected promise into its response shape.
    const response = await OnboardingDataSource.getAccess();

    // A failed policy request has no policy payload.
    expect(response.data).toBeNull();
    // Return the purpose-specific fallback message to the caller.
    expect(response.error?.message).toBe('Failed to evaluate learner access. Please try again.');
    // Preserve a server-error status in the standardized exception.
    expect(response.error?.statusCode).toBe(500);
  });
});
