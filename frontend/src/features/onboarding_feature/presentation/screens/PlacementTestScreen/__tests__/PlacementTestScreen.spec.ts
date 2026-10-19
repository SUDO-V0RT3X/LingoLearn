// Import the test lifecycle, assertion, and mock helpers used by this file.
import { describe, it, expect, beforeEach, vi } from 'vitest';
// Import Vue Test Utils helpers for mounting screens and settling pending promises.
import { mount, flushPromises } from '@vue/test-utils';
// Import Pinia setup helpers so each test starts with an isolated store instance.
import { createPinia, setActivePinia } from 'pinia';
// Import an in-memory router to verify navigation without opening a browser.
import { createRouter, createMemoryHistory } from 'vue-router';
// Import the app locale plugin required by the placement screen's translated copy.
import { i18n } from '@/i18n';
// Import the API boundary that each test replaces with deterministic responses.
import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource';
// Import the response wrapper expected by the placement datasource contract.
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
// Import typed failures so the under-13 access case can be reproduced precisely.
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
// Import the screen whose intro, test, result, and navigation behavior is under test.
import PlacementTestScreen from '../PlacementTestScreen.vue';
// Import the stores the screen reads: sign-out goes through auth; the child theme through theme.
import { authStore } from '@/features/auth_feature/state/authStore';
import { themeStore } from '@/features/shared/state/themeStore';
import { forgetPlacement } from '@/features/shared/state/placementGate';
import onboardingLocale from '@/locales/onboarding';

// Signing out forgets the cached placement, as the header does; spy on it.
vi.mock('@/features/shared/state/placementGate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/shared/state/placementGate')>()),
  forgetPlacement: vi.fn(),
}));
// Import API response contracts for strongly typed fixture payloads.
import type {
  SkipPlacementResponse,
  StartPlacementResponse,
  SubmitResponse,
} from '@/features/onboarding_feature/models/PlacementTestTypes';

const mockStartData: StartPlacementResponse = {
  // Use a stable attempt ID so submission calls can be asserted exactly.
  attemptId: '11111111-2222-3333-4444-555555555555',
  // Model the first unanswered question returned when a learner starts testing.
  question: {
    // Identify the first item in the server's placement ladder.
    id: 'q1',
    // Label the skill category shown above the prompt.
    section: 'Grammar & Vocabulary',
    // Tell the learner what interaction is expected for this item.
    instructions: 'Choose the correct answer below.',
    // Select the radio-option renderer in the question screen.
    type: 'multiple-choice',
    // Provide a visible prompt used by intro-to-test transition assertions.
    prompt: 'I have lived here _____ 2019.',
    // Supply all four choices while keeping the answer key out of the client fixture.
    options: [
      // Offer the first distractor with its stable API option identifier.
      { id: 'a', text: 'for' },
      // Offer the correct choice with the identifier submitted by the learner.
      { id: 'b', text: 'since' },
      // Offer another distractor to verify the complete option list is rendered.
      { id: 'c', text: 'during' },
      // Offer the final distractor for the same question.
      { id: 'd', text: 'from' },
    ],
  },
  // Keep the fixture's small question count explicit for counter assertions.
  totalQuestions: 5,
};

// Model a successful answer response that advances from question one to question two.
const mockNextData: SubmitResponse = {
  // Mark the submitted answer correct so the screen should continue the test.
  correct: true,
  // Provide the next question that replaces the current question in the UI.
  nextQuestion: {
    // Identify the second item in the ladder.
    id: 'q2',
    // Keep the next item's skill category consistent with the first fixture.
    section: 'Grammar & Vocabulary',
    // Provide the learner-facing instruction for its radio controls.
    instructions: 'Choose the correct answer below.',
    // Render this item using multiple-choice radio buttons.
    type: 'multiple-choice',
    // Text used to confirm that the store and screen advanced correctly.
    prompt: 'She _____ to school every day.',
    // Return the available choices for the second question.
    options: [
      // Include a plausible incorrect verb form.
      { id: 'a', text: 'walk' },
      // Include the correctly inflected verb form.
      { id: 'b', text: 'walks' },
    ],
  },
  // Keep the attempt active because a next question was returned.
  isComplete: false,
};

