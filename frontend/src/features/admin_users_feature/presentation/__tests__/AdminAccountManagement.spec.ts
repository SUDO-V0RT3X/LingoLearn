import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
import { authStore, type PublicUser } from '@/features/auth_feature/state/authStore';
import { i18n } from '@/i18n';
import { AdminUsersDataSource } from '../../datasources/adminUsersDataSource';
import type { AdminUser, AdminUsersResponse } from '../../models/AdminUserTypes';
import AdminUsersScreen from '../screens/AdminUsersScreen/AdminUsersScreen.vue';
import ChangeRoleModal from '../components/ChangeRoleModal.vue';
import DeactivateUserModal from '../components/DeactivateUserModal.vue';
import ManageParentLinksModal from '../components/ManageParentLinksModal.vue';

const adminUser: PublicUser = {
  id: 1, username: null, firstName: 'Current', lastName: 'Admin', name: 'Current Admin',
  email: 'admin@example.test', role: 'administrator', requiresGuardianLink: false,
};

const row = (values: Partial<AdminUser> = {}): AdminUser => ({
  userId: 2, firstName: 'TS', lastName: 'User', email: 'ts@example.test',
  username: null,
  role: 'guardian', status: 'active', createdAt: '2026-09-20T10:00:00.000Z', ...values,
});

// Creates the in-memory route used by the administrator page.
function testRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/users', component: AdminUsersScreen }] });
}

// Creates the 409 response rendered by both write modals.
function conflict<T>(message: string): $DataSourceResponse<T> {
  return new $DataSourceResponse<T>(null, new Exception({ exceptionType: ExceptionType.CONFLICT, message, statusCode: 409 }));
}

