// Bug #9: names and emails at their longest (50 + 50 characters with no spaces, a
// 60 character email) fit the administrator's dialogs and the users table. The
// account's name sits in the dialog header on one line, cut short by the stylesheet
// with its whole text as a tooltip, and the details that follow it are kept whole.
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
import { ACCOUNT_LIMITS } from '@/core/limits';
import { i18n } from '@/i18n';
import { AdminUsersDataSource } from '../../datasources/adminUsersDataSource';
import type { AdminUser, AdminUsersResponse } from '../../models/AdminUserTypes';
import AdminUsersScreen from '../screens/AdminUsersScreen/AdminUsersScreen.vue';
import ChangeRoleModal from '../components/ChangeRoleModal.vue';
import DeactivateUserModal from '../components/DeactivateUserModal.vue';
import ManageParentLinksModal from '../components/ManageParentLinksModal.vue';

const FIRST = 'Nomthandazo'.padEnd(ACCOUNT_LIMITS.nameMax, 'a');
const LAST = 'Mkhize-Ndlovu'.padEnd(ACCOUNT_LIMITS.nameMax, 'z');
const FULL = `${FIRST} ${LAST}`;
const EMAIL = `${'bugcheck_'.padEnd(ACCOUNT_LIMITS.emailMax - '@example.test'.length, 'x')}@example.test`;
const USERNAME = 'bugcheck_learner_max'.slice(0, ACCOUNT_LIMITS.usernameMax);

const longUser = (values: Partial<AdminUser> = {}): AdminUser => ({
  userId: 12630, firstName: FIRST, lastName: LAST, email: EMAIL, username: null,
  role: 'guardian', status: 'active', createdAt: '2026-10-18T10:00:00.000Z', ...values,
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('the dialog header with a long name', () => {
  it('test data is at the account limits', () => {
    expect(FIRST).toHaveLength(50);
    expect(LAST).toHaveLength(50);
    expect(EMAIL).toHaveLength(60);
    expect(USERNAME).toHaveLength(20);
  });

  it('deactivate: the name is one truncating line with the whole name as its tooltip', () => {
    const wrapper = mount(DeactivateUserModal, { props: { user: longUser() } });
    const subject = wrapper.get('.admin-modal__subject');
    expect(subject.text()).toBe(FULL);
    expect(subject.attributes('title')).toBe(FULL);
    expect(wrapper.find('.admin-modal__heading').exists()).toBe(true);
    expect(wrapper.find('.admin-modal__close').exists()).toBe(true);
  });

  it('deactivate: the warning still names the account in full, inside the dialog', () => {
    const wrapper = mount(DeactivateUserModal, { props: { user: longUser() } });
    const warning = wrapper.get('.ui-alert--warning');
    expect(warning.get('strong').text()).toBe(FULL);
    expect(warning.element.closest('.admin-modal__dialog')).not.toBeNull();
  });

  it('change role: the current role follows the name and is never cut with it', () => {
    const wrapper = mount(ChangeRoleModal, { props: { user: longUser() } });
    expect(wrapper.get('.admin-modal__subject').attributes('title')).toBe(FULL);
    expect(wrapper.get('.admin-modal__detail').text()).toBe('currently Guardian');
    expect(wrapper.get('.admin-modal__subject').text()).not.toContain('Guardian');
  });

  it('change role in isiZulu: the role detail is in isiZulu', () => {
    i18n.global.locale.value = 'zulu';
    const wrapper = mount(ChangeRoleModal, { props: { user: longUser() } });
    expect(wrapper.get('.admin-modal__detail').text()).toBe('indima yamanje: Umnakekeli');
  });

  it('parent links: the role follows the name the same way', async () => {
    vi.spyOn(AdminUsersDataSource, 'getLinks').mockResolvedValue(new $DataSourceResponse([], null));
    vi.spyOn(AdminUsersDataSource, 'listUsers').mockResolvedValue(
      new $DataSourceResponse<AdminUsersResponse>({ users: [], page: 1, pageSize: 20, total: 0 }, null),
    );
    const wrapper = mount(ManageParentLinksModal, { props: { user: longUser() } });
    await flushPromises();
    expect(wrapper.get('.admin-modal__subject').attributes('title')).toBe(FULL);
    expect(wrapper.get('.admin-modal__detail').text()).toBe('Guardian');
    wrapper.unmount();
  });
});

describe('the users table with long names and emails', () => {
  async function mountTable(users: AdminUser[]) {
    vi.spyOn(AdminUsersDataSource, 'listUsers').mockResolvedValue(
      new $DataSourceResponse<AdminUsersResponse>({ users, page: 1, pageSize: 20, total: users.length }, null),
    );
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/users', component: AdminUsersScreen }] });
    await router.push('/admin/users');
    await router.isReady();
    const wrapper = mount(AdminUsersScreen, { global: { plugins: [router] } });
    await flushPromises();
    return wrapper;
  }

  it('the name and email are truncating cells with their whole text as tooltips', async () => {
    const wrapper = await mountTable([
      longUser(),
      longUser({ userId: 12631, firstName: 'Bugcheck', email: null, username: USERNAME, role: 'learner' }),
    ]);
    const names = wrapper.findAll('[data-testid="user-name"]');
    expect(names[0].classes()).toContain('admin-users__name');
    expect(names[0].attributes('title')).toBe(FULL);
    const identities = wrapper.findAll('[data-testid="user-identity"]');
    expect(identities[0].classes()).toContain('admin-users__identity-text');
    expect(identities[0].attributes('title')).toBe(EMAIL);
    expect(identities[1].attributes('title')).toBe(USERNAME);
  });

  it('an account with neither email nor username has no tooltip', async () => {
    const wrapper = await mountTable([longUser({ email: null, username: null })]);
    const identity = wrapper.get('[data-testid="user-identity"]');
    expect(identity.text()).toBe('Not provided');
    expect(identity.attributes('title')).toBeUndefined();
  });
});
