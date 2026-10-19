<script setup lang="ts">
import { computed, ref } from 'vue';
import { I18nT, useI18n } from 'vue-i18n';
import { localizeServerMessage } from '@/i18n';
import type { AdminUser } from '../../models/AdminUserTypes';
import { AdminUsersDataSource } from '../../datasources/adminUsersDataSource';
import AdminModal from './AdminModal.vue';

const props = defineProps<{ user: AdminUser }>();
const emit = defineEmits<{ close: []; saved: [message: string] }>();
const { t } = useI18n();
const reason = ref('');
const error = ref('');
const saving = ref(false);
const fullName = computed(() => `${props.user.firstName} ${props.user.lastName}`);

// Sends the deactivation request and renders any server response inline.
async function deactivate(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  const response = await AdminUsersDataSource.deactivate(props.user.userId, reason.value);
  saving.value = false;
  if (response.error) {
    error.value = response.error.message;
    return;
  }
  emit('saved', t('admin.deactivate.saved', { name: fullName.value }));
}
</script>

<template>
  <AdminModal :title="t('admin.deactivate.title')" title-id="deactivate-title" :subtitle="fullName" @close="emit('close')">
    <p class="ui-alert ui-alert--warning">
      <I18nT keypath="admin.deactivate.warning" scope="global">
        <template #name><strong>{{ fullName }}</strong></template>
      </I18nT>
      {{ t('admin.deactivate.kept') }}
    </p>
    <label class="ui-field">
      <span class="ui-label">{{ t('admin.modal.reason') }} <span class="ui-hint">{{ t('admin.modal.reasonAuditHint') }}</span></span>
      <textarea v-model="reason" class="ui-textarea" maxlength="500" rows="3" />
    </label>
    <p v-if="error" class="ui-alert ui-alert--error" role="alert">{{ localizeServerMessage(error) }}</p>

    <template #footer>
      <button type="button" class="ui-btn" @click="emit('close')">{{ t('common.states.cancel') }}</button>
      <button type="button" class="ui-btn ui-btn--danger" :disabled="saving" @click="deactivate">
        {{ saving ? t('admin.deactivate.deactivating') : t('admin.deactivate.confirm') }}
      </button>
    </template>
  </AdminModal>
</template>
