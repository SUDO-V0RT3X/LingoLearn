// Import testing utilities from Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Import Pinia utilities for setting up a testing store environment
import { createPinia, setActivePinia } from 'pinia';
// Import core models for handling errors and API responses
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
// Import type definitions for the onboarding feature
import type { OnboardingSettings } from '@/features/onboarding_feature/models/OnboardingTypes';

// Use vi.hoisted to create mock implementations BEFORE the actual modules are imported.
// This is necessary because Vitest hoists vi.mock calls to the top of the file, 
// so variables used inside vi.mock must also be hoisted.
const { onboardingDataSource } = vi.hoisted(() => ({
  onboardingDataSource: {
    // Stub fetching saved preferences from the onboarding API.
    getSettings: vi.fn(),
    // Stub saving edited preferences to the onboarding API.
    saveSettings: vi.fn(),
    // Stub refreshes of the learner's access policy.
    getAccess: vi.fn(),
  },
}));

// Mock the actual data source module and replace it with our hoisted mock object.
// When the store calls OnboardingDataSource, it will hit our mock functions instead of making real API calls.
vi.mock('@/features/onboarding_feature/datasources/onboardingDataSource', () => ({
  OnboardingDataSource: onboardingDataSource,
}));

// The placement datasource tells the journey whether a learner already has a level.
const { placementDataSource } = vi.hoisted(() => ({
  placementDataSource: { getLearnerLevel: vi.fn() },
}));
vi.mock('@/features/onboarding_feature/datasources/PlacementTestDataSource', () => ({
  PlacementDataSource: placementDataSource,
}));

// Import the store to be tested AFTER the mocks have been set up
import { learnerSetupStore } from '../learnerSetupStore';
// The shared translator, whose language the store sets from the saved settings.
import { i18n } from '@/i18n';

// Define a standard successful response payload (mocking the database record)
const settings: OnboardingSettings = {
  // Identify the learner associated with this setup fixture.
  user_id: 12,
  // Select isiZulu as the language being studied.
  target_language: 'zulu',
  // Provide the calendar date used by the age-access policy.
  date_of_birth: '2005-01-01',
  // Select isiZulu for interface copy in this sample record.
  interface_language: 'zulu',
  // Store the learner's daily time commitment in minutes.
  daily_goal: 30,
  // Record when this preference row was first created.
  created_at: '2026-09-13T08:00:00.000Z',
  // Record the most recent update time for this preference row.
  updated_at: '2026-09-13T08:10:00.000Z',
  // Include the access policy the setup API returns with saved preferences.
  access: {
    // This sample learner is not subject to the under-13 restriction.
    isUnder13: false,
    // No parent-link relationship is needed for this adult learner.
    hasActiveParentLink: false,
    // Permit this learner to access the general catalogue.
    canAccessContent: true,
    // Classify the catalogue audience as general rather than child-only.
    contentAudience: 'general',
  },
};

// Define a standard error payload representing an internal server error
const failure = new Exception({ exceptionType: ExceptionType.INTERNAL_SERVER_ERROR, message: 'Internal server error', statusCode: 500 });

// Setup function that runs before every single test case
beforeEach(() => {
  // Reset Pinia state to ensure tests are isolated and don't leak state into each other
  setActivePinia(createPinia());
  
  // Clear the call history of all mock functions
  vi.clearAllMocks();
  
  // Set default successful return values for our mocked API calls
  onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse(settings, null));
  onboardingDataSource.saveSettings.mockResolvedValue(new $DataSourceResponse(settings, null));
  onboardingDataSource.getAccess.mockResolvedValue(new $DataSourceResponse(settings.access, null));
});

