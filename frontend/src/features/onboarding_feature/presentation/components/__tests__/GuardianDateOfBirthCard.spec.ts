import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';
import type { ChildDateOfBirth } from '@/features/onboarding_feature/models/OnboardingTypes';
import { i18n } from '@/i18n';
import GuardianDateOfBirthCard from '../GuardianDateOfBirthCard.vue';

function forbidden() {
  return new Exception({ exceptionType: ExceptionType.FORBIDDEN, message: 'this child is not linked to your account', statusCode: 403 });
}

describe('GuardianDateOfBirthCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(OnboardingDataSource, 'getChildDateOfBirth').mockResolvedValue(
      new $DataSourceResponse<ChildDateOfBirth>({ childId: 7, dateOfBirth: '2016-03-04' }, null));
    vi.spyOn(OnboardingDataSource, 'setChildDateOfBirth').mockResolvedValue(
      new $DataSourceResponse<ChildDateOfBirth>({ childId: 7, dateOfBirth: '2015-01-02' }, null));
  });

  it('nominal: loads nothing until opened, then saves the corrected date for this child', async () => {
    const wrapper = mount(GuardianDateOfBirthCard, { props: { childId: 7 } });
    expect(OnboardingDataSource.getChildDateOfBirth).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="dob-open"]').trigger('click');
    await flushPromises();
    expect(OnboardingDataSource.getChildDateOfBirth).toHaveBeenCalledWith(7);
    const input = wrapper.get('input[type="date"]');
    expect((input.element as HTMLInputElement).value).toBe('2016-03-04');

    await input.setValue('2015-01-02');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(OnboardingDataSource.setChildDateOfBirth).toHaveBeenCalledWith(7, '2015-01-02');
    // Two sentences with a space between them, and the date in the app's one long form.
    expect(wrapper.get('[data-testid="dob-saved"]').text()).toBe('Date of birth updated. Now 2 January 2015.');
  });

  it('boundary: a child who has not finished setup has nothing to correct', async () => {
    vi.spyOn(OnboardingDataSource, 'getChildDateOfBirth').mockResolvedValue(
      new $DataSourceResponse<ChildDateOfBirth>({ childId: 7, dateOfBirth: null }, null));
    const wrapper = mount(GuardianDateOfBirthCard, { props: { childId: 7 } });

    await wrapper.get('[data-testid="dob-open"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="dob-no-setup"]').exists()).toBe(true);
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('invalid: a refused save shows why and keeps the form', async () => {
    vi.spyOn(OnboardingDataSource, 'setChildDateOfBirth').mockResolvedValue(
      new $DataSourceResponse<ChildDateOfBirth>(null, forbidden()));
    const wrapper = mount(GuardianDateOfBirthCard, { props: { childId: 7 } });
    await wrapper.get('[data-testid="dob-open"]').trigger('click');
    await flushPromises();

    await wrapper.get('input[type="date"]').setValue('2015-01-02');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('not linked to your account');
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('invalid: a load failure offers a retry, and a bad child id renders nothing', async () => {
    vi.spyOn(OnboardingDataSource, 'getChildDateOfBirth').mockResolvedValue(
      new $DataSourceResponse<ChildDateOfBirth>(null, forbidden()));
    const wrapper = mount(GuardianDateOfBirthCard, { props: { childId: 7 } });
    await wrapper.get('[data-testid="dob-open"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('button').some((b) => b.text() === 'Try again')).toBe(true);

    const none = mount(GuardianDateOfBirthCard, { props: { childId: Number.NaN } });
    expect(none.find('[data-testid="guardian-dob-card"]').exists()).toBe(false);
  });

  it('isiZulu: the card, its form and its errors are in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(OnboardingDataSource, 'setChildDateOfBirth').mockResolvedValue(
      new $DataSourceResponse<ChildDateOfBirth>(null, new Exception({
        exceptionType: ExceptionType.FAILED, message: 'failed request', statusCode: 500 })));
    const wrapper = mount(GuardianDateOfBirthCard, { props: { childId: 7 } });

    expect(wrapper.text()).toContain('Usuku lokuzalwa');
    expect(wrapper.get('[data-testid="dob-open"]').text()).toBe('Lungisa usuku lokuzalwa');
    expect(wrapper.text()).not.toContain('Correct date of birth');

    await wrapper.get('[data-testid="dob-open"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Olulondoloziwe:');
    expect(wrapper.text()).toContain('Khansela');

    await wrapper.get('input[type="date"]').setValue('2015-01-02');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    // The server's own message is shown in isiZulu.
    expect(wrapper.get('[role="alert"]').text()).toBe('Isicelo asiphumelelanga. Sicela uzame futhi.');
  });
});
