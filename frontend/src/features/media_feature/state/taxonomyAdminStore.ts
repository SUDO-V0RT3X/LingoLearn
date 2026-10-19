import { defineStore } from 'pinia'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import type {
  LevelType,
  TagWithUsage,
  TagKind,
  CreateTagInput,
  UpdateTagInput,
  UpdateLevelInput,
} from '@/features/media_feature/models/TaxonomyTypes'
import { localizeMediaMessage, mediaT } from '@/features/media_feature/functions/localizeMediaMessage'

// A result message in the interface language.
const t = (key: string, values: Record<string, unknown> = {}) => mediaT(`media.taxonomy.results.${key}`, values)

// The server's (or data source's) error, in the interface language, or this
// screen's own fallback when there is none.
function errorText(message: string | undefined, fallbackKey: string): string {
  return message ? localizeMediaMessage(message) : t(fallbackKey)
}

interface TaxonomyAdminState {
  tags: TagWithUsage[]
  levels: LevelType[]
  // Tags and levels load side by side, so each has its own loading and error state.
  isLoading: boolean
  isLoadingLevels: boolean
  levelsError: string | null
  isSaving: boolean
  isDeleting: boolean
  error: string | null
  actionError: string | null
  actionSuccess: string | null
  typeFilter: 'all' | TagKind
  searchQuery: string
  editingTag: TagWithUsage | null
  editingLevel: LevelType | null
}

export const taxonomyAdminStore = defineStore('taxonomyAdminStore', {
  state: (): TaxonomyAdminState => ({
    tags: [],
    levels: [],
    isLoading: false,
    isLoadingLevels: false,
    levelsError: null,
    isSaving: false,
    isDeleting: false,
    error: null,
    actionError: null,
    actionSuccess: null,
    typeFilter: 'all',
    searchQuery: '',
    editingTag: null,
    editingLevel: null,
  }),

  getters: {
    // Returns tags filtered by category type and search query
    filteredTags(state): TagWithUsage[] {
      const query = state.searchQuery.trim().toLowerCase()
      return state.tags.filter((tag) => {
        const matchesType = state.typeFilter === 'all' || tag.tag_type === state.typeFilter
        const matchesQuery =
          !query ||
          tag.name.toLowerCase().includes(query) ||
          tag.description.toLowerCase().includes(query)
        return matchesType && matchesQuery
      })
    },

    // Total count of vocabulary tags
    totalCount(state): number {
      return state.tags.length
    },

    // Number of theme tags
    themeCount(state): number {
      return state.tags.filter((t) => t.tag_type === 'theme').length
    },

    // Number of test / assessment tags
    testCount(state): number {
      return state.tags.filter((t) => t.tag_type === 'test').length
    },

    // Number of tags actively linked to content
    inUseCount(state): number {
      return state.tags.filter((t) => t.usage_count > 0).length
    },
  },

  actions: {
    // Loads all tags with their content usage counts from the backend
    async load(filterType?: TagKind) {
      this.isLoading = true
      this.error = null

      const response = await TaxonomyDataSource.getTagsWithUsage(filterType)

      if (response.error != null || response.data == null) {
        this.error = errorText(response.error?.message, 'loadFailed')
        this.isLoading = false
        return
      }

      this.tags = response.data
      this.isLoading = false
    },

    // Creates a new tag and refreshes the list
    async createTag(input: CreateTagInput): Promise<boolean> {
      this.isSaving = true
      this.actionError = null
      this.actionSuccess = null

      const response = await TaxonomyDataSource.createTag(input)

      if (response.error != null || response.data == null) {
        this.actionError = errorText(response.error?.message, 'createFailed')
        this.isSaving = false
        return false
      }

      this.actionSuccess = t('created', { name: response.data.name })
      this.isSaving = false
      await this.load()
      return true
    },

    // Updates an existing tag and refreshes the list
    async updateTag(tagId: number, input: UpdateTagInput): Promise<boolean> {
      this.isSaving = true
      this.actionError = null
      this.actionSuccess = null

      const response = await TaxonomyDataSource.updateTag(tagId, input)

      if (response.error != null || response.data == null) {
        this.actionError = errorText(response.error?.message, 'updateFailed')
        this.isSaving = false
        return false
      }

      this.actionSuccess = t('updated', { name: response.data.name })
      this.isSaving = false
      this.editingTag = null
      await this.load()
      return true
    },

    // Deletes a tag by ID. If blocked by foreign key restrict (Table IV Test 15),
    // displays the rejection error message from the backend.
    async deleteTag(tagId: number): Promise<boolean> {
      this.isDeleting = true
      this.actionError = null
      this.actionSuccess = null

      const tagToDelete = this.tags.find((t) => t.id === tagId)
      const response = await TaxonomyDataSource.deleteTag(tagId)

      if (response.error != null || response.data == null) {
        this.actionError = errorText(response.error?.message, 'deleteFailed')
        this.isDeleting = false
        return false
      }

      this.tags = this.tags.filter((t) => t.id !== tagId)
      this.actionSuccess = tagToDelete
        ? t('deleted', { name: tagToDelete.name })
        : t('deletedUnnamed')
      this.isDeleting = false
      return true
    },

    // Loads all levels from the backend
    async loadLevels() {
      this.isLoadingLevels = true
      this.levelsError = null

      const response = await TaxonomyDataSource.getLevels()

      if (response.error != null || response.data == null) {
        this.levelsError = errorText(response.error?.message, 'levelsFailed')
        this.isLoadingLevels = false
        return
      }

      this.levels = response.data
      this.isLoadingLevels = false
    },

    // Updates a level's rules and refreshes the list
    async updateLevel(levelNumber: number, input: UpdateLevelInput): Promise<boolean> {
      this.isSaving = true
      this.actionError = null
      this.actionSuccess = null

      const response = await TaxonomyDataSource.updateLevel(levelNumber, input)

      if (response.error != null || response.data == null) {
        this.actionError = errorText(response.error?.message, 'levelUpdateFailed')
        this.isSaving = false
        return false
      }

      this.actionSuccess = t('levelUpdated', { level: response.data.level_number, mark: response.data.pass_mark })
      this.isSaving = false
      this.editingLevel = null
      await this.loadLevels()
      return true
    },

    setTypeFilter(filter: 'all' | TagKind) {
      this.typeFilter = filter
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    setEditingTag(tag: TagWithUsage | null) {
      this.editingTag = tag
      this.actionError = null
    },

    setEditingLevel(level: LevelType | null) {
      this.editingLevel = level
      this.actionError = null
    },

    clearFeedback() {
      this.actionError = null
      this.actionSuccess = null
    },
  },
})