// Model a completed test, such as one stopped after a wrong answer or quit action.
const mockCompletedData: SubmitResponse = {
  // The sample completion represents an incorrect answer ending the assessment.
  correct: false,
  // No new question is offered once the server marks the attempt complete.
  nextQuestion: null,
  // Drive the screen into its results phase.
  isComplete: true,
  // Provide the assigned result displayed by the result panel.
  result: {
    // Level 4 on the app's scale.
    levelNumber: 4,
    // Identify the assigned level shown in the badge.
    level: 'B1',
    // The server's plain title; the screen words its own.
    label: 'Level 4',
    // Provide representative skill rows for the competency breakdown.
    breakdown: [
      // Report the learner's grammar placement.
      { skill: 'Grammar', level: 'B1' },
      // Report the learner's vocabulary placement.
      { skill: 'Vocabulary', level: 'B1' },
    ],
  },
};

function makeRouter() {
  // Build a router that tracks route replacements in memory during component tests.
  return createRouter({
    // Avoid depending on the browser's address bar or history state.
    history: createMemoryHistory(),
    // Register the entry route needed by the memory-history router.
    routes: [
      // Provide a harmless root route for initial navigation readiness.
      { path: '/', component: { template: '<div />' } },
      // Mount the component under test at its learner-facing placement URL.
      { path: '/placement-test', name: 'placementTest', component: PlacementTestScreen },
      // Provide the route expected when an under-13 policy blocks access.
      { path: '/parent-linking', name: 'parentLinking', component: { template: '<div />' } },
      // Provide the route a learner without saved setup is sent to.
      { path: '/learner-setup', name: 'learnerSetup', component: { template: '<div />' } },
      // Provide the destination route used after skipping or completing placement.
      { path: '/explore', name: 'explore', component: { template: '<div />' } },
      // Provide the route signing out lands on.
      { path: '/sign-in', name: 'signIn', component: { template: '<div />' } },
    ],
  });
}

