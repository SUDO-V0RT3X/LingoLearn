<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { I18nT, useI18n } from 'vue-i18n';
import { intlLocale, localizeServerMessage } from '@/i18n';
import { authStore, type UserRole } from '@/features/auth_feature/state/authStore';
import { AdminUsersDataSource } from '../../../datasources/adminUsersDataSource';
import type { AdminUser, AdminUserQuery } from '../../../models/AdminUserTypes';
import ChangeRoleModal from '../../components/ChangeRoleModal.vue';
import DeactivateUserModal from '../../components/DeactivateUserModal.vue';
import ManageParentLinksModal from '../../components/ManageParentLinksModal.vue';
import { ROLE_LABEL_KEYS } from '@/features/shared/presentation/shell/navigation';
import { ALL_ROLES } from '../../../functions/roleRules';

const { t } = useI18n();

const roleOptions = computed<Array<{ value: '' | UserRole; label: string }>>(() => [
  { value: '', label: t('admin.users.allRoles') },
  ...ALL_ROLES.map((role) => ({ value: role, label: t(ROLE_LABEL_KEYS[role]) })),
]);

// A role's name in the interface language; an unknown role shows as sent.
function roleLabel(role: UserRole): string {
  return ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : role;
}

const route = useRoute();
const router = useRouter();
const auth = authStore();
const textQuery = (value: unknown) => typeof value === 'string' ? value : '';
const integerQuery = (value: unknown, fallback: number) => {
  const parsed = Number(textQuery(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const roleQuery = (value: unknown): '' | UserRole => {
  const role = textQuery(value);
  return (ALL_ROLES as readonly string[]).includes(role) ? role as UserRole : '';
};

// Initializes filters and pagination from the current URL.
const searchText = ref(textQuery(route.query.q));
const selectedRole = ref<'' | UserRole>(roleQuery(route.query.role));
const page = ref(integerQuery(route.query.page, 1));
const pageSize = ref(Math.min(integerQuery(route.query.pageSize, 20), 100));
const users = ref<AdminUser[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const roleUser = ref<AdminUser | null>(null);
const deactivateUser = ref<AdminUser | null>(null);
const linksUser = ref<AdminUser | null>(null);
const toast = ref('');
let searchTimer: number | undefined;
let toastTimer: number | undefined;
let requestNumber = 0;

const rangeStart = computed(() => total.value ? (page.value - 1) * pageSize.value + 1 : 0);
const rangeEnd = computed(() => Math.min(page.value * pageSize.value, total.value));
const hasNext = computed(() => page.value * pageSize.value < total.value);

// Returns whether actions should be rendered for one table row.
function canManage(user: AdminUser): boolean {
  return user.status === 'active' && user.userId !== auth.currentUser?.id;
}

// Whether this row is the signed-in administrator.
function isSelf(user: AdminUser): boolean {
  return user.userId === auth.currentUser?.id;
}

// Formats a stored timestamp as a compact browser-local date; a bad value shows a dash.
function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

// The badge colour for each role, so roles can be told apart at a glance.
const ROLE_BADGES: Record<UserRole, string> = {
  learner: 'ui-badge--info',
  guardian: 'ui-badge--success',
  author: 'ui-badge--warning',
  moderator: 'ui-badge--brand',
  administrator: 'role-badge--admin',
};

function initials(user: AdminUser): string {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase() || '?';
}

const hasFilters = computed(() => Boolean(searchText.value.trim() || selectedRole.value));

// Clears the search and role filter and shows everyone again.
async function clearFilters(): Promise<void> {
  window.clearTimeout(searchTimer);
  searchText.value = '';
  selectedRole.value = '';
  page.value = 1;
  await syncUrl();
  await loadUsers();
  // The search watcher fires for the cleared text; the list is already loaded.
  window.clearTimeout(searchTimer);
}

// Stores the current search, role and page values in the URL.
async function syncUrl(): Promise<void> {
  const query: Record<string, string> = { page: String(page.value), pageSize: String(pageSize.value) };
  if (searchText.value.trim()) query.q = searchText.value.trim();
  if (selectedRole.value) query.role = selectedRole.value;
  await router.replace({ query });
}

// Loads one page and discards a response superseded by a later request.
async function loadUsers(): Promise<void> {
  const requestId = ++requestNumber;
  loading.value = true;
  error.value = '';
  const query: AdminUserQuery = { page: page.value, pageSize: pageSize.value };
  if (searchText.value.trim()) query.q = searchText.value.trim();
  if (selectedRole.value) query.role = selectedRole.value;
  const response = await AdminUsersDataSource.listUsers(query);
  if (requestId !== requestNumber) return;
  loading.value = false;
  if (response.error || !response.data) {
    users.value = [];
    total.value = 0;
    error.value = response.error?.message || 'Failed to load users.';
    return;
  }
  users.value = response.data.users;
  total.value = response.data.total;
}

// Applies the selected role immediately and returns to page one.
async function applyRole(): Promise<void> {
  page.value = 1;
  await syncUrl();
  await loadUsers();
}

// Loads the requested adjacent page.
async function movePage(next: number): Promise<void> {
  if (next < 1 || (next > page.value && !hasNext.value)) return;
  page.value = next;
  await syncUrl();
  await loadUsers();
}

// Displays a short success notification and refreshes the visible rows.
async function actionSaved(message: string, closeModal = true): Promise<void> {
  if (closeModal) {
    roleUser.value = null;
    deactivateUser.value = null;
  }
  toast.value = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = ''; }, 3500);
  await loadUsers();
}

// Restarts the 300 ms list-search timer after each input change.
watch(searchText, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(async () => { page.value = 1; await syncUrl(); await loadUsers(); }, 300);
});

onMounted(loadUsers);
onBeforeUnmount(() => { window.clearTimeout(searchTimer); window.clearTimeout(toastTimer); });
</script>

<template>
  <main class="ui-page ui-page--wide admin-users">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ t('admin.users.eyebrow') }}</p>
        <h1 class="ui-title">{{ t('common.nav.users') }}</h1>
        <p class="ui-subtitle">{{ t('admin.users.subtitle') }}</p>
      </div>
      <I18nT v-if="!loading && !error" keypath="admin.users.count" :plural="total" tag="p" class="admin-users__count" scope="global">
        <template #count><strong>{{ total }}</strong></template>
      </I18nT>
    </header>

    <section class="ui-card admin-users__filters" :aria-label="t('admin.users.filtersLabel')">
      <label class="ui-field admin-users__search">
        <span class="ui-label">{{ t('admin.users.search') }}</span>
        <input v-model="searchText" class="ui-input" data-testid="user-search" type="search" :placeholder="t('admin.users.searchPlaceholder')">
      </label>
      <label class="ui-field admin-users__role">
        <span class="ui-label">{{ t('admin.users.role') }}</span>
        <select v-model="selectedRole" class="ui-select" data-testid="role-filter" @change="applyRole">
          <option v-for="option in roleOptions" :key="option.value || 'all'" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <button v-if="hasFilters" type="button" class="ui-btn ui-btn--ghost admin-users__clear" @click="clearFilters">{{ t('admin.users.clearFilters') }}</button>
    </section>

    <div v-if="loading" class="ui-card ui-empty admin-users__state" role="status">
      <span class="ui-spinner admin-users__spinner" aria-hidden="true" />
      <p>{{ t('admin.users.loading') }}</p>
    </div>
    <div v-else-if="error" class="ui-card admin-users__state" role="alert">
      <p class="ui-alert ui-alert--error">{{ localizeServerMessage(error) }}</p>
      <button type="button" class="ui-btn" @click="loadUsers">{{ t('common.states.retry') }}</button>
    </div>
    <div v-else-if="users.length === 0" class="ui-card ui-empty admin-users__state">
      <p class="ui-empty__title">{{ t('admin.users.emptyTitle') }}</p>
      <p>{{ t('admin.users.emptyBody') }}</p>
      <button v-if="hasFilters" type="button" class="ui-btn" @click="clearFilters">{{ t('admin.users.clearFilters') }}</button>
    </div>
    <div v-else class="ui-table-wrap">
      <table class="ui-table admin-users__table">
        <thead>
          <tr>
            <th scope="col">{{ t('admin.users.columns.name') }}</th>
            <th scope="col">{{ t('admin.users.columns.identity') }}</th>
            <th scope="col">{{ t('admin.users.columns.role') }}</th>
            <th scope="col">{{ t('admin.users.columns.status') }}</th>
            <th scope="col">{{ t('admin.users.columns.created') }}</th>
            <th scope="col" class="admin-users__actions-head">{{ t('admin.users.columns.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.userId" :class="{ 'admin-users__row--muted': user.status === 'deactivated' }">
            <td>
              <div class="admin-users__person">
                <span class="admin-users__avatar" aria-hidden="true">{{ initials(user) }}</span>
                <div class="admin-users__who">
                  <span class="admin-users__name-line">
                    <strong class="admin-users__name" :title="`${user.firstName} ${user.lastName}`" data-testid="user-name">{{ user.firstName }} {{ user.lastName }}</strong>
                    <span v-if="isSelf(user)" class="ui-chip admin-users__you">{{ t('admin.users.you') }}</span>
                  </span>
                  <small>{{ t('admin.users.userId', { id: user.userId }) }}</small>
                </div>
              </div>
            </td>
            <td class="admin-users__identity">
              <span class="admin-users__identity-text" :title="user.email ?? user.username ?? undefined" data-testid="user-identity">{{ user.email ?? user.username ?? t('admin.users.notProvided') }}</span>
            </td>
            <td><span class="ui-badge" :class="ROLE_BADGES[user.role]">{{ roleLabel(user.role) }}</span></td>
            <td>
              <span class="ui-badge" :class="user.status === 'active' ? 'ui-badge--success' : 'admin-users__status--off'">
                {{ user.status === 'active' ? t('admin.users.active') : t('admin.users.deactivated') }}
              </span>
            </td>
            <td class="admin-users__date">{{ dateLabel(user.createdAt) }}</td>
            <td class="admin-users__actions">
              <div v-if="canManage(user)" class="admin-users__action-row" :data-testid="`actions-${user.userId}`">
                <button type="button" class="ui-btn ui-btn--sm" @click="roleUser = user">{{ t('admin.users.changeRole') }}</button>
                <button v-if="user.role === 'learner' || user.role === 'guardian'" type="button" class="ui-btn ui-btn--sm" @click="linksUser = user">{{ t('admin.users.parentLinks') }}</button>
                <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" @click="deactivateUser = user">{{ t('admin.users.deactivate') }}</button>
              </div>
              <span v-else class="admin-users__no-actions">{{ isSelf(user) ? t('admin.users.yourAccount') : t('admin.users.noActions') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer v-if="!loading && !error && total > 0" class="admin-users__pagination">
      <span>{{ t('admin.users.showing', { start: rangeStart, end: rangeEnd, total }) }}</span>
      <div class="ui-row">
        <button type="button" class="ui-btn ui-btn--sm" :disabled="page <= 1" @click="movePage(page - 1)">{{ t('admin.users.previous') }}</button>
        <button type="button" class="ui-btn ui-btn--sm" :disabled="!hasNext" @click="movePage(page + 1)">{{ t('common.states.next') }}</button>
      </div>
    </footer>

    <p v-if="toast" class="admin-users__toast" role="status">{{ toast }}</p>

    <ChangeRoleModal v-if="roleUser" :user="roleUser" @close="roleUser = null" @saved="actionSaved" />
    <DeactivateUserModal v-if="deactivateUser" :user="deactivateUser" @close="deactivateUser = null" @saved="actionSaved" />
    <ManageParentLinksModal v-if="linksUser" :user="linksUser" @close="linksUser = null" @saved="actionSaved($event, false)" />
  </main>
</template>

<style scoped>
.admin-users__count {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.admin-users__count strong {
  color: var(--ink);
  font-size: var(--text-xl);
  font-family: var(--font-display);
}

.admin-users__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
  padding: var(--space-4) var(--space-5);
}

.admin-users__search {
  flex: 1 1 280px;
}

.admin-users__role {
  flex: 0 1 220px;
}

.admin-users__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}

.admin-users__state p {
  margin: 0;
}

.admin-users__spinner {
  margin: 0 auto;
}

.admin-users__table {
  min-width: 900px;
}

.admin-users__person {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.admin-users__who {
  min-width: 0;
}

/* A name can be 50 + 50 characters with no spaces: one line, cut short with an
   ellipsis, the whole name in the tooltip. The "You" chip stays beside it. */
.admin-users__name-line {
  display: flex;
  align-items: center;
  min-width: 0;
}

.admin-users__name {
  display: block;
  max-width: 26ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-users__person small {
  display: block;
  margin-top: 2px;
  color: var(--ink-3);
  font-size: var(--text-xs);
}

.admin-users__avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-pill);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}

.admin-users__you {
  flex: none;
  margin-left: var(--space-2);
}

.admin-users__identity {
  color: var(--ink-2);
}

/* Emails run to 60 characters: one line with an ellipsis, the whole address in the tooltip. */
.admin-users__identity-text {
  display: block;
  max-width: 30ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-users__date {
  color: var(--ink-2);
  white-space: nowrap;
}

.role-badge--admin {
  background: var(--ink);
  color: var(--surface);
}

.admin-users__status--off {
  background: var(--surface-3);
  color: var(--ink-2);
}

.admin-users__row--muted td {
  color: var(--ink-3);
}

.admin-users__row--muted .admin-users__avatar {
  background: var(--surface-3);
  color: var(--ink-3);
}

.admin-users__actions-head {
  text-align: right;
}

.admin-users__actions {
  text-align: right;
}

.admin-users__action-row {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: var(--space-2);
}

.admin-users__no-actions {
  color: var(--ink-3);
  font-size: var(--text-xs);
}

.admin-users__pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-4);
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.admin-users__toast {
  position: fixed;
  right: var(--space-5);
  bottom: var(--space-5);
  z-index: 50;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--success);
  color: var(--on-primary);
  box-shadow: var(--shadow-2);
  font-weight: 600;
  max-width: min(480px, calc(100vw - 2 * var(--space-4)));
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .admin-users__filters {
    padding: var(--space-4);
  }

  .admin-users__role {
    flex: 1 1 100%;
  }

  .admin-users__toast {
    left: var(--space-4);
    right: var(--space-4);
  }
}
</style>