// Group the tests for the learnerSetupStore
describe('learnerSetupStore', () => {
  
  it('maps saved database settings into the editable form and retains access', async () => {
    // Create the store using the isolated Pinia instance from beforeEach.
    const store = learnerSetupStore();

    // Trigger the load action
    // Exercise the same fetch action the learner setup screen calls on mount.
    await store.load();

    // Verify the raw settings and evaluated access from the "API" are stored
    expect(store.settings).toEqual(settings);
    // Keep the server-evaluated age/guardian policy alongside preferences.
    expect(store.access).toEqual(settings.access);
    // Verify the store correctly mapped the backend model to the frontend's reactive form object
    expect(store.form).toEqual({
      // Map the backend target language into the editable form's camelCase field.
      targetLanguage: 'zulu',
      // Preserve the date string expected by the date input.
      dateOfBirth: '2005-01-01',
      // Map the persisted interface-language preference.
      interfaceLanguage: 'zulu',
      // Map the persisted minute goal into the number input.
      dailyGoal: 30,
    });
    // Verify the loading indicator was turned off
    // Ensure the store releases its busy state when loading succeeds.
    expect(store.isLoading).toBe(false);
  });

  it('ignores 404 Not Found during load so new learners see a clean form without errors', async () => {
    // Simulate backend returning 404 because no settings exist yet for this user
    const notFound = new Exception({
      exceptionType: ExceptionType.NOT_FOUND,
      message: 'onboarding settings not found',
      statusCode: 404,
    });
    // Override the default GET response to represent first-time setup.
    onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse(null, notFound));
    // Start with clean store state before requesting the missing settings.
    const store = learnerSetupStore();

    // Treat the missing row as an untouched form instead of a server failure.
    await store.load();

    // Error should not be populated for normal 404 responses
    // Confirm first-run absence is deliberately suppressed from the error UI.
    expect(store.error).toBeNull();
    // Settings remain null, and loading state is cleanly turned off
    // Confirm no saved record is fabricated for the new learner.
    expect(store.settings).toBeNull();
    // Confirm the loading indicator is cleared after the 404 is handled.
    expect(store.isLoading).toBe(false);
  });

  it('keeps a load error and clears the loading state', async () => {
    // Override the default mock to simulate an API failure during load
    onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse(null, failure));
    // Create a fresh store that will receive the simulated backend failure.
    const store = learnerSetupStore();

    // Run the fetch action and let it store the returned error.
    await store.load();

    // Verify the error state is populated with the correct details
    expect(store.error).toMatchObject({ message: failure.message, statusCode: failure.statusCode });
    // Verify settings remain null
    // Avoid replacing preferences when their retrieval failed.
    expect(store.settings).toBeNull();
    // Verify loading indicator is safely turned off despite the error
    // Leave the screen able to retry rather than stuck in a spinner state.
    expect(store.isLoading).toBe(false);
  });

  it('saves the current form, marks the setup as saved, and captures access', async () => {
    // Create the store before populating a learner's submitted form data.
    const store = learnerSetupStore();
    
    // Simulate user input by directly modifying the form state
    store.form = {
      // Save isiZulu as the language whose content will be explored.
      targetLanguage: 'zulu',
      // Supply a valid birth date for the server-side age check.
      dateOfBirth: '2005-01-01',
      // Keep English as the interface language for this example.
      interfaceLanguage: 'english',
      // Ask for a fifteen-minute daily learning target.
      dailyGoal: 15,
    };

    // Trigger the save action and expect it to return true (success)
    // Assert the save action resolves successfully through the mocked API.
    await expect(store.save()).resolves.toBe(true);

    // Verify the mock API was called with the correct form payload
    expect(onboardingDataSource.saveSettings).toHaveBeenCalledWith({
      targetLanguage: 'zulu', dateOfBirth: '2005-01-01', interfaceLanguage: 'english', dailyGoal: 15,
    });
    // The interface follows the language the server saved.
    expect(store.form.interfaceLanguage).toBe('zulu');
    expect(i18n.global.locale.value).toBe('zulu');
    
    // Verify the store updated its internal state correctly post-save
    expect(store.settings).toEqual(settings);
    // Capture the access policy returned with the saved row.
    expect(store.access).toEqual(settings.access);
    // Expose success to the screen so it can display confirmation.
    expect(store.saved).toBe(true);
    // Ensure saving leaves the form interactive after success.
    expect(store.isSaving).toBe(false);
  });

  it('a learner of English saves English menus, whatever the form last held, and reads in English', async () => {
    onboardingDataSource.saveSettings.mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...settings, target_language: 'english', interface_language: 'english' }, null));
    i18n.global.locale.value = 'zulu';
    const store = learnerSetupStore();
    store.form = { targetLanguage: 'english', dateOfBirth: '2005-01-01', interfaceLanguage: 'zulu', dailyGoal: 15 };

    await expect(store.save()).resolves.toBe(true);

    expect(onboardingDataSource.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguage: 'english', interfaceLanguage: 'english',
    }));
    expect(i18n.global.locale.value).toBe('english');
  });

  it('loads a learner of English in English, even when an older row says isiZulu', async () => {
    onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...settings, target_language: 'english', interface_language: 'zulu' }, null));
    i18n.global.locale.value = 'zulu';
    const store = learnerSetupStore();

    await store.load();

    expect(store.form.interfaceLanguage).toBe('english');
    expect(i18n.global.locale.value).toBe('english');
  });

  it('keeps the form available when saving fails', async () => {
    // Override the default mock to simulate an API failure during save
    // Return no settings so the store must preserve the submitted form and show an error.
    onboardingDataSource.saveSettings.mockResolvedValue(new $DataSourceResponse(null, failure));
    // Create a clean store to observe only the current failed-save outcome.
    const store = learnerSetupStore();

    // Trigger the save action and expect it to return false (failure)
    // Assert the store reports failure rather than treating an empty response as success.
    await expect(store.save()).resolves.toBe(false);

    // Verify the error state is populated
    // Keep the server's safe error message and status available to the screen.
    expect(store.error).toMatchObject({ message: failure.message, statusCode: failure.statusCode });
    
    // Verify that we do NOT mark the setup as complete/saved
    // Do not show a success confirmation after the rejected save.
    expect(store.saved).toBe(false);
    // Verify the saving indicator is turned off so the user can try again
    expect(store.isSaving).toBe(false);
  });

  it('updates access via checkAccess()', async () => {
    // Create a store whose access snapshot is initially empty.
    const store = learnerSetupStore();
    // Represent the access restrictions for a learner younger than thirteen.
    const under13Access = {
      // Mark the learner as requiring child-specific access rules.
      isUnder13: true,
      // Show that no guardian has linked the account yet.
      hasActiveParentLink: false,
      // Deny entry until guardian linking satisfies the policy.
      canAccessContent: false,
      // Limit any content audience to child-safe material.
      contentAudience: 'child' as const,
    };
    // Return this policy from the API used by checkAccess().
    onboardingDataSource.getAccess.mockResolvedValue(new $DataSourceResponse(under13Access, null));

    // Refresh the store's access policy from the backend.
    const result = await store.checkAccess();

    // Return the refreshed policy to the direct caller.
    expect(result).toEqual(under13Access);
    // Store the same policy reactively for screens and route decisions.
    expect(store.access).toEqual(under13Access);
    // Confirm the access data source was queried exactly through its API method.
    expect(onboardingDataSource.getAccess).toHaveBeenCalled();
  });
});