describe('PlacementTestScreen (Component)', () => {
  // Retain the router instance so each test can inspect the resulting route.
  let router: ReturnType<typeof makeRouter>;

  // Rebuild reactive state and API stubs before each independent component scenario.
  beforeEach(() => {
    // Prevent one test's Pinia state from affecting another test's screen.
    setActivePinia(createPinia());
    // Recreate route state so prior navigation does not leak between cases.
    router = makeRouter();
    // Remove spies installed by a previous test before defining default behavior.
    vi.restoreAllMocks();

    // Return the first question for normal test-start scenarios.
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse(mockStartData, null),
    );
    // Advance one question by default after an answer is submitted.
    vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(
      new $DataSourceResponse(mockNextData, null),
    );
    // Persist a Level 1 assignment when the learner skips the assessment.
    vi.spyOn(PlacementDataSource, 'skipPlacement').mockResolvedValue(
      new $DataSourceResponse({ userId: 42, levelNumber: 1 }, null),
    );
    // By default there is no unfinished attempt, so the intro shows.
    vi.spyOn(PlacementDataSource, 'getActiveAttempt').mockResolvedValue(
      new $DataSourceResponse({ attempt: null }, null),
    );
    vi.mocked(forgetPlacement).mockClear();
    i18n.global.locale.value = 'english';
  });

  async function mountScreen(options: { attachTo?: HTMLElement } = {}) {
    // Mount the placement page with its router and translation dependencies.
    const wrapper = mount(PlacementTestScreen, {
      // Attach to the document when a test checks where keyboard focus is.
      ...options,
      // Install the plugins the screen accesses through Vue composables.
      global: {
        // Provide in-memory route navigation and translated interface messages.
        plugins: [router, i18n],
      },
    });
    // Wait until Vue Router has finished resolving its initial location.
    await router.isReady();
    // Settle onMounted work and component updates before returning to each test.
    await flushPromises();
    // Give the test direct access to rendered content and controls.
    return wrapper;
  }

  it('explains it gets harder and stops at your level, shows the six levels and a skip option', async () => {
    // Render the screen in its default intro phase without starting a test.
    const wrapper = await mountScreen();

    expect(wrapper.text()).toContain('The questions get harder as you go, and the test stops once it has found your level.');
    expect(wrapper.text()).toContain('It stops when it finds your level');
    // Confirm all six levels are explained before a learner chooses to start.
    expect(wrapper.text()).toContain('6 levels');
    // The levels carry the app's own names (as on Explore and My learning).
    const rungs = wrapper.findAll('.placement__rung').map((rung) => rung.text());
    expect(rungs).toEqual(['Level 1A1', 'Level 2A1+', 'Level 3A2', 'Level 4B1', 'Level 5B2', 'Level 6C1']);
    expect(wrapper.text()).not.toMatch(/C2|Mastery|Beginner|Elementary|Adaptive|quiet, focused/);
    // Ensure the learner can bypass the diagnostic from this intro view.
    expect(wrapper.find('[data-testid="skip-placement"]').exists()).toBe(true);
    // Keep question content hidden until the learner explicitly starts the test.
    expect(wrapper.text()).not.toContain('I have lived here _____ 2019.');
  });

  it('saves the skip choice and routes to Explore with the Level 1 notice flag', async () => {
    // Render the untouched intro so the skip action is available.
    const wrapper = await mountScreen();

    // Skipping must persist the default level before leaving onboarding.
    // Activate the skip action, which calls the backend before navigating.
    await wrapper.find('[data-testid="skip-placement"]').trigger('click');
    // Wait for the API promise and Vue Router replacement to finish.
    await flushPromises();

    // Verify the application invoked the placement-owned level assignment path.
    expect(PlacementDataSource.skipPlacement).toHaveBeenCalledOnce();
    // Verify successful skipping enters the Explore route.
    expect(router.currentRoute.value.name).toBe('explore');
    // Verify Explore receives the marker used to show its Level 1 notice.
    expect(router.currentRoute.value.query.placementSkipped).toBe('true');
  });

  it('routes a learner to parent linking when Skip is denied by the access policy', async () => {
    vi.spyOn(PlacementDataSource, 'skipPlacement').mockResolvedValue(
      new $DataSourceResponse<SkipPlacementResponse>(
        null,
        new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'Parent link required',
          statusCode: 403,
        }),
      ),
    );
    const replaceSpy = vi.spyOn(router, 'replace');

    const wrapper = await mountScreen();
    await wrapper.find('[data-testid="skip-placement"]').trigger('click');
    await flushPromises();

    expect(replaceSpy).toHaveBeenCalledWith({
      name: 'parentLinking',
      query: { blocked: 'under13' },
    });
    expect(router.currentRoute.value.name).toBe('parentLinking');
  });

  it('keeps Next disabled until an answer is chosen, as on a test', async () => {
    // Start from the intro screen before testing question-level validation.
    const wrapper = await mountScreen();

    // Launch the first question to reach the interactive test phase.
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    // Wait for the mocked start response to render the first question.
    await flushPromises();

    // Verify the first prompt and its question counter (with no total promised) are visible.
    expect(wrapper.text()).toContain('I have lived here _____ 2019.');
    expect(wrapper.get('.placement__progress .ui-badge').text()).toBe('Question 1');

    const nextBtn = wrapper.get('[data-testid="next-question"]');
    expect(nextBtn.attributes('disabled')).toBeDefined();
    // Clicking a disabled Next does nothing at all.
    await nextBtn.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="answer-validation"]').exists()).toBe(false);
    expect(PlacementDataSource.submitAnswer).not.toHaveBeenCalled();

    await wrapper.findAll('.placement__option')[1].find('input[type="radio"]').trigger('change');
    expect(wrapper.get('[data-testid="next-question"]').attributes('disabled')).toBeUndefined();
  });

  it('a fill-in answer enables Next once typed; Enter on an empty box asks for an answer', async () => {
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse({
        ...mockStartData,
        question: { ...mockStartData.question, type: 'fill-blank', options: undefined },
      }, null),
    );
    const wrapper = await mountScreen();
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="next-question"]').attributes('disabled')).toBeDefined();
    await wrapper.get('#placement-fill').trigger('keydown', { key: 'Enter' });
    expect(wrapper.get('[data-testid="answer-validation"]').text()).toBe('Please enter your answer.');
    expect(PlacementDataSource.submitAnswer).not.toHaveBeenCalled();

    await wrapper.get('#placement-fill').setValue('since');
    expect(wrapper.find('[data-testid="answer-validation"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="next-question"]').attributes('disabled')).toBeUndefined();
  });

  it('limits fill-in answers to 20 characters, including pasted text', async () => {
    // Replace the start fixture with a fill-in item to render a text input.
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse({
        ...mockStartData,
        question: { ...mockStartData.question, type: 'fill-blank', options: undefined },
      }, null),
    );

    // Mount and start the diagnostic so the text input exists in the DOM.
    const wrapper = await mountScreen();
    // Request the first question through the visible start action.
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    // Wait for the question template to replace the introduction.
    await flushPromises();

    // Find the one free-text answer control in the rendered question.
    const answerInput = wrapper.get('#placement-fill');
    // Confirm the browser-level maxlength communicates the same restriction.
    expect(answerInput.attributes('maxlength')).toBe('20');
    // Simulate pasting a value longer than the allowed answer length.
    await answerInput.setValue('123456789012345678901234');

    // Verify the input handler truncates pasted content before it is stored/submitted.
    expect((answerInput.element as HTMLInputElement).value).toBe('12345678901234567890');
  });

  it('selects option, clears validation, and submits answer to advance question', async () => {
    // Mount the component before exercising the selection and progression flow.
    const wrapper = await mountScreen();

    // Start the assessment so the first question is rendered.
    // This follows the same explicit-consent path as a learner.
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    // Wait for the mocked first-question response to be applied.
    await flushPromises();

    // Locate the active Next button without confusing it with other primary actions.
    const nextBtn = wrapper.find('[data-testid="next-question"]');
    // Ensure the expected test-phase action exists before using it.
    if (!nextBtn.exists()) throw new Error('Expected next button on the question screen');

    // Nothing chosen yet, so Next cannot be pressed.
    expect(nextBtn.attributes('disabled')).toBeDefined();

    // Resolve the second radio option to use as the learner's answer.
    const optionB = wrapper.findAll('.placement__option')[1];
    // Select its input so the store receives option ID "b".
    await optionB.find('input[type="radio"]').trigger('change');
    // Allow the selection and validation-clearing updates to render.
    await flushPromises();

    // Ensure the selected option has its visual selected state.
    expect(optionB.classes()).toContain('placement__option--selected');

    // Submit the selected answer to advance to the next question.
    await nextBtn.trigger('click');
    // Wait for the mocked server grading response and UI update.
    await flushPromises();

    // Verify the correct attempt and answer identifiers were sent to the backend.
    expect(PlacementDataSource.submitAnswer).toHaveBeenCalledWith(
      '11111111-2222-3333-4444-555555555555',
      { questionId: 'q1', answer: 'b' },
    );

    // Confirm the response replaces the question prompt with the next item.
    expect(wrapper.text()).toContain('She _____ to school every day.');
    // Confirm the counter advances along with the question content.
    expect(wrapper.get('.placement__progress .ui-badge').text()).toBe('Question 2');
  });

  it('quits at the active question level and displays the placement result panel', async () => {
    // Start from a Level 2 question to prove Quit uses the active tier.
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse({
        ...mockStartData,
        question: { ...mockStartData.question, level_number: 2 },
      }, null),
    );
    // Return the server-shaped completion result after the Quit action.
    vi.spyOn(PlacementDataSource, 'quitPlacement').mockResolvedValue(
      new $DataSourceResponse(mockCompletedData, null),
    );

    // Mount the page and enter the diagnostic question phase.
    const wrapper = await mountScreen();
    // Start through the UI so the current attempt and its ID are initialized.
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    // Wait for the level-two question fixture to render.
    await flushPromises();

    // Show that the current level is surfaced next to the controls, in the app's own words.
    expect(wrapper.get('[data-testid="active-placement-level"]').text()).toContain('Level 2 · A1+');
    // Quit asks first, and does nothing until the learner confirms.
    await wrapper.get('[data-testid="quit-placement-test"]').trigger('click');
    await flushPromises();
    expect(PlacementDataSource.quitPlacement).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="quit-confirm"]').text()).toContain(
      'If you stop now, you start at the level you have reached so far: Level 2 · A1+. You cannot take the placement test again.',
    );
    await wrapper.get('[data-testid="quit-confirm-yes"]').trigger('click');
    // Wait for the quit response to switch the screen into results.
    await flushPromises();

    // Confirm the active attempt identifier was sent to the quit API.
    expect(PlacementDataSource.quitPlacement).toHaveBeenCalledWith(
      '11111111-2222-3333-4444-555555555555',
    );
    // Ensure quitting never sends an answer for the unanswered question.
    expect(PlacementDataSource.submitAnswer).not.toHaveBeenCalled();
    // Ensure the normal placement result panel is reused after quitting.
    expect(wrapper.find('[data-testid="placement-results"]').exists()).toBe(true);
    // Ensure the panel uses the standard placement-result heading.
    expect(wrapper.find('[data-testid="result-eyebrow"]').text()).toBe('Your placement result');
    // Quitting is not "finishing": the heading says the level was found.
    expect(wrapper.get('#placement-result-heading').text()).toBe('We found your starting level');
    expect(wrapper.text()).not.toContain('Well done for finishing');
    // Ensure the result badge reflects the server-assigned level.
    expect(wrapper.find('.placement__level-badge').text()).toBe('B1');
  });

  it('renders results panel when test completes, displaying CEFR level and breakdown', async () => {
    // Make the answer response complete immediately to isolate result rendering.
    vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(
      new $DataSourceResponse(mockCompletedData, null),
    );

    // Mount the intro before starting the test.
    const wrapper = await mountScreen();

    // Use the real test flow to complete the assessment and show the results panel.
    // Start the attempt and wait until question one is available.
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    await flushPromises();

    // Select the first option so the test can send a non-empty response.
    const optionA = wrapper.findAll('.placement__option')[0];
    // Change the radio input to set the learner's answer in the store.
    await optionA.find('input[type="radio"]').trigger('change');
    // Submit the answer using the visible primary test action.
    await wrapper.find('[data-testid="next-question"]').trigger('click');
    // Wait for the completed response to render its result panel.
    await flushPromises();

    // Results card should now be rendered
    // Confirm the completed assessment selects the results view.
    expect(wrapper.find('[data-testid="placement-results"]').exists()).toBe(true);
    // Confirm the assigned level code is displayed prominently.
    expect(wrapper.find('.placement__level-badge').text()).toBe('B1');
    // A first wrong answer still finds a level: the heading says so.
    expect(wrapper.find('#placement-result-heading').text()).toBe('We found your starting level');
    // The level is named as everywhere else in the app.
    expect(wrapper.get('[data-testid="result-level"]').text()).toBe('Level 4 · B1');
    expect(wrapper.text()).toContain('Your lessons start at this level.');
    expect(wrapper.text()).not.toContain('You completed the placement test.');
    // Confirm both competency rows are rendered from the returned breakdown.
    expect(wrapper.findAll('.placement__breakdown-row').length).toBe(2);
  });

  it('redirects to parent linking screen when receiving HTTP 403 under-13 refusal', async () => {
    // Spy on route replacement to inspect the blocked learner's destination.
    const pushSpy = vi.spyOn(router, 'replace');

    // Simulate the backend age/access policy refusing to start a placement attempt.
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse<StartPlacementResponse>(
        null,
        new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'Parent link required',
          statusCode: 403,
        }),
      ),
    );

    // Mount the screen and attempt to start so its 403 handler runs.
    const wrapper = await mountScreen();
    // Trigger the start request through the learner-facing control.
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    // Wait for the rejected start response and navigation.
    await flushPromises();

    // Require blocked learners to arrive at the parent-linking route with context.
    expect(pushSpy).toHaveBeenCalledWith({
      name: 'parentLinking',
      query: { blocked: 'under13' },
    });
  });

  it('navigates to explore when clicking Continue to Explore from results panel', async () => {
    // Make the next answer complete the assessment so Continue appears.
    vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(
      new $DataSourceResponse(mockCompletedData, null),
    );

    // Capture route replacement so the final destination can be asserted.
    const pushSpy = vi.spyOn(router, 'replace');
    // Render the placement screen in its initial state.
    const wrapper = await mountScreen();

    // Start an attempt before supplying the completion answer.
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    // Wait for the first question to render.
    await flushPromises();

    // Select an option so the answer submission passes client-side validation.
    await wrapper.findAll('.placement__option')[0].find('input[type="radio"]').trigger('change');
    // Submit the selected choice to obtain the mocked completed response.
    await wrapper.find('[data-testid="next-question"]').trigger('click');
    // Wait for the results panel and its navigation control to appear.
    await flushPromises();

    // Click continue button
    // Resolve the primary action inside the results panel specifically.
    const continueBtn = wrapper.find('[data-testid="continue-to-explore"]');
    // Continue from placement results into the learner content catalogue.
    await continueBtn.trigger('click');
    // Wait for Vue Router to process the replacement.
    await flushPromises();

    // Confirm the results action routes to Explore without an extra query flag.
    expect(pushSpy).toHaveBeenCalledWith({ name: 'explore' });
  });

  it('sends a learner without saved setup to learner setup, not parent linking', async () => {
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse<StartPlacementResponse>(
        null,
        new Exception({
          exceptionType: ExceptionType.FORBIDDEN,
          message: 'learner setup must be completed before accessing content',
          statusCode: 403,
        }),
      ),
    );
    const replaceSpy = vi.spyOn(router, 'replace');

    const wrapper = await mountScreen();
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    await flushPromises();

    expect(replaceSpy).toHaveBeenCalledWith({ name: 'learnerSetup' });
  });

  it('shows options in the order served and submits the option id, not its position', async () => {
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse({
        ...mockStartData,
        question: { ...mockStartData.question, options: [
          { id: 'c', text: 'during' }, { id: 'a', text: 'for' }, { id: 'd', text: 'from' }, { id: 'b', text: 'since' },
        ] },
      }, null),
    );

    const wrapper = await mountScreen();
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    await flushPromises();
    const options = wrapper.findAll('.placement__option');
    // The first option on screen is lettered A even though its id is 'c'.
    expect(options[0].text()).toContain('A');
    expect(options[0].text()).toContain('during');
    await options[3].find('input[type="radio"]').trigger('change');
    await wrapper.find('[data-testid="next-question"]').trigger('click');
    await flushPromises();

    expect(PlacementDataSource.submitAnswer).toHaveBeenCalledWith(mockStartData.attemptId, { questionId: 'q1', answer: 'b' });
  });

  it('offers to start again when the attempt can no longer continue', async () => {
    vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(
      new $DataSourceResponse<SubmitResponse>(null, new Exception({
        exceptionType: ExceptionType.CONFLICT,
        message: 'placement attempt changed; reload the current question',
        statusCode: 409,
      })),
    );

    const wrapper = await mountScreen();
    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.placement__option')[0].find('input[type="radio"]').trigger('change');
    await wrapper.find('[data-testid="next-question"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('This test session has ended or changed.');
    const restart = wrapper.findAll('button').find((b) => b.text() === 'Start again');
    expect(restart).toBeDefined();
    await restart!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="start-placement"]').exists()).toBe(true);
  });

  it('never uses emoji on the intro screen', async () => {
    const wrapper = await mountScreen();
    expect(/\p{Extended_Pictographic}/u.test(wrapper.text())).toBe(false);
  });

  it('isiZulu: the intro, the question and the result are worded in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(
      new $DataSourceResponse(mockCompletedData, null),
    );
    const wrapper = await mountScreen();

    expect(wrapper.text()).toContain('Thola izinga ozoqala kulo');
    expect(wrapper.text()).toContain('Kuyama uma sekutholile izinga lakho');
    expect(wrapper.text()).toContain('Amazinga angu-6');
    expect(wrapper.findAll('.placement__rung')[5].text()).toBe('Izinga 6C1');
    expect(wrapper.text()).not.toMatch(/Ubungcweti|Isiqalo|C2|engu-30|Imizuzu/);
    expect(wrapper.text()).not.toContain('How the test works');
    expect(wrapper.get('[data-testid="placement-sign-out"]').text()).toBe('Phuma');

    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.placement__progress .ui-badge').text()).toBe('Umbuzo 1');
    // The English ladder's section heading is interface wording.
    expect(wrapper.find('.placement__question .ui-eyebrow').text()).toBe('Uhlelo Lolimi Nesilulumagama');

    await wrapper.get('[data-testid="quit-placement-test"]').trigger('click');
    expect(wrapper.get('#placement-quit-title').text()).toBe('Ufuna ukuyeka ukuhlolwa kwezinga?');
    expect(wrapper.get('[data-testid="quit-confirm"]').text()).toContain('Izinga 1 · A1');
    await wrapper.get('[data-testid="quit-confirm-no"]').trigger('click');

    await wrapper.findAll('.placement__option')[0].find('input[type="radio"]').trigger('change');
    await wrapper.find('[data-testid="next-question"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('#placement-result-heading').text()).toBe('Silitholile izinga ozoqala kulo');
    expect(wrapper.get('[data-testid="result-level"]').text()).toBe('Izinga 4 · B1');
    expect(wrapper.find('.placement__breakdown').text()).toContain('Uhlelo lolimi');
    expect(wrapper.find('.placement__breakdown').text()).toContain('Isilulumagama');
    expect(wrapper.text()).not.toContain('Vocabulary');
  });

  it('isiZulu: a server error starting the test is shown in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(PlacementDataSource, 'startPlacement').mockResolvedValue(
      new $DataSourceResponse<StartPlacementResponse>(null, new Exception({
        exceptionType: ExceptionType.INTERNAL_SERVER_ERROR, message: 'Could not create placement attempt', statusCode: 500 })),
    );
    const wrapper = await mountScreen();

    await wrapper.find('[data-testid="start-placement"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Asikwazanga ukuqala ukuhlolwa kwezinga.');
  });

  it('Quit asks first: Keep going (or Escape) closes the dialog and the test carries on', async () => {
    vi.spyOn(PlacementDataSource, 'quitPlacement').mockResolvedValue(new $DataSourceResponse(mockCompletedData, null));
    const wrapper = await mountScreen({ attachTo: document.body });
    await wrapper.get('[data-testid="start-placement"]').trigger('click');
    await flushPromises();

    await wrapper.get('[data-testid="quit-placement-test"]').trigger('click');
    await flushPromises();
    const dialog = wrapper.get('[data-testid="quit-confirm"]');
    // An accessible dialog: named by its title, described by its explanation.
    expect(dialog.attributes('role')).toBe('alertdialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-labelledby')).toBe('placement-quit-title');
    expect(dialog.attributes('aria-describedby')).toBe('placement-quit-body');
    // Focus starts on the safe choice.
    expect(document.activeElement).toBe(wrapper.get('[data-testid="quit-confirm-no"]').element);

    await wrapper.get('[data-testid="quit-confirm-no"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="quit-confirm"]').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('[data-testid="quit-placement-test"]').element);

    await wrapper.get('[data-testid="quit-placement-test"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="quit-confirm"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(wrapper.find('[data-testid="quit-confirm"]').exists()).toBe(false);

    expect(PlacementDataSource.quitPlacement).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('I have lived here _____ 2019.');
    wrapper.unmount();
  });

  it('a child is told simply what quitting means', async () => {
    themeStore().audience = 'child';
    const wrapper = await mountScreen();
    await wrapper.get('[data-testid="start-placement"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="quit-placement-test"]').trigger('click');

    expect(wrapper.get('#placement-quit-body').text()).toBe('If you stop now, you start at Level 1 · A1. You can only do this test once.');
  });

  it('offers Sign out on the intro, the test and the result, and signs out like the header', async () => {
    vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(new $DataSourceResponse(mockCompletedData, null));
    const auth = authStore();
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
    const wrapper = await mountScreen();

    // Intro.
    expect(wrapper.get('[data-testid="placement-sign-out"]').text()).toBe('Sign out');
    // Test.
    await wrapper.get('[data-testid="start-placement"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="placement-sign-out"]').exists()).toBe(true);
    // Result.
    await wrapper.findAll('.placement__option')[0].find('input[type="radio"]').trigger('change');
    await wrapper.get('[data-testid="next-question"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="placement-results"]').exists()).toBe(true);

    await wrapper.get('[data-testid="placement-sign-out"]').trigger('click');
    await flushPromises();

    expect(logout).toHaveBeenCalledOnce();
    expect(forgetPlacement).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.name).toBe('signIn');
  });

  it('after a reload, carries on at the unfinished question instead of showing the intro', async () => {
    vi.spyOn(PlacementDataSource, 'getActiveAttempt').mockResolvedValue(new $DataSourceResponse({
      attempt: {
        ...mockStartData,
        question: { ...mockStartData.question, id: 'q7', prompt: 'An airplane is usually much _____ than a bicycle.', level_number: 2 },
        totalQuestions: 30,
        questionNumber: 7,
        resumed: true,
      },
    }, null));

    const wrapper = await mountScreen();

    expect(wrapper.find('[data-testid="start-placement"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('An airplane is usually much _____ than a bicycle.');
    expect(wrapper.get('.placement__progress .ui-badge').text()).toBe('Question 7');
    expect(wrapper.get('[data-testid="placement-resumed"]').text()).toBe('Welcome back. You are carrying on from where you stopped.');
    expect(PlacementDataSource.startPlacement).not.toHaveBeenCalled();

    await wrapper.findAll('.placement__option')[1].find('input[type="radio"]').trigger('change');
    await wrapper.get('[data-testid="next-question"]').trigger('click');
    await flushPromises();
    expect(PlacementDataSource.submitAnswer).toHaveBeenCalledWith(mockStartData.attemptId, { questionId: 'q7', answer: 'b' });
    expect(wrapper.find('[data-testid="placement-resumed"]').exists()).toBe(false);
  });

  it('a child without a guardian link who opens the page is sent to parent linking, not shown the intro', async () => {
    vi.spyOn(PlacementDataSource, 'getActiveAttempt').mockResolvedValue(new $DataSourceResponse<never>(null, new Exception({
      exceptionType: ExceptionType.FORBIDDEN,
      message: 'an active parent link is required before accessing content',
      statusCode: 403,
    })));
    const replaceSpy = vi.spyOn(router, 'replace');

    const wrapper = await mountScreen();

    expect(replaceSpy).toHaveBeenCalledWith({ name: 'parentLinking', query: { blocked: 'under13' } });
    expect(wrapper.find('[data-testid="start-placement"]').exists()).toBe(false);
  });

  it('a failed check for an unfinished attempt still shows the intro, with no error', async () => {
    vi.spyOn(PlacementDataSource, 'getActiveAttempt').mockResolvedValue(new $DataSourceResponse<never>(null, new Exception({
      exceptionType: ExceptionType.FAILED, message: 'Network error', statusCode: 0,
    })));

    const wrapper = await mountScreen();

    expect(wrapper.find('[data-testid="start-placement"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('the child intro and result are friendly and simple', async () => {
    themeStore().audience = 'child';
    vi.spyOn(PlacementDataSource, 'submitAnswer').mockResolvedValue(new $DataSourceResponse(mockCompletedData, null));
    const wrapper = await mountScreen();

    expect(wrapper.text()).toContain("Let's find your level!");
    expect(wrapper.text()).toContain('When one is too tricky, we stop: that is your level!');
    expect(wrapper.text()).toContain('We stop at your level');

    await wrapper.get('[data-testid="start-placement"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.placement__option')[0].find('input[type="radio"]').trigger('change');
    await wrapper.get('[data-testid="next-question"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('#placement-result-heading').text()).toBe('We found your level!');
    expect(wrapper.text()).not.toContain('Well done for finishing');
  });

  it('promises no number of questions and no duration, in either language or either version', () => {
    for (const language of ['english', 'zulu'] as const) {
      const words = JSON.stringify(onboardingLocale[language].placement);
      expect(words).not.toMatch(/30|minute|imizuzu|every 5 questions|ngemibuzo engu-5/i);
    }
  });
});
