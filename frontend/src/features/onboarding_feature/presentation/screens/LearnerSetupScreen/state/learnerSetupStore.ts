// Import Pinia's core function to create a state management store
import { defineStore } from 'pinia';
// Import custom error handling models for consistent API error typing
import { Exception } from '@/core/exceptions/models/ExceptionType';
// Import the data source which handles the actual HTTP requests to the backend API
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';
// Import TypeScript interfaces to ensure strict typing for our form data and API responses
import type { LearnerAccess, OnboardingInput, OnboardingSettings } from '@/features/onboarding_feature/models/OnboardingTypes';
import { i18n, setInterfaceLocale } from '@/i18n';
// A learner of English reads the app in English; a learner of isiZulu chooses.
import { learnerInterfaceLanguage } from '@/features/onboarding_feature/functions/learnerInterfaceLanguage';
// The signed-in account remembers the interface language its setup saved.
import { authStore } from '@/features/auth_feature/state/authStore';
// Import the placement datasource to ask whether a learner already has a level.
import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource';
import type { RouteLocationRaw } from 'vue-router';

// Calculate the current year once when the module loads to set a dynamic default birth year
// Define and export the store so it can be imported and used in Vue components
export const learnerSetupStore = defineStore('learnerSetupStore', {
  
  // State: The reactive data properties that our Vue components will observe and bind to
  state: () => ({ 
    // The form object directly bounds to the Vue template inputs (v-model)
    form: {
      // Keep the language choice empty until the learner selects a target.
      targetLanguage: '',
      // Empty until the learner enters it: it decides the child rules and is
      // fixed after the first save, so it must never be a silent default.
      dateOfBirth: '',
      // Start on the language the interface is in now (a new learner's choice
      // on the sign-up page, or this browser's last one), so a learner of
      // isiZulu is not switched back to English. Choosing English to learn
      // makes it English.
      interfaceLanguage: i18n.global.locale.value,
      // Offer a reasonable initial daily study commitment in minutes.
      dailyGoal: 15, // Default study goal in minutes
    } as OnboardingInput,
    
    // Holds the pristine, saved settings returned directly from the API
    // Null indicates that no saved setup record has been loaded yet.
    settings: null as OnboardingSettings | null,

    // Holds the evaluated child-safety access policy (isUnder13, hasActiveParentLink, canAccessContent)
    // Null means access has not yet been evaluated or returned by the API.
    access: null as LearnerAccess | null,
    
    // UI State flags to manage loading spinners, button disabling, and status messages
    // Track the initial settings request so the form can show a loading state.
    isLoading: false, // True while fetching initial data
    // Track a settings update so the submit control can prevent duplicate requests.
    isSaving: false,  // True while submitting data to the server
    // Retain a typed failure for safe, user-visible error presentation.
    error: null as Exception | null, // Holds any error objects returned from failed API calls
    // Signal a completed save so the screen can display confirmation.
    saved: false,     // Flag to trigger a success message in the UI upon successful save
    // True once a load has finished (with or without saved settings), so the
    // screen knows whether this learner is setting up for the first time.
    loaded: false,
    // Whether the most recent successful save created the learner's settings.
    lastSaveWasFirst: false,
  }),

  getters: {
    /** Whether the learner has saved their setup before. */
    hasSavedSettings: (state): boolean => state.settings !== null,
    /**
     * Once a guardian is linked, only they can change the learner's date of birth
     * (the server refuses a changed date). A learner with no linked guardian can
     * correct their own.
     */
    dateOfBirthLocked: (state): boolean => state.settings !== null && state.access?.hasActiveParentLink === true,
    /**
     * A learner who is 13 or older but was linked to a guardian as a child. The
     * link stays; they can see it (read only) from here, since their header has
     * no family page.
     */
    keepsGuardianLinkPastThirteen: (state): boolean =>
      state.settings !== null && state.access?.hasActiveParentLink === true && state.access.isUnder13 === false,
  },

  // Actions: Methods that manipulate the state, typically containing async business logic (API calls)
  actions: {
    
    /**
     * Fetches the user's existing onboarding settings from the backend API.
     * Updates the store's form state so the UI reflects the user's current preferences.
     */
    async load() {
      // Start from a clean slate: this store outlives a sign-out, and another
      // learner's saved settings must never lock this learner's date of birth.
      this.$reset();
      // Set busy before awaiting the network call so the UI responds immediately.
      this.isLoading = true;
      // Remove a prior error so it does not appear during the new request.
      this.error = null;
      
      // Execute the API call
      const response = await OnboardingDataSource.getSettings();
      
      // Handle failed retrievals before examining a successful payload.
      if (response.error != null) {
        // HTTP 404 indicates a first-time learner who has no saved preferences in the database yet.
        // This is the normal initial state during onboarding, so we do not surface it as an error to the user.
        if (response.error.statusCode !== 404) {
          // Capture genuine network or server errors to display in the UI
          // Preserve non-404 failures while treating first-time setup as normal.
          this.error = response.error;
        }
      } else if (response.data != null) {
        // If successful, store the raw API response and access policy...
        // Keep the server representation available separately from editable fields.
        this.settings = response.data;
        // Retain the policy snapshot for the screen's access-gate decision. The
        // settings read doesn't include it, so ask for it: it says whether a
        // guardian is linked, which decides whether the date of birth is locked.
        this.access = response.data.access ?? null;
        if (this.access === null) await this.checkAccess();
        // The interface language this learner reads: English while they learn
        // English, whatever an older save holds; otherwise their own choice.
        const interfaceLanguage = learnerInterfaceLanguage(response.data.target_language, response.data.interface_language);
        // ...and map the backend response fields to our local form fields
        this.form = {
          // Translate the database/API field name to the frontend form convention.
          targetLanguage: response.data.target_language,
          // Preserve the exact ISO date string for the date input.
          dateOfBirth: response.data.date_of_birth,
          // Map the saved interface copy language to the form control.
          interfaceLanguage,
          // Map the saved daily time goal to the number input.
          dailyGoal: response.data.daily_goal,
        };
        // Apply the saved interface preference to all vue-i18n messages.
        setInterfaceLocale(interfaceLanguage);
      }
      
      // A 404 is a finished load too (a new learner); other errors are not.
      this.loaded = this.error == null;
      // Clear the loading flag regardless of success or failure
      this.isLoading = false;
    },

    /**
     * Submits the current form state to the backend API to save the user's preferences.
     * Captures the updated settings and the evaluated access permissions.
     * @returns {Promise<boolean>} True if the save was successful, false otherwise.
     */
    async save(): Promise<boolean> {
      // Set UI flags to show saving progress and clear previous statuses
      // Mark the request active to disable duplicate form submissions.
      this.isSaving = true;
      // Clear a prior request error before attempting to save again.
      this.error = null;
      // Clear stale success feedback until this save is confirmed.
      this.saved = false;
      // No saved settings before this request means this save creates them.
      const isFirstSave = this.settings === null;
      
      // A learner of English saves English menus, whatever the form last held
      // (the server keeps the same rule).
      const interfaceLanguage = learnerInterfaceLanguage(this.form.targetLanguage, this.form.interfaceLanguage);
      // Execute the API call, passing the current form state
      const response = await OnboardingDataSource.saveSettings({ ...this.form, interfaceLanguage });
      
      // Handle failure case: error returned or empty data payload
      // Treat missing response data as failure as well as explicit API errors.
      if (response.error != null || response.data == null) {
        // Preserve the API error for display; null means the response was unexpectedly empty.
        this.error = response.error;
        // Re-enable the form so the learner can correct or retry.
        this.isSaving = false;
        // Tell the screen not to navigate as though setup had succeeded.
        return false;
      }
      
      // Handle success case: update pristine settings, access permissions, and trigger success UI flag
      this.settings = response.data;
      // Retain the access decision associated with the just-saved birth date.
      this.access = response.data.access ?? null;
      // Remember whether this save created the settings, for the next step of the journey.
      this.lastSaveWasFirst = isFirstSave;
      // Keep the form on the canonical saved date (fixed from now on).
      if (response.data.date_of_birth) this.form.dateOfBirth = response.data.date_of_birth;
      // The interface follows what was saved (English for a learner of English),
      // and the signed-in account remembers it, as the server now does.
      const savedLanguage = learnerInterfaceLanguage(response.data.target_language, response.data.interface_language);
      this.form.interfaceLanguage = savedLanguage;
      setInterfaceLocale(savedLanguage);
      authStore().rememberInterfaceLanguage(savedLanguage);
      // Enable the success message in the learner setup screen.
      this.saved = true;
      // Release the submit button after the successful response.
      this.isSaving = false;
      
      // Let the screen route onward only after the saved row is confirmed.
      return true;
    },

    /**
     * Where the learner goes after a successful save:
     *   - under 13 with no linked guardian: parent linking (content is refused);
     *   - their first save, not yet placed: the placement test;
     *   - otherwise: Explore.
     * If the level cannot be read, a first-time learner still goes to the
     * placement test, which offers to skip.
     */
    async destinationAfterSave(): Promise<RouteLocationRaw> {
      if (this.access && !this.access.canAccessContent) {
        return { name: 'parentLinking', query: { blocked: 'under13' } };
      }
      if (!this.lastSaveWasFirst) return { name: 'explore' };
      const level = await PlacementDataSource.getLearnerLevel();
      if (level.data?.placed) return { name: 'explore' };
      return { name: 'placementTest' };
    },

    /**
     * Queries the backend to evaluate the learner's access status using database records.
     * Useful to re-verify age and parent link policies.
     */
    async checkAccess(): Promise<LearnerAccess | null> {
      // Re-evaluate the stored birth date and guardian relationship through the API.
      const response = await OnboardingDataSource.getAccess();
      // Refresh local state and return the latest policy if the server supplied it.
      if (response.data != null) {
        this.access = response.data;
        return response.data;
      }
      // Keep any previous snapshot intact when the refresh has no payload.
      return null;
    },
  },
});