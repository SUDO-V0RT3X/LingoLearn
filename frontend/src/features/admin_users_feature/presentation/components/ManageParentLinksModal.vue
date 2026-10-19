<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { localizeServerMessage } from '@/i18n';
import type { UserRole } from '@/features/auth_feature/state/authStore';
import type { AdminParentLink, AdminUser } from '../../models/AdminUserTypes';
import { AdminUsersDataSource } from '../../datasources/adminUsersDataSource';
import { ROLE_LABEL_KEYS } from '@/features/shared/presentation/shell/navigation';
import AdminModal from './AdminModal.vue';

const props = defineProps<{ user: AdminUser }>();
const emit = defineEmits<{ close: []; saved: [message: string] }>();
const { t } = useI18n();
const links = ref<AdminParentLink[]>([]);
const candidates = ref<AdminUser[]>([]);
const search = ref('');
const reason = ref('');
const error = ref('');
const loading = ref(true);
const movingLink = ref<AdminParentLink | null>(null);
let searchTimer: number | undefined;

// Chooses guardians for moving/learner linking and learners for guardian linking.
const candidateRole = computed(() => movingLink.value || props.user.role === 'learner' ? 'guardian' : 'learner');

// Only a child can get a new guardian link, so an adult learner is offered no picker.
const canAddLink = computed(() => props.user.role !== 'learner' || props.user.canLinkGuardian === true);

// A role's name in the interface language; an unknown role shows as sent.
function roleLabel(role: UserRole): string {
  return ROLE_LABEL_KEYS[role] ? t(ROLE_LABEL_KEYS[role]) : role;
}

// Loads the currently active links for the selected row.
async function loadLinks(): Promise<void> {
  loading.value = true;
  const response = await AdminUsersDataSource.getLinks(props.user.userId);
  loading.value = false;
  if (response.error) error.value = response.error.message;
  else links.value = response.data ?? [];
}

// Uses the LIN-21 list search with a fixed role for the picker.
async function loadCandidates(): Promise<void> {
  const response = await AdminUsersDataSource.listUsers({ q: search.value.trim() || undefined, role: candidateRole.value, page: 1, pageSize: 20 });
  if (response.error) error.value = response.error.message;
  else candidates.value = (response.data?.users ?? []).filter((candidate) => candidate.status === 'active'
    && candidate.userId !== props.user.userId
    // A guardian is only offered learners who may be linked: children who finished setup.
    && (candidate.role !== 'learner' || candidate.canLinkGuardian === true));
}

// Soft-unlinks one row and reloads the active list.
async function unlink(link: AdminParentLink): Promise<void> {
  error.value = '';
  const response = await AdminUsersDataSource.unlink(link.linkId, reason.value);
  if (response.error) { error.value = response.error.message; return; }
  emit('saved', t('admin.links.removed'));
  await loadLinks();
}

// Selects one link and switches the picker to active guardians.
async function beginMove(link: AdminParentLink): Promise<void> {
  movingLink.value = link;
  search.value = '';
  await loadCandidates();
}

// Moves the selected link to the chosen guardian.
async function chooseCandidate(candidate: AdminUser): Promise<void> {
  error.value = '';
  if (movingLink.value) {
    const response = await AdminUsersDataSource.relink(movingLink.value.linkId, candidate.userId, reason.value);
    if (response.error) { error.value = response.error.message; return; }
    movingLink.value = null;
    emit('saved', t('admin.links.moved'));
  } else {
    const guardianId = props.user.role === 'guardian' ? props.user.userId : candidate.userId;
    const childId = props.user.role === 'learner' ? props.user.userId : candidate.userId;
    const response = await AdminUsersDataSource.createLink(guardianId, childId, reason.value);
    if (response.error) { error.value = response.error.message; return; }
    emit('saved', t('admin.links.added'));
  }
  await loadLinks();
  await loadCandidates();
}

// Debounces picker searches by the same 300 ms used on the main list.
watch(search, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadCandidates, 300);
});

onMounted(async () => {
  await Promise.all([loadLinks(), loadCandidates()]);
});
onBeforeUnmount(() => window.clearTimeout(searchTimer));
</script>

