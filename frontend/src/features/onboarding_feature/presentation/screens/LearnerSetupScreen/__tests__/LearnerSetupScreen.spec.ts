import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/i18n';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';
import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource';
import type { LearnerAccess, OnboardingSettings } from '@/features/onboarding_feature/models/OnboardingTypes';
import type { LearnerLevelResponse } from '@/features/onboarding_feature/models/PlacementTestTypes';
import LearnerSetupScreen from '../LearnerSetupScreen.vue';
import { toastStore } from '@/features/shared/state/toastStore';

const adultAccess: LearnerAccess = {
  isUnder13: false, hasActiveParentLink: false, canAccessContent: true, contentAudience: 'general',
};

const saved: OnboardingSettings = {
  user_id: 4,
  target_language: 'zulu',
  date_of_birth: '2001-02-03',
  interface_language: 'english',
  daily_goal: 15,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  access: adultAccess,
};

// A date of birth that makes a learner 8 years old today.
function childDateOfBirth(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 8);
  return date.toISOString().slice(0, 10);
}

const notFound = new Exception({ exceptionType: ExceptionType.NOT_FOUND, message: 'onboarding settings not found', statusCode: 404 });

function makeRouter() {
  const blank = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: blank },
      { path: '/learner-setup', name: 'learnerSetup', component: LearnerSetupScreen },
      { path: '/placement-test', name: 'placementTest', component: blank },
      { path: '/explore', name: 'explore', component: blank },
      { path: '/parent-linking', name: 'parentLinking', component: blank },
    ],
  });
}

