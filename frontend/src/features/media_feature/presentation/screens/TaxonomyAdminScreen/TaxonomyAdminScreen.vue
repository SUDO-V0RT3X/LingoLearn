<script setup lang="ts">
// Administrators' taxonomy screen: the tag vocabulary authors pick from, and
// the six levels with their pass marks. The server enforces every rule shown
// here (a tag on content cannot be deleted or change type); the screen says so
// up front instead of letting the request fail.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { taxonomyAdminStore } from '@/features/media_feature/state/taxonomyAdminStore'
import type { TagWithUsage, TagKind, LevelType } from '@/features/media_feature/models/TaxonomyTypes'
import { clearValidity, localizeValidity } from '@/features/shared/presentation/forms/localizedValidity'

const store = taxonomyAdminStore()
const { t } = useI18n()
const activeTab = ref<'tags' | 'levels'>('tags')

// labelKey is looked up when rendering, so the pills follow the interface language.
const TYPE_FILTERS: Array<{ value: 'all' | TagKind; labelKey: string }> = [
  { value: 'all', labelKey: 'media.taxonomy.filters.all' },
  { value: 'theme', labelKey: 'media.taxonomy.filters.themes' },
  { value: 'test', labelKey: 'media.taxonomy.filters.assessments' },
]

// Tag modal state
const showModal = ref(false)
const isEditing = ref(false)
const modalTagId = ref<number | null>(null)
const modalTagInUse = ref(false)
const tagName = ref('')
const tagType = ref<TagKind>('theme')
const tagDescription = ref('')
const formError = ref<string | null>(null)
const tagToDelete = ref<TagWithUsage | null>(null)

// Level modal state
const showLevelModal = ref(false)
const editLevelNumber = ref<number>(0)
const editPassMark = ref<number>(70)
const editLevelName = ref('')
const editLevelDesc = ref('')
const levelFormError = ref<string | null>(null)

// Escape closes whichever dialog is open.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (showModal.value) closeModal()
  else if (showLevelModal.value) closeLevelModal()
  else tagToDelete.value = null
}