<template>
  <AdminModal :title="t('admin.links.title')" title-id="links-title" :subtitle="`${user.firstName} ${user.lastName}`" :subtitle-detail="roleLabel(user.role)" wide @close="emit('close')">
    <p v-if="error" class="ui-alert ui-alert--error" role="alert">{{ localizeServerMessage(error) }}</p>

    <section>
      <h3 class="links__heading">{{ t('admin.links.heading') }}</h3>
      <div v-if="loading" class="ui-row links__muted" role="status"><span class="ui-spinner" aria-hidden="true" /> {{ t('admin.links.loading') }}</div>
      <p v-else-if="links.length === 0" class="links__muted">{{ t('admin.links.none') }}</p>
      <ul v-else class="links__list">
        <li v-for="link in links" :key="link.linkId" class="links__row">
          <div>
            <strong>{{ link.otherUser.firstName }} {{ link.otherUser.lastName }}</strong>
            <span class="ui-badge links__role">{{ roleLabel(link.otherUser.role) }}</span>
          </div>
          <div class="ui-row">
            <button type="button" class="ui-btn ui-btn--sm" @click="beginMove(link)">{{ t('admin.links.move') }}</button>
            <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" @click="unlink(link)">{{ t('admin.links.unlink') }}</button>
          </div>
        </li>
      </ul>
    </section>

    <p v-if="!canAddLink && !movingLink" class="links__muted">{{ t('admin.links.adultLearner') }}</p>
    <section v-else-if="user.role === 'learner' || user.role === 'guardian' || movingLink" class="ui-stack">
      <div class="ui-row links__picker-head">
        <h3 class="links__heading">{{ movingLink ? t('admin.links.chooseGuardian') : t('admin.links.addLink') }}</h3>
        <button v-if="movingLink" type="button" class="ui-btn ui-btn--ghost ui-btn--sm" @click="movingLink = null; loadCandidates()">{{ t('admin.links.cancelMove') }}</button>
      </div>
      <div class="links__fields">
        <label class="ui-field">
          <span class="ui-label">{{ candidateRole === 'guardian' ? t('admin.links.searchGuardians') : t('admin.links.searchLearners') }}</span>
          <input v-model="search" class="ui-input" type="search" :placeholder="t('admin.users.searchPlaceholder')">
        </label>
        <label class="ui-field">
          <span class="ui-label">{{ t('admin.modal.reason') }} <span class="ui-hint">{{ t('admin.modal.optional') }}</span></span>
          <input v-model="reason" class="ui-input" maxlength="500">
        </label>
      </div>
      <p v-if="candidates.length === 0" class="links__muted">{{ candidateRole === 'guardian' ? t('admin.links.noGuardians') : t('admin.links.noLearners') }}</p>
      <div v-else class="links__candidates">
        <button v-for="candidate in candidates" :key="candidate.userId" type="button" class="links__candidate" @click="chooseCandidate(candidate)">
          <span>{{ candidate.firstName }} {{ candidate.lastName }}</span>
          <small>{{ t('admin.links.candidateId', { id: candidate.userId }) }}</small>
        </button>
      </div>
    </section>

    <template #footer>
      <button type="button" class="ui-btn ui-btn--primary" @click="emit('close')">{{ t('admin.links.done') }}</button>
    </template>
  </AdminModal>
</template>

<style scoped>
.links__heading {
  margin: 0 0 var(--space-2);
  font-size: var(--text-md);
  font-family: var(--font-body);
  font-weight: 700;
}

.links__muted {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.links__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.links__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--rule);
}

.links__role {
  margin-left: var(--space-2);
}

.links__picker-head {
  justify-content: space-between;
}

.links__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.links__candidates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.links__candidate {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.links__candidate:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.links__candidate span {
  min-width: 0;
}

.links__candidate small {
  flex: none;
  color: var(--ink-3);
}

@media (max-width: 600px) {
  .links__fields,
  .links__candidates {
    grid-template-columns: 1fr;
  }
}
</style>
