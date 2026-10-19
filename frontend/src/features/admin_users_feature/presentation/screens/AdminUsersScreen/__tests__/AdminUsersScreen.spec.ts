import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { AdminUsersDataSource } from '@/features/admin_users_feature/datasources/adminUsersDataSource';
import type { AdminUser, AdminUserQuery, AdminUsersResponse } from '@/features/admin_users_feature/models/AdminUserTypes';
import { i18n } from '@/i18n';
import AdminUsersScreen from '../AdminUsersScreen.vue';

// A stable active user returned by the datasource in component tests.
const activeUser: AdminUser = {
  userId: 21,
  firstName: 'TS',
  lastName: 'User',
  email: 'ts@example.test',
  username: null,
  role: 'author',
  status: 'active',
  createdAt: '2026-09-20T10:00:00.000Z',
};

// Creates a paginated response around the supplied rows.
function responseFor(users: AdminUser[]): $DataSourceResponse<AdminUsersResponse> {
  return new $DataSourceResponse({ users, page: 1, pageSize: 20, total: users.length }, null);
}

// Creates the minimal in-memory route table needed by this screen.
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/users', name: 'adminUsers', component: AdminUsersScreen },
    ],
  });
}

describe('AdminUsersScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.spyOn(AdminUsersDataSource, 'listUsers').mockResolvedValue(responseFor([activeUser]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Mounts the screen at its real URL and waits for its initial request. */
  async function mountScreen() {
    const router = makeRouter();
    await router.push('/admin/users');
    await router.isReady();
    const wrapper = mount(AdminUsersScreen, { global: { plugins: [router] } });
    await flushPromises();
    return { wrapper, router };
  }

  it('updates results and the URL 300 ms after search typing stops', async () => {
    const { wrapper, router } = await mountScreen();
    expect(AdminUsersDataSource.listUsers).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();

    await wrapper.get('[data-testid="user-search"]').setValue('tHi');
    await vi.advanceTimersByTimeAsync(299);
    expect(AdminUsersDataSource.listUsers).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(AdminUsersDataSource.listUsers).toHaveBeenCalledTimes(2);
    expect(vi.mocked(AdminUsersDataSource.listUsers).mock.calls[1][0]).toMatchObject({ q: 'tHi', page: 1 });
    expect(router.currentRoute.value.query.q).toBe('tHi');
    wrapper.unmount();
  });

  it('applies the role dropdown immediately and stores it in the URL', async () => {
    const { wrapper, router } = await mountScreen();

    await wrapper.get('[data-testid="role-filter"]').setValue('author');
    await flushPromises();

    const calls = vi.mocked(AdminUsersDataSource.listUsers).mock.calls;
    const latestQuery = calls[calls.length - 1][0] as AdminUserQuery;
    expect(latestQuery).toMatchObject({ role: 'author', page: 1 });
    expect(router.currentRoute.value.query.role).toBe('author');
    wrapper.unmount();
  });

  it('renders the required empty state when no users match', async () => {
    vi.mocked(AdminUsersDataSource.listUsers).mockResolvedValue(responseFor([]));

    const { wrapper } = await mountScreen();

    expect(wrapper.text()).toContain('No users match your search');
    expect(wrapper.find('table').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows a learner username in the email address or username column', async () => {
    vi.mocked(AdminUsersDataSource.listUsers).mockResolvedValue(responseFor([
      { ...activeUser, role: 'learner', email: null, username: 'ts_learner' },
    ]));

    const { wrapper } = await mountScreen();

    expect(wrapper.text()).toContain('Email address / username');
    expect(wrapper.text()).toContain('ts_learner');
    wrapper.unmount();
  });

  it('shows the table, role names, statuses and actions in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    const { wrapper } = await mountScreen();

    const text = wrapper.text();
    expect(text).toContain('Abasebenzisi');
    expect(text).toContain('Ikheli le-imeyili / igama lomsebenzisi');
    expect(text).toContain('Umbhali');
    expect(text).toContain('Iyasebenza');
    expect(text).toContain('Shintsha indima');
    expect(text).toContain('i-akhawunti engu-1');
    expect(text).not.toContain('Change role');
    expect(text).not.toContain('Author');
    wrapper.unmount();
  });

  it('shows a server refusal in isiZulu', async () => {
    i18n.global.locale.value = 'zulu';
    vi.mocked(AdminUsersDataSource.listUsers).mockResolvedValue(
      new $DataSourceResponse<AdminUsersResponse>(null, new Exception({ exceptionType: ExceptionType.FORBIDDEN, message: 'insufficient role', statusCode: 403 })),
    );
    const { wrapper } = await mountScreen();

    expect(wrapper.get('.ui-alert--error').text()).toBe('Awunayo imvume yokwenza lokhu.');
    wrapper.unmount();
  });
});