async function mountScreen(router: ReturnType<typeof makeRouter>, path = '/learner-setup') {
  await router.push(path);
  const wrapper = mount(LearnerSetupScreen, { global: { plugins: [router, i18n] }, attachTo: document.body });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

describe('LearnerSetupScreen', () => {
  let router: ReturnType<typeof makeRouter>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    router = makeRouter();
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(adultAccess, null));
    vi.spyOn(OnboardingDataSource, 'saveSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    vi.spyOn(PlacementDataSource, 'getLearnerLevel').mockResolvedValue(
      new $DataSourceResponse<LearnerLevelResponse>({ userId: 4, levelNumber: 1, placed: false }, null));
  });

  it('nominal: a new learner fills in setup and goes on to the placement test', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null, notFound));
    const wrapper = await mountScreen(router);

    // Only English and isiZulu are offered.
    const languages = wrapper.findAll('input[name="targetLang"]').map((input) => (input.element as HTMLInputElement).value);
    expect(languages).toEqual(['english', 'zulu']);
    expect(wrapper.text()).toContain('isiZulu');
    // The journey shows step 1 of 2.
    expect(wrapper.text()).toContain('Step 1 of 2');

    await wrapper.find('input[value="zulu"][name="targetLang"]').setValue(true);
    await wrapper.get('#dateOfBirth').setValue('2001-02-03');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(OnboardingDataSource.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguage: 'zulu', dateOfBirth: '2001-02-03',
    }));
    expect(router.currentRoute.value.name).toBe('placementTest');
  });

  it('nominal: a returning learner with a linked guardian sees the date of birth read-only and goes to Explore after saving', async () => {
    const linked: LearnerAccess = { ...adultAccess, hasActiveParentLink: true };
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse({ ...saved, access: linked }, null));
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(linked, null));
    const wrapper = await mountScreen(router);

    const dob = wrapper.get('[data-testid="dob-locked"]');
    expect(dob.attributes('readonly')).toBeDefined();
    expect((dob.element as HTMLInputElement).value).toBe('2001-02-03');
    expect(wrapper.text()).toContain('Only a linked guardian can change your date of birth.');
    // Linked as a child and now 13 or older: the link can be seen, read only, from here.
    const guardianLink = wrapper.findAll('a').find((a) => a.text() === 'See your guardian link');
    expect(guardianLink?.attributes('href')).toBe('/parent-linking');

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('explore');
    expect(PlacementDataSource.getLearnerLevel).not.toHaveBeenCalled();
  });

  it('nominal: a returning learner with no linked guardian can still edit their date of birth', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    const wrapper = await mountScreen(router);

    expect(wrapper.find('[data-testid="dob-locked"]').exists()).toBe(false);
    expect((wrapper.get('#dateOfBirth').element as HTMLInputElement).readOnly).toBe(false);
    expect(wrapper.text()).toContain('Once a guardian is linked to your account, only they can change it.');
    // An adult with no guardian is offered no way into guardian linking.
    expect(wrapper.text()).not.toContain('See your guardian link');
  });

  it('boundary: a linked child gets no settings link to the family page (their header has My grown-up)', async () => {
    const child: LearnerAccess = { isUnder13: true, hasActiveParentLink: true, canAccessContent: true, contentAudience: 'child' };
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse({ ...saved, date_of_birth: '2017-08-20', access: child }, null));
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(child, null));
    const wrapper = await mountScreen(router);

    expect(wrapper.find('[data-testid="dob-locked"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('See your guardian link');
  });

  it('invalid: a refused date-of-birth change explains who can change it', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    vi.spyOn(OnboardingDataSource, 'saveSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null,
      new Exception({ exceptionType: ExceptionType.FORBIDDEN, message: 'only a linked guardian can change your date of birth', statusCode: 403 })));
    const wrapper = await mountScreen(router);

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Ask them to correct it from their account.');
    expect(router.currentRoute.value.name).not.toBe('explore');
  });

  it('invalid: a failed load shows an error with a retry instead of the form', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null,
      new Exception({ exceptionType: ExceptionType.FAILED, message: 'Network error', statusCode: 0 })));
    const wrapper = await mountScreen(router);

    expect(wrapper.find('[data-testid="setup-load-error"]').exists()).toBe(true);
    expect(wrapper.find('form').exists()).toBe(false);

    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    await wrapper.get('[data-testid="setup-load-error"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('isiZulu: a new learner reads the whole form in isiZulu; choosing English to learn turns it English', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null, notFound));
    vi.spyOn(OnboardingDataSource, 'saveSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...saved, target_language: 'english', interface_language: 'english' }, null));
    const wrapper = await mountScreen(router);

    expect(wrapper.text()).toContain('Ulimi ofuna ukulufunda');
    expect(wrapper.text()).toContain('Umgomo wansuku zonke');
    expect(wrapper.get('.setup__steps').attributes('aria-label')).toBe('Izinyathelo zokulungiselela');
    expect(wrapper.text()).not.toContain('Language to learn');

    // A learner of English reads the app in English, and is not offered a choice.
    await wrapper.find('input[value="english"][name="targetLang"]').setValue(true);
    await flushPromises();
    expect(i18n.global.locale.value).toBe('english');
    expect(wrapper.find('input[name="uiLang"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="setup-english-interface"]').text())
      .toBe('While you learn English, menus and buttons are in English too.');

    await wrapper.get('#dateOfBirth').setValue('2001-02-03');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(OnboardingDataSource.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguage: 'english', interfaceLanguage: 'english',
    }));
    expect(i18n.global.locale.value).toBe('english');
  });

  it('isiZulu: a new learner of isiZulu keeps the isiZulu they signed up in, and gets it back after trying English', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null, notFound));
    vi.spyOn(OnboardingDataSource, 'saveSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...saved, interface_language: 'zulu' }, null));
    const wrapper = await mountScreen(router);
    const uiChoice = (value: string) => wrapper.get(`input[name="uiLang"][value="${value}"]`).element as HTMLInputElement;

    await wrapper.find('input[value="zulu"][name="targetLang"]').setValue(true);
    await flushPromises();
    expect(uiChoice('zulu').checked).toBe(true);
    expect(wrapper.find('[data-testid="setup-english-interface"]').exists()).toBe(false);

    await wrapper.find('input[value="english"][name="targetLang"]').setValue(true);
    await flushPromises();
    expect(i18n.global.locale.value).toBe('english');

    await wrapper.find('input[value="zulu"][name="targetLang"]').setValue(true);
    await flushPromises();
    expect(uiChoice('zulu').checked).toBe(true);
    expect(i18n.global.locale.value).toBe('zulu');

    await wrapper.get('#dateOfBirth').setValue('2001-02-03');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(OnboardingDataSource.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguage: 'zulu', interfaceLanguage: 'zulu',
    }));
  });

  it('a learner of English is offered no interface choice; switching to isiZulu offers it, starting on English', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...saved, target_language: 'english', interface_language: 'zulu' }, null));
    const wrapper = await mountScreen(router);

    // An older row's isiZulu is ignored: the learner of English reads English.
    expect(i18n.global.locale.value).toBe('english');
    expect(wrapper.find('input[name="uiLang"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="setup-english-interface"]').exists()).toBe(true);

    await wrapper.find('input[value="zulu"][name="targetLang"]').setValue(true);
    await flushPromises();
    const uiEnglish = wrapper.get('input[name="uiLang"][value="english"]').element as HTMLInputElement;
    expect(uiEnglish.checked).toBe(true);

    // Trying isiZulu menus, then leaving without saving, goes back to the saved English.
    await wrapper.get('input[name="uiLang"][value="zulu"]').setValue(true);
    await flushPromises();
    expect(i18n.global.locale.value).toBe('zulu');
    wrapper.unmount();
    expect(i18n.global.locale.value).toBe('english');
  });

  it('a learner switching from isiZulu to English in settings is switched to English on save', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...saved, interface_language: 'zulu' }, null));
    vi.spyOn(OnboardingDataSource, 'saveSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...saved, target_language: 'english', interface_language: 'english' }, null));
    const wrapper = await mountScreen(router);
    expect(i18n.global.locale.value).toBe('zulu');

    await wrapper.find('input[value="english"][name="targetLang"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(OnboardingDataSource.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetLanguage: 'english', interfaceLanguage: 'english',
    }));
    expect(router.currentRoute.value.name).toBe('explore');
    expect(i18n.global.locale.value).toBe('english');
  });

  it('isiZulu: a learner of isiZulu reading isiZulu sees server errors in isiZulu', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      { ...saved, interface_language: 'zulu' }, null));
    vi.spyOn(OnboardingDataSource, 'saveSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null,
      new Exception({ exceptionType: ExceptionType.FAILED, message: 'failed request', statusCode: 500 })));
    const wrapper = await mountScreen(router);

    expect(i18n.global.locale.value).toBe('zulu');
    const uiZulu = wrapper.get('input[name="uiLang"][value="zulu"]').element as HTMLInputElement;
    expect(uiZulu.checked).toBe(true);
    expect(wrapper.text()).toContain('Londoloza izinguquko');

    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Isicelo asiphumelelanga. Sicela uzame futhi.');
  });

  it('a new child sees three steps: plan, a grown-up, then placement', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null, notFound));
    const wrapper = await mountScreen(router);
    await wrapper.get('#dateOfBirth').setValue(childDateOfBirth());

    expect(wrapper.text()).toContain('Step 1 of 3');
    const steps = wrapper.get('[data-testid="setup-steps"]').text();
    expect(steps).toContain('Your plan');
    expect(steps).toContain('Link a grown-up');
    expect(steps).toContain('Placement test');
    wrapper.unmount();
  });

  it('an adult whose new date makes them under 13 is asked first, and can go back and fix it', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    const wrapper = await mountScreen(router);
    await wrapper.get('#dateOfBirth').setValue(childDateOfBirth());
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    const dialog = wrapper.get('[data-testid="child-confirm"]');
    expect(dialog.attributes('role')).toBe('alertdialog');
    expect(dialog.text()).toContain('a grown-up will need to link to your account');
    expect(OnboardingDataSource.saveSettings).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(wrapper.get('[data-testid="child-confirm-ok"]').element);

    await wrapper.get('[data-testid="child-confirm-cancel"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="child-confirm"]').exists()).toBe(false);
    expect(OnboardingDataSource.saveSettings).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('learnerSetup');
    wrapper.unmount();
  });

  it('Escape closes the date-of-birth question without saving', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    const wrapper = await mountScreen(router);
    await wrapper.get('#dateOfBirth').setValue(childDateOfBirth());
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-testid="child-confirm"]').exists()).toBe(false);
    expect(OnboardingDataSource.saveSettings).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('confirming saves, then goes on to link a grown-up', async () => {
    const blocked: LearnerAccess = { isUnder13: true, hasActiveParentLink: false, canAccessContent: false, contentAudience: 'child' };
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    vi.spyOn(OnboardingDataSource, 'saveSettings').mockResolvedValue(new $DataSourceResponse({ ...saved, access: blocked }, null));
    const wrapper = await mountScreen(router);
    await wrapper.get('#dateOfBirth').setValue(childDateOfBirth());
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await wrapper.get('[data-testid="child-confirm-ok"]').trigger('click');
    await flushPromises();

    expect(OnboardingDataSource.saveSettings).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('parentLinking');
    wrapper.unmount();
  });

  it('boundary: a child already known to be under 13 is not asked again', async () => {
    const child: LearnerAccess = { isUnder13: true, hasActiveParentLink: false, canAccessContent: false, contentAudience: 'child' };
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse({ ...saved, date_of_birth: childDateOfBirth(), access: child }, null));
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(child, null));
    const wrapper = await mountScreen(router);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="child-confirm"]').exists()).toBe(false);
    expect(OnboardingDataSource.saveSettings).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('an under-13 learner with no grown-up linked stays on settings and can still correct their date of birth', async () => {
    const blocked: LearnerAccess = { isUnder13: true, hasActiveParentLink: false, canAccessContent: false, contentAudience: 'child' };
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse({ ...saved, date_of_birth: '2018-04-01', access: blocked }, null));
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(blocked, null));
    const wrapper = await mountScreen(router);

    expect(router.currentRoute.value.name).toBe('learnerSetup');
    expect((wrapper.get('#dateOfBirth').element as HTMLInputElement).readOnly).toBe(false);
    const waiting = wrapper.get('[data-testid="setup-waiting-for-grown-up"]');
    expect(waiting.get('a').attributes('href')).toBe('/parent-linking?blocked=under13');
    wrapper.unmount();
  });

  it('says why a learner was sent here from a learning page, in both languages', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(null, notFound));
    const wrapper = await mountScreen(router, '/learner-setup?from=explore');
    expect(wrapper.get('[data-testid="setup-from-hint"]').text()).toContain('Finish setting up first');

    i18n.global.locale.value = 'zulu';
    await flushPromises();
    expect(wrapper.get('[data-testid="setup-from-hint"]').text()).toContain('Qedela ukusetha kuqala');
    wrapper.unmount();
  });

  it('a later save says "Settings saved" once the screen has moved on', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(saved, null));
    const wrapper = await mountScreen(router);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('explore');
    expect(toastStore().messageKey).toBe('setup.savedToast');
    toastStore().dismiss();
    wrapper.unmount();
  });
});
