<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { localizeServerMessage } from '@/i18n';
import type { UserRole } from '@/features/auth_feature/state/authStore';
import { ROLE_LABEL_KEYS } from '@/features/shared/presentation/shell/navigation';
import type { AdminUser } from '../../models/AdminUserTypes';
import { AdminUsersDataSource } from '../../datasources/adminUsersDataSource';
import { ALL_ROLES, allowedRoleChanges, crossesLearnerBoundary, learnerBoundaryExplanation, roleChangeBlockedReason } from '../../functions/roleRules';
import AdminModal from './AdminModal.vue';

const props = defineProps<{ user: AdminUser }>();
const emit = defineEmits<{ close: []; saved: [message: string] }>();
const { t } = useI18n();

// Every role is listed so the administrator sees why some are unavailable;
// the ones the server would refuse are disabled with their reason.
const options = computed(() => ALL_ROLES.map((role) => ({
  role,
  label: t(ROLE_LABEL_KEYS[role]),
  blockedReason: roleChangeBlockedReason(props.user.role, role),
})));
const allowed = computed(() => allowedRoleChanges(props.user.role));
const hasBlockedByIdentity = computed(() => ALL_ROLES.some((role) => crossesLearnerBoundary(props.user.role, role)));

const selectedRole = ref<UserRole | null>(allowed.value[0] ?? null);
const reason = ref('');
const error = ref('');
const saving = ref(false);
const fullName = computed(() => `${props.user.firstName} ${props.user.lastName}`);

// Submits the selected role and leaves any server rejection visible in the modal.
async function save(): Promise<void> {
  if (!selectedRole.value || saving.value) return;
  saving.value = true;
  error.value = '';
  const response = await AdminUsersDataSource.changeRole(props.user.userId, selectedRole.value, reason.value);
  saving.value = false;
  if (response.error) {
    error.value = response.error.message;
    return;
  }
  emit('saved', t('admin.changeRole.saved', { name: fullName.value, role: t(ROLE_LABEL_KEYS[selectedRole.value]) }));
}
</script>

<template>
  <AdminModal :title="t('admin.changeRole.title')" title-id="change-role-title" :subtitle="fullName" :subtitle-detail="t('admin.changeRole.subtitle', { role: t(ROLE_LABEL_KEYS[user.role]) })" @close="emit('close')">
    <fieldset class="role-options" data-testid="new-role">
      <legend class="ui-label">{{ t('admin.changeRole.newRole') }}</legend>
      <label
        v-for="option in options"
        :key="option.role"
        class="role-option"
        :class="{ 'role-option--selected': selectedRole === option.role, 'role-option--disabled': option.blockedReason }"
      >
        <input
          v-model="selectedRole"
          type="radio"
          name="new-role"
          :value="option.role"
          :disabled="Boolean(option.blockedReason)"
          :data-testid="`role-option-${option.role}`"
        >
        <span class="role-option__label">{{ option.label }}</span>
        <span v-if="option.blockedReason" class="role-option__reason">{{ option.blockedReason }}</span>
      </label>
    </fieldset>

    <p v-if="hasBlockedByIdentity" class="ui-alert ui-alert--info" data-testid="role-boundary-note">
      {{ learnerBoundaryExplanation(user.role) }}
    </p>

    <label v-if="allowed.length" class="ui-field">
      <span class="ui-label">{{ t('admin.modal.reason') }} <span class="ui-hint">{{ t('admin.modal.reasonAuditHint') }}</span></span>
      <textarea v-model="reason" class="ui-textarea" maxlength="500" rows="3" />
    </label>

    <p v-if="error" class="ui-alert ui-alert--error" role="alert">{{ localizeServerMessage(error) }}</p>

    <template #footer>
      <button type="button" class="ui-btn" @click="emit('close')">{{ t('common.states.cancel') }}</button>
      <button type="button" class="ui-btn ui-btn--primary" :disabled="saving || !selectedRole" @click="save">
        {{ saving ? t('common.states.saving') : t('admin.changeRole.confirm') }}
      </button>
    </template>
  </AdminModal>
</template>

<style scoped>
.role-options {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.role-options legend {
  margin-bottom: var(--space-2);
}

.role-option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.role-option:hover:not(.role-option--disabled) {
  border-color: var(--primary);
}

.role-option--selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.role-option--disabled {
  cursor: not-allowed;
  background: var(--surface-2);
  color: var(--ink-3);
}

.role-option input {
  accent-color: var(--primary);
  margin: 0;
}

.role-option__label {
  flex: none;
  font-weight: 600;
}

.role-option__reason {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--ink-3);
  text-align: right;
}
</style>