describe('learnerSetupStore journey after saving', () => {
  const notFound = new Exception({ exceptionType: ExceptionType.NOT_FOUND, message: 'onboarding settings not found', statusCode: 404 });

  beforeEach(() => {
    placementDataSource.getLearnerLevel.mockResolvedValue(
      new $DataSourceResponse({ userId: 12, levelNumber: 1, placed: false }, null));
  });

  it('nominal: a first save of an unplaced learner goes to the placement test', async () => {
    onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse(null, notFound));
    const store = learnerSetupStore();
    await store.load();
    // A new learner must enter their own date of birth: there is no silent default.
    expect(store.form.dateOfBirth).toBe('');
    expect(store.dateOfBirthLocked).toBe(false);
    store.form = { targetLanguage: 'zulu', dateOfBirth: '2005-01-01', interfaceLanguage: 'english', dailyGoal: 15 };

    expect(await store.save()).toBe(true);

    expect(store.lastSaveWasFirst).toBe(true);
    expect(store.hasSavedSettings).toBe(true);
    // No guardian is linked, so the learner can still correct their date of birth.
    expect(store.dateOfBirthLocked).toBe(false);
    expect(await store.destinationAfterSave()).toEqual({ name: 'placementTest' });
  });

  it('nominal: a first save of a learner who already has a level goes to Explore', async () => {
    onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse(null, notFound));
    placementDataSource.getLearnerLevel.mockResolvedValue(
      new $DataSourceResponse({ userId: 12, levelNumber: 3, placed: true }, null));
    const store = learnerSetupStore();
    await store.load();
    store.form.dateOfBirth = '2005-01-01';
    store.form.targetLanguage = 'zulu';

    await store.save();

    expect(await store.destinationAfterSave()).toEqual({ name: 'explore' });
  });

  it('nominal: later saves go to Explore without asking for the level', async () => {
    const store = learnerSetupStore();
    await store.load();

    await store.save();

    expect(store.lastSaveWasFirst).toBe(false);
    expect(await store.destinationAfterSave()).toEqual({ name: 'explore' });
    expect(placementDataSource.getLearnerLevel).not.toHaveBeenCalled();
  });

  it('boundary: an under-13 learner with no linked guardian goes to parent linking, even on a first save', async () => {
    onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse(null, notFound));
    onboardingDataSource.saveSettings.mockResolvedValue(new $DataSourceResponse({
      ...settings,
      access: { isUnder13: true, hasActiveParentLink: false, canAccessContent: false, contentAudience: 'child' },
    }, null));
    const store = learnerSetupStore();
    await store.load();

    await store.save();

    expect(await store.destinationAfterSave()).toEqual({ name: 'parentLinking', query: { blocked: 'under13' } });
  });

  it('invalid: when the level cannot be read, a first-time learner still goes to the placement test', async () => {
    onboardingDataSource.getSettings.mockResolvedValue(new $DataSourceResponse(null, notFound));
    placementDataSource.getLearnerLevel.mockResolvedValue(new $DataSourceResponse(null, failure));
    const store = learnerSetupStore();
    await store.load();

    await store.save();

    expect(await store.destinationAfterSave()).toEqual({ name: 'placementTest' });
  });
});