describe('LIN-22 administrator UI', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('hides row actions for the current administrator and deactivated users', async () => {
    authStore().currentUser = adminUser;
    const users = [
      row({ userId: adminUser.id, firstName: 'Current', lastName: 'Admin', role: 'administrator' }),
      row({ userId: 2, status: 'deactivated' }),
      row({ userId: 3, firstName: 'Active', lastName: 'Guardian' }),
    ];
    vi.spyOn(AdminUsersDataSource, 'listUsers').mockResolvedValue(
      new $DataSourceResponse<AdminUsersResponse>({ users, page: 1, pageSize: 20, total: 3 }, null),
    );
    const router = testRouter();
    await router.push('/admin/users');
    await router.isReady();

    const wrapper = mount(AdminUsersScreen, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="actions-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="actions-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="actions-3"]').exists()).toBe(true);
  });

  it('shows a role-change 409 message inside the modal', async () => {
    vi.spyOn(AdminUsersDataSource, 'changeRole').mockResolvedValue(conflict('Unlink this guardian before changing their role'));
    const wrapper = mount(ChangeRoleModal, { props: { user: row() } });

    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Confirm role change');
    await confirm?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Unlink this guardian');
  });

  it('disables the learner option for a guardian and explains why, leaving staff roles open', async () => {
    const wrapper = mount(ChangeRoleModal, { props: { user: row({ role: 'guardian' }) } });

    const option = (role: string) => wrapper.get(`[data-testid="role-option-${role}"]`).element as HTMLInputElement;
    expect(option('learner').disabled).toBe(true);
    expect(option('guardian').disabled).toBe(true);
    expect(option('author').disabled).toBe(false);
    expect(option('administrator').disabled).toBe(false);
    expect(wrapper.get('[data-testid="role-boundary-note"]').text()).toContain('can’t become a learner');
  });

  it('offers a learner no role at all and keeps the confirm button disabled', async () => {
    const changeRole = vi.spyOn(AdminUsersDataSource, 'changeRole');
    const wrapper = mount(ChangeRoleModal, { props: { user: row({ role: 'learner', email: null, username: 'kid' }) } });

    const inputs = wrapper.findAll('input[type="radio"]');
    expect(inputs).toHaveLength(5);
    expect(inputs.every((input) => (input.element as HTMLInputElement).disabled)).toBe(true);
    expect(wrapper.get('[data-testid="role-boundary-note"]').text()).toContain('sign in with a username');

    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Confirm role change');
    expect(confirm?.attributes('disabled')).toBeDefined();
    await confirm?.trigger('click');
    expect(changeRole).not.toHaveBeenCalled();
  });

  it('sends the chosen staff role when a guardian is changed', async () => {
    const changeRole = vi.spyOn(AdminUsersDataSource, 'changeRole')
      .mockResolvedValue(new $DataSourceResponse<AdminUser>(row({ role: 'moderator' }), null));
    const wrapper = mount(ChangeRoleModal, { props: { user: row({ role: 'guardian' }) } });

    await wrapper.get('[data-testid="role-option-moderator"]').setValue(true);
    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Confirm role change');
    await confirm?.trigger('click');
    await flushPromises();

    expect(changeRole).toHaveBeenCalledWith(2, 'moderator', '');
    expect(wrapper.emitted('saved')?.[0]?.[0]).toContain('Moderator');
  });

  it('shows a deactivation 409 message inside the modal', async () => {
    vi.spyOn(AdminUsersDataSource, 'deactivate').mockResolvedValue(conflict('At least one active administrator is required'));
    const wrapper = mount(DeactivateUserModal, { props: { user: row({ role: 'administrator' }) } });

    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Deactivate account');
    await confirm?.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('At least one active administrator');
  });

  it('in isiZulu: the role dialog, its reasons and the saved message are in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(AdminUsersDataSource, 'changeRole')
      .mockResolvedValue(new $DataSourceResponse<AdminUser>(row({ role: 'moderator' }), null));
    const wrapper = mount(ChangeRoleModal, { props: { user: row({ role: 'guardian' }) } });

    expect(wrapper.text()).toContain('Shintsha indima');
    expect(wrapper.text()).toContain('Indima yamanje');
    expect(wrapper.text()).toContain('Abazibhalise njengabafundi kuphela abangaba ngabafundi');
    expect(wrapper.get('[data-testid="role-boundary-note"]').text()).toContain('awakwazi ukuba yi-akhawunti yomfundi');
    expect(wrapper.text()).not.toContain('New role');

    await wrapper.get('[data-testid="role-option-moderator"]').setValue(true);
    await wrapper.findAll('button').find((button) => button.text() === 'Qinisekisa ukushintsha indima')?.trigger('click');
    await flushPromises();
    expect(wrapper.emitted('saved')?.[0]?.[0]).toBe('Indima ishintshiwe. TS User: Umhleli.');
  });

  it('in isiZulu: a deactivation refusal from the server is shown in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(AdminUsersDataSource, 'deactivate').mockResolvedValue(conflict('At least one active administrator is required'));
    const wrapper = mount(DeactivateUserModal, { props: { user: row({ role: 'administrator' }) } });

    expect(wrapper.text()).toContain('uzokhishwa yonke indawo');
    await wrapper.findAll('button').find((button) => button.text() === 'Vala i-akhawunti')?.trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe('Kudingeka okungenani umphathi oyedwa osebenzayo');
  });

  it('in isiZulu: the parent links dialog is in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    vi.spyOn(AdminUsersDataSource, 'getLinks').mockResolvedValue(new $DataSourceResponse([], null));
    vi.spyOn(AdminUsersDataSource, 'listUsers').mockResolvedValue(
      new $DataSourceResponse<AdminUsersResponse>({ users: [], page: 1, pageSize: 20, total: 0 }, null),
    );
    const wrapper = mount(ManageParentLinksModal, { props: { user: row({ role: 'guardian' }) } });
    await flushPromises();

    expect(wrapper.text()).toContain('Phatha ukuxhumana nabazali');
    expect(wrapper.text()).toContain('Akukho ukuxhumana nabazali okusebenzayo.');
    expect(wrapper.text()).toContain('Sesha abafundi');
    expect(wrapper.text()).toContain('Qeda');
    expect(wrapper.text()).not.toContain('Active links');
    wrapper.unmount();
  });

  describe('guardian links are offered only for children', () => {
    const noLinks = () => vi.spyOn(AdminUsersDataSource, 'getLinks').mockResolvedValue(new $DataSourceResponse([], null));
    const candidates = (users: AdminUser[]) => vi.spyOn(AdminUsersDataSource, 'listUsers').mockResolvedValue(
      new $DataSourceResponse<AdminUsersResponse>({ users, page: 1, pageSize: 20, total: users.length }, null),
    );

    it('an adult learner gets no picker, only the reason', async () => {
      noLinks();
      candidates([row({ userId: 9, firstName: 'Gugu', role: 'guardian' })]);
      const wrapper = mount(ManageParentLinksModal, { props: { user: row({ role: 'learner', canLinkGuardian: false }) } });
      await flushPromises();

      expect(wrapper.text()).toContain('Only a learner under 13 who has finished setup can be linked to a guardian.');
      expect(wrapper.text()).not.toContain('Gugu');
      wrapper.unmount();
    });

    it('a child learner gets the guardian picker as before', async () => {
      noLinks();
      candidates([row({ userId: 9, firstName: 'Gugu', role: 'guardian' })]);
      const wrapper = mount(ManageParentLinksModal, { props: { user: row({ role: 'learner', canLinkGuardian: true }) } });
      await flushPromises();

      expect(wrapper.text()).toContain('Gugu');
      expect(wrapper.text()).not.toContain('Only a learner under 13');
      wrapper.unmount();
    });

    it('a guardian is offered child learners only', async () => {
      noLinks();
      candidates([
        row({ userId: 7, firstName: 'Lwazi', role: 'learner', canLinkGuardian: true }),
        row({ userId: 8, firstName: 'Ayanda', role: 'learner', canLinkGuardian: false }),
      ]);
      const wrapper = mount(ManageParentLinksModal, { props: { user: row({ role: 'guardian' }) } });
      await flushPromises();

      expect(wrapper.text()).toContain('Lwazi');
      expect(wrapper.text()).not.toContain('Ayanda');
      wrapper.unmount();
    });
  });
});