onMounted(() => {
  store.load()
  store.loadLevels()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function switchTab(tab: 'tags' | 'levels') {
  activeTab.value = tab
  store.clearFeedback()
}

function countLabel(filter: 'all' | TagKind): number {
  if (filter === 'theme') return store.themeCount
  if (filter === 'test') return store.testCount
  return store.totalCount
}

// --- Tags ---
function openCreateModal() {
  isEditing.value = false
  modalTagId.value = null
  modalTagInUse.value = false
  tagName.value = ''
  tagType.value = 'theme'
  tagDescription.value = ''
  formError.value = null
  store.clearFeedback()
  showModal.value = true
}

function openEditModal(tag: TagWithUsage) {
  isEditing.value = true
  modalTagId.value = tag.id
  modalTagInUse.value = tag.usage_count > 0
  tagName.value = tag.name
  tagType.value = tag.tag_type
  tagDescription.value = tag.description || ''
  formError.value = null
  store.clearFeedback()
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  formError.value = null
}

async function handleSaveTag() {
  const name = tagName.value.trim().toLowerCase()
  if (!name) {
    formError.value = t('media.taxonomy.tagDialog.nameRequired')
    return
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    formError.value = t('media.taxonomy.tagDialog.nameFormat')
    return
  }

  const payload = {
    name,
    tag_type: tagType.value,
    description: tagDescription.value.trim() || undefined,
  }

  const success = isEditing.value && modalTagId.value !== null
    ? await store.updateTag(modalTagId.value, payload)
    : await store.createTag(payload)

  if (success) {
    closeModal()
  } else {
    formError.value = store.actionError
  }
}

async function executeDelete() {
  if (!tagToDelete.value || tagToDelete.value.usage_count > 0) return
  await store.deleteTag(tagToDelete.value.id)
  tagToDelete.value = null
}

// --- Levels ---
function openLevelModal(level: LevelType) {
  editLevelNumber.value = level.level_number
  editPassMark.value = level.pass_mark
  editLevelName.value = level.name
  editLevelDesc.value = level.description || ''
  levelFormError.value = null
  store.clearFeedback()
  showLevelModal.value = true
}

function closeLevelModal() {
  showLevelModal.value = false
  levelFormError.value = null
}

async function handleSaveLevel() {
  const passMark = Number(editPassMark.value)
  if (!Number.isInteger(passMark) || passMark < 50 || passMark > 100) {
    levelFormError.value = t('media.taxonomy.levelDialog.passMarkError')
    return
  }

  const success = await store.updateLevel(editLevelNumber.value, {
    name: editLevelName.value.trim() || undefined,
    description: editLevelDesc.value.trim() || undefined,
    pass_mark: passMark,
  })

  if (success) {
    closeLevelModal()
  } else {
    levelFormError.value = store.actionError
  }
}
</script>

<template>
  <main class="ui-page taxonomy">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ t('media.taxonomy.eyebrow') }}</p>
        <h1 class="ui-title">{{ t('common.nav.taxonomy') }}</h1>
        <p class="ui-subtitle">{{ t('media.taxonomy.subtitle') }}</p>
      </div>
      <button
        v-if="activeTab === 'tags'"
        type="button"
        class="ui-btn ui-btn--primary"
        data-testid="btn-add-tag"
        @click="openCreateModal"
      >
        {{ t('media.taxonomy.addTag') }}
      </button>
    </header>

    <div class="tabs" role="tablist" :aria-label="t('media.taxonomy.tabsLabel')">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab--active': activeTab === 'tags' }"
        :aria-selected="activeTab === 'tags'"
        data-testid="tab-tags"
        @click="switchTab('tags')"
      >
        {{ t('media.taxonomy.tabTags') }}
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ 'tab--active': activeTab === 'levels' }"
        :aria-selected="activeTab === 'levels'"
        data-testid="tab-levels"
        @click="switchTab('levels')"
      >
        {{ t('media.taxonomy.tabLevels') }}
      </button>
    </div>

    <!-- Outcome of the last change -->
    <div v-if="store.actionSuccess" class="ui-alert ui-alert--success banner" role="status" data-testid="banner-success">
      <span>{{ store.actionSuccess }}</span>
      <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" :aria-label="t('media.taxonomy.dismiss')" @click="store.clearFeedback">✕</button>
    </div>
    <div v-if="store.actionError && !showModal && !showLevelModal" class="ui-alert ui-alert--error banner" role="alert" data-testid="banner-error">
      <span>{{ store.actionError }}</span>
      <button type="button" class="ui-btn ui-btn--ghost ui-btn--sm" :aria-label="t('media.taxonomy.dismiss')" @click="store.clearFeedback">✕</button>
    </div>

    <!-- ============ TAGS ============ -->
    <section v-if="activeTab === 'tags'" class="ui-stack" :aria-label="t('media.taxonomy.tabTags')">
      <div class="stats">
        <div class="ui-card stat">
          <span class="stat__num">{{ store.totalCount }}</span>
          <span class="stat__label">{{ t('media.taxonomy.stats.total') }}</span>
        </div>
        <div class="ui-card stat">
          <span class="stat__num">{{ store.themeCount }}</span>
          <span class="stat__label">{{ t('media.taxonomy.stats.themes') }}</span>
        </div>
        <div class="ui-card stat">
          <span class="stat__num">{{ store.testCount }}</span>
          <span class="stat__label">{{ t('media.taxonomy.stats.assessments') }}</span>
        </div>
        <div class="ui-card stat">
          <span class="stat__num">{{ store.inUseCount }}</span>
          <span class="stat__label">{{ t('media.taxonomy.stats.inUse') }}</span>
        </div>
      </div>

      <div class="controls">
        <div class="pills" role="group" :aria-label="t('media.taxonomy.filters.label')">
          <button
            v-for="filter in TYPE_FILTERS"
            :key="filter.value"
            type="button"
            :class="['ui-chip', 'pill', { 'ui-chip--active': store.typeFilter === filter.value }]"
            :aria-pressed="store.typeFilter === filter.value"
            :data-testid="`type-filter-${filter.value}`"
            @click="store.setTypeFilter(filter.value)"
          >
            {{ t(filter.labelKey) }} <span class="pill__count">{{ countLabel(filter.value) }}</span>
          </button>
        </div>
        <label class="search">
          <span class="ui-sr-only">{{ t('media.taxonomy.searchLabel') }}</span>
          <input
            type="search"
            class="ui-input"
            :placeholder="t('media.taxonomy.searchPlaceholder')"
            data-testid="tag-search"
            :value="store.searchQuery"
            @input="store.setSearchQuery(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <div v-if="store.isLoading" class="ui-card ui-card--flat state" role="status">
        <span class="ui-spinner" aria-hidden="true"></span>
        <span>{{ t('media.taxonomy.loadingTags') }}</span>
      </div>
      <div v-else-if="store.error" class="ui-alert ui-alert--error state--error" role="alert" data-testid="tags-error">
        <span>{{ t('media.taxonomy.tagsError', { error: store.error }) }}</span>
        <button type="button" class="ui-btn ui-btn--sm" @click="store.load()">{{ t('common.states.retry') }}</button>
      </div>
      <div v-else-if="store.filteredTags.length === 0" class="ui-card ui-card--flat ui-empty" data-testid="tags-empty">
        <p class="ui-empty__title">{{ t('media.taxonomy.tagsEmptyTitle') }}</p>
        <p>{{ t('media.taxonomy.tagsEmptyBody') }}</p>
      </div>

      <div v-else class="ui-table-wrap">
        <table class="ui-table" data-testid="tags-table">
          <thead>
            <tr>
              <th scope="col">{{ t('media.taxonomy.columns.tag') }}</th>
              <th scope="col">{{ t('media.taxonomy.columns.type') }}</th>
              <th scope="col">{{ t('media.taxonomy.columns.description') }}</th>
              <th scope="col">{{ t('media.taxonomy.columns.usage') }}</th>
              <th scope="col" class="actions"><span class="ui-sr-only">{{ t('media.taxonomy.columns.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tag in store.filteredTags" :key="tag.id" data-testid="tag-row">
              <td><span class="tag-name">#{{ tag.name }}</span></td>
              <td>
                <span :class="['ui-badge', tag.tag_type === 'theme' ? 'ui-badge--brand' : 'ui-badge--info']">
                  {{ t(`media.taxonomy.kinds.${tag.tag_type}`) }}
                </span>
              </td>
              <td class="desc">{{ tag.description || '—' }}</td>
              <td>
                <span :class="['ui-badge', { 'ui-badge--success': tag.usage_count > 0 }]">
                  {{ tag.usage_count > 0 ? t('media.taxonomy.usageCount', tag.usage_count) : t('media.taxonomy.unassigned') }}
                </span>
              </td>
              <td class="actions">
                <button type="button" class="ui-btn ui-btn--sm" data-testid="btn-edit-tag" @click="openEditModal(tag)">{{ t('media.taxonomy.edit') }}</button>
                <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" data-testid="btn-delete-tag" @click="tagToDelete = tag">{{ t('media.taxonomy.delete') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ============ LEVELS ============ -->
    <section v-else class="ui-stack" :aria-label="t('media.taxonomy.tabLevels')">
      <div v-if="store.isLoadingLevels" class="ui-card ui-card--flat state" role="status">
        <span class="ui-spinner" aria-hidden="true"></span>
        <span>{{ t('media.taxonomy.loadingLevels') }}</span>
      </div>
      <div v-else-if="store.levelsError" class="ui-alert ui-alert--error state--error" role="alert" data-testid="levels-error">
        <span>{{ t('media.taxonomy.levelsError', { error: store.levelsError }) }}</span>
        <button type="button" class="ui-btn ui-btn--sm" @click="store.loadLevels()">{{ t('common.states.retry') }}</button>
      </div>
      <div v-else-if="store.levels.length === 0" class="ui-card ui-card--flat ui-empty">
        <p class="ui-empty__title">{{ t('media.taxonomy.levelsEmptyTitle') }}</p>
        <p>{{ t('media.taxonomy.levelsEmptyBody') }}</p>
      </div>

      <div v-else class="ui-table-wrap">
        <table class="ui-table" data-testid="levels-table">
          <thead>
            <tr>
              <th scope="col">{{ t('media.taxonomy.columns.level') }}</th>
              <th scope="col">{{ t('media.taxonomy.columns.name') }}</th>
              <th scope="col">{{ t('media.taxonomy.columns.description') }}</th>
              <th scope="col">{{ t('media.taxonomy.columns.passMark') }}</th>
              <th scope="col" class="actions"><span class="ui-sr-only">{{ t('media.taxonomy.columns.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="level in store.levels" :key="level.id">
              <td><span class="level-num">{{ level.level_number }}</span></td>
              <td class="strong">{{ level.name }}</td>
              <td class="desc">{{ level.description || '—' }}</td>
              <td><span class="ui-badge ui-badge--brand">{{ level.pass_mark }}%</span></td>
              <td class="actions">
                <button type="button" class="ui-btn ui-btn--sm" data-testid="btn-edit-level" @click="openLevelModal(level)">
                  {{ t('media.taxonomy.editRules') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Create / edit tag -->
    <div v-if="showModal" class="backdrop" @click.self="closeModal">
      <div class="ui-card dialog" role="dialog" aria-modal="true" aria-labelledby="tag-dialog-title" data-testid="tag-modal">
        <h2 id="tag-dialog-title" class="ui-section-title">{{ isEditing ? t('media.taxonomy.tagDialog.editTitle') : t('media.taxonomy.tagDialog.newTitle') }}</h2>

        <form class="ui-stack" @submit.prevent="handleSaveTag" @invalid.capture="localizeValidity" @input="clearValidity" @change="clearValidity">
          <div v-if="formError" class="ui-alert ui-alert--error" role="alert" data-testid="tag-form-error">{{ formError }}</div>

          <div class="ui-field">
            <label class="ui-label" for="tag-name">{{ t('media.taxonomy.tagDialog.name') }}</label>
            <input id="tag-name" v-model="tagName" type="text" class="ui-input" :placeholder="t('media.taxonomy.tagDialog.namePlaceholder')" minlength="1" maxlength="50" required />
            <span class="ui-hint">{{ t('media.taxonomy.tagDialog.nameHint') }}</span>
          </div>

          <div class="ui-field">
            <label class="ui-label" for="tag-type">{{ t('media.taxonomy.tagDialog.type') }}</label>
            <select id="tag-type" v-model="tagType" class="ui-select" :disabled="modalTagInUse" data-testid="tag-type">
              <option value="theme">{{ t('media.taxonomy.tagDialog.typeTheme') }}</option>
              <option value="test">{{ t('media.taxonomy.tagDialog.typeTest') }}</option>
            </select>
            <span v-if="modalTagInUse" class="ui-hint" data-testid="tag-type-locked">
              {{ t('media.taxonomy.tagDialog.typeLocked') }}
            </span>
          </div>

          <div class="ui-field">
            <label class="ui-label" for="tag-description">{{ t('media.taxonomy.tagDialog.description') }} <span class="optional">{{ t('media.taxonomy.tagDialog.optional') }}</span></label>
            <textarea id="tag-description" v-model="tagDescription" class="ui-textarea" rows="2" maxlength="255" />
          </div>

          <div class="ui-row dialog__actions">
            <button type="button" class="ui-btn ui-btn--ghost" @click="closeModal">{{ t('common.states.cancel') }}</button>
            <button type="submit" class="ui-btn ui-btn--primary" :disabled="store.isSaving">
              {{ store.isSaving ? t('common.states.saving') : (isEditing ? t('media.taxonomy.tagDialog.saveChanges') : t('media.taxonomy.tagDialog.create')) }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete tag -->
    <div v-if="tagToDelete" class="backdrop" @click.self="tagToDelete = null">
      <div class="ui-card dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" data-testid="delete-modal">
        <h2 id="delete-dialog-title" class="ui-section-title">{{ t('media.taxonomy.deleteDialog.title', { name: tagToDelete.name }) }}</h2>

        <div v-if="tagToDelete.usage_count > 0" class="ui-alert ui-alert--warning" data-testid="delete-blocked">
          <I18nT keypath="media.taxonomy.deleteDialog.blocked" scope="global">
            <template #count>
              <strong>{{ t('media.taxonomy.deleteDialog.pieces', tagToDelete.usage_count) }}</strong>
            </template>
          </I18nT>
        </div>
        <p v-else class="confirm">{{ t('media.taxonomy.deleteDialog.confirm') }}</p>

        <div class="ui-row dialog__actions">
          <button type="button" class="ui-btn ui-btn--ghost" @click="tagToDelete = null">
            {{ tagToDelete.usage_count > 0 ? t('common.states.close') : t('common.states.cancel') }}
          </button>
          <button
            v-if="tagToDelete.usage_count === 0"
            type="button"
            class="ui-btn ui-btn--danger"
            data-testid="btn-confirm-delete"
            :disabled="store.isDeleting"
            @click="executeDelete"
          >
            {{ store.isDeleting ? t('media.taxonomy.deleteDialog.deleting') : t('media.taxonomy.deleteDialog.deleteTag') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit level -->
    <div v-if="showLevelModal" class="backdrop" @click.self="closeLevelModal">
      <div class="ui-card dialog" role="dialog" aria-modal="true" aria-labelledby="level-dialog-title" data-testid="level-modal">
        <h2 id="level-dialog-title" class="ui-section-title">{{ t('media.taxonomy.levelDialog.title', { n: editLevelNumber }) }}</h2>

        <form class="ui-stack" @submit.prevent="handleSaveLevel" @invalid.capture="localizeValidity" @input="clearValidity" @change="clearValidity">
          <div v-if="levelFormError" class="ui-alert ui-alert--error" role="alert" data-testid="level-form-error">{{ levelFormError }}</div>

          <div class="ui-field">
            <label class="ui-label" for="level-name">{{ t('media.taxonomy.levelDialog.name') }}</label>
            <input id="level-name" v-model="editLevelName" type="text" class="ui-input" minlength="1" maxlength="60" required />
          </div>

          <div class="ui-field">
            <label class="ui-label" for="level-description">{{ t('media.taxonomy.levelDialog.description') }}</label>
            <textarea id="level-description" v-model="editLevelDesc" class="ui-textarea" rows="2" maxlength="255" />
          </div>

          <div class="ui-field">
            <label class="ui-label" for="level-pass-mark">{{ t('media.taxonomy.levelDialog.passMark') }}</label>
            <input
              id="level-pass-mark"
              v-model.number="editPassMark"
              type="number"
              class="ui-input pass-input"
              min="50" max="100" step="1"
              data-testid="input-pass-mark"
              required
            />
            <span class="ui-hint">{{ t('media.taxonomy.levelDialog.passMarkHint') }}</span>
          </div>

          <div class="ui-row dialog__actions">
            <button type="button" class="ui-btn ui-btn--ghost" @click="closeLevelModal">{{ t('common.states.cancel') }}</button>
            <button type="submit" class="ui-btn ui-btn--primary" :disabled="store.isSaving">
              {{ store.isSaving ? t('common.states.saving') : t('media.taxonomy.levelDialog.saveChanges') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--rule);
}

.tab {
  margin-bottom: -1px;
  padding: var(--space-2) var(--space-4);
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--ink-3);
  cursor: pointer;
}

.tab:hover {
  color: var(--ink);
}

.tab--active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.banner .ui-btn {
  color: inherit;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-3);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
}

.stat__num {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--ink);
  line-height: 1;
}

.stat__label {
  font-size: var(--text-sm);
  color: var(--ink-2);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.pill {
  font: inherit;
  font-size: var(--text-sm);
  min-height: 32px;
  padding: 0 var(--space-3);
  cursor: pointer;
}

.pill:not(.ui-chip--active):hover {
  background: var(--surface-2);
  border-color: var(--rule-strong);
}

.pill__count {
  margin-left: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 700;
  opacity: 0.75;
}

.search {
  flex: 0 1 260px;
}

.state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}

.state--error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.tag-name {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--ink);
}

.desc {
  color: var(--ink-2);
  max-width: 340px;
}

.strong {
  font-weight: 600;
}

.actions {
  text-align: right;
  white-space: nowrap;
}

.actions .ui-btn + .ui-btn {
  margin-left: var(--space-2);
}

.level-num {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
  font-size: var(--text-sm);
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: color-mix(in srgb, var(--ink) 45%, transparent);
}

.dialog {
  width: 100%;
  max-width: 460px;
  max-height: calc(100vh - 2 * var(--space-4));
  overflow-y: auto;
  box-shadow: var(--shadow-2);
}

.dialog__actions {
  justify-content: flex-end;
  margin-top: var(--space-2);
}

.optional {
  font-weight: 400;
  color: var(--ink-3);
}

.pass-input {
  max-width: 140px;
}

.confirm {
  margin: 0;
  color: var(--ink-2);
}
</style>
