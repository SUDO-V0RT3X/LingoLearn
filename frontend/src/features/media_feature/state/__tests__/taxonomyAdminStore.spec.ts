import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { taxonomyAdminStore } from '../taxonomyAdminStore'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { TagWithUsage, TagType, LevelType } from '@/features/media_feature/models/TaxonomyTypes'

const mockTags: TagWithUsage[] = [
  { id: 1, name: 'travel', tag_type: 'theme', description: 'Travel theme', created_at: '', updated_at: '', usage_count: 8 },
  { id: 2, name: 'food', tag_type: 'theme', description: 'Culinary traditions', created_at: '', updated_at: '', usage_count: 0 },
  { id: 3, name: 'quiz', tag_type: 'test', description: 'Formative quiz', created_at: '', updated_at: '', usage_count: 3 },
  { id: 4, name: 'exam', tag_type: 'test', description: 'Summative exam', created_at: '', updated_at: '', usage_count: 0 },
]

describe('taxonomyAdminStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(TaxonomyDataSource, 'getTagsWithUsage').mockResolvedValue(
      new $DataSourceResponse([...mockTags], null)
    )
  })

  it('initializes with default empty state', () => {
    const store = taxonomyAdminStore()
    expect(store.tags).toEqual([])
    expect(store.levels).toEqual([])
    expect(store.isLoading).toBe(false)
    expect(store.isSaving).toBe(false)
    expect(store.isDeleting).toBe(false)
    expect(store.error).toBeNull()
    expect(store.actionError).toBeNull()
    expect(store.actionSuccess).toBeNull()
    expect(store.typeFilter).toBe('all')
    expect(store.searchQuery).toBe('')
    expect(store.editingTag).toBeNull()
    expect(store.editingLevel).toBeNull()
  })

  it('load() populates tags from the data source', async () => {
    const store = taxonomyAdminStore()
    await store.load()

    expect(store.tags).toEqual(mockTags)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('load() sets error state when loading fails', async () => {
    vi.spyOn(TaxonomyDataSource, 'getTagsWithUsage').mockResolvedValue(
      new $DataSourceResponse<TagWithUsage[]>(null, new Exception({
        exceptionType: ExceptionType.FAILED,
        message: 'Database error',
        statusCode: 500,
      }))
    )

    const store = taxonomyAdminStore()
    await store.load()

    expect(store.tags).toEqual([])
    expect(store.error).toBe('Database error')
    expect(store.isLoading).toBe(false)
  })

  describe('getters', () => {
    it('computes correct vocabulary counts', async () => {
      const store = taxonomyAdminStore()
      await store.load()

      expect(store.totalCount).toBe(4)
      expect(store.themeCount).toBe(2)
      expect(store.testCount).toBe(2)
      expect(store.inUseCount).toBe(2)
    })

    it('filters tags by category type', async () => {
      const store = taxonomyAdminStore()
      await store.load()

      store.setTypeFilter('theme')
      expect(store.filteredTags.every((t) => t.tag_type === 'theme')).toBe(true)
      expect(store.filteredTags.length).toBe(2)

      store.setTypeFilter('test')
      expect(store.filteredTags.every((t) => t.tag_type === 'test')).toBe(true)
      expect(store.filteredTags.length).toBe(2)

      store.setTypeFilter('all')
      expect(store.filteredTags.length).toBe(4)
    })

    it('filters tags by search query matching name or description', async () => {
      const store = taxonomyAdminStore()
      await store.load()

      store.setSearchQuery('culinary')
      expect(store.filteredTags.map((t) => t.name)).toEqual(['food'])

      store.setSearchQuery('TRAV')
      expect(store.filteredTags.map((t) => t.name)).toEqual(['travel'])

      store.setSearchQuery('non-existent')
      expect(store.filteredTags).toEqual([])
    })
  })

  describe('createTag', () => {
    it('creates tag, sets success message, and reloads tags', async () => {
      const newTag = { id: 5, name: 'animals', tag_type: 'theme' as const, description: 'Wildlife', created_at: '', updated_at: '' }
      vi.spyOn(TaxonomyDataSource, 'createTag').mockResolvedValue(new $DataSourceResponse(newTag, null))

      const store = taxonomyAdminStore()
      const success = await store.createTag({ name: 'animals', tag_type: 'theme', description: 'Wildlife' })

      expect(success).toBe(true)
      expect(store.actionSuccess).toContain('created successfully')
      expect(store.actionError).toBeNull()
      expect(store.isSaving).toBe(false)
    })

    it('sets actionError when create fails', async () => {
      vi.spyOn(TaxonomyDataSource, 'createTag').mockResolvedValue(
        new $DataSourceResponse<TagType>(null, new Exception({
          exceptionType: ExceptionType.CONFLICT,
          message: 'Tag "travel" already exists',
          statusCode: 409,
        }))
      )

      const store = taxonomyAdminStore()
      const success = await store.createTag({ name: 'travel', tag_type: 'theme' })

      expect(success).toBe(false)
      expect(store.actionError).toBe('Tag "travel" already exists')
      expect(store.actionSuccess).toBeNull()
    })
  })

  describe('updateTag', () => {
    it('updates tag, sets success message, clears editingTag, and reloads tags', async () => {
      const updatedTag = { id: 1, name: 'wanderlust', tag_type: 'theme' as const, description: 'Travel theme', created_at: '', updated_at: '', usage_count: 8 }
      vi.spyOn(TaxonomyDataSource, 'updateTag').mockResolvedValue(new $DataSourceResponse(updatedTag, null))

      const store = taxonomyAdminStore()
      store.setEditingTag(mockTags[0])

      const success = await store.updateTag(1, { name: 'wanderlust' })
      expect(success).toBe(true)
      expect(store.actionSuccess).toContain('updated successfully')
      expect(store.editingTag).toBeNull()
    })

    it('sets actionError when update fails', async () => {
      vi.spyOn(TaxonomyDataSource, 'updateTag').mockResolvedValue(
        new $DataSourceResponse<TagType>(null, new Exception({
          exceptionType: ExceptionType.CONFLICT,
          message: 'A tag with this name already exists',
          statusCode: 409,
        }))
      )

      const store = taxonomyAdminStore()
      const success = await store.updateTag(1, { name: 'food' })

      expect(success).toBe(false)
      expect(store.actionError).toBe('A tag with this name already exists')
    })
  })

  describe('deleteTag (Table IV Test 15)', () => {
    it('deletes unassigned tag from state on success', async () => {
      vi.spyOn(TaxonomyDataSource, 'deleteTag').mockResolvedValue(
        new $DataSourceResponse({ message: 'Tag deleted successfully' }, null)
      )

      const store = taxonomyAdminStore()
      await store.load()

      const success = await store.deleteTag(2)
      expect(success).toBe(true)
      expect(store.tags.find((t) => t.id === 2)).toBeUndefined()
      expect(store.actionSuccess).toContain('deleted successfully')
    })

    it('blocks deletion of in-use tag and retains it in list on 409 error (Table IV Test 15)', async () => {
      vi.spyOn(TaxonomyDataSource, 'deleteTag').mockResolvedValue(
        new $DataSourceResponse<{ message: string }>(null, new Exception({
          exceptionType: ExceptionType.CONFLICT,
          message: 'Cannot delete tag because it is currently assigned to content',
          statusCode: 409,
        }))
      )

      const store = taxonomyAdminStore()
      await store.load()

      const success = await store.deleteTag(1)
      expect(success).toBe(false)
      expect(store.actionError).toBe('Cannot delete tag because it is currently assigned to content')
      expect(store.tags.find((t) => t.id === 1)).toBeDefined()
    })
  })

  describe('level rules actions', () => {
    const mockLevels: LevelType[] = [
      { id: 1, level_number: 1, name: 'Beginner', description: 'Level 1', pass_mark: 70, created_at: '', updated_at: '' },
      { id: 2, level_number: 2, name: 'Elementary', description: 'Level 2', pass_mark: 70, created_at: '', updated_at: '' },
      { id: 3, level_number: 3, name: 'Intermediate', description: 'Level 3', pass_mark: 70, created_at: '', updated_at: '' },
    ]

    it('loadLevels() populates levels from data source', async () => {
      vi.spyOn(TaxonomyDataSource, 'getLevels').mockResolvedValue(
        new $DataSourceResponse([...mockLevels], null)
      )

      const store = taxonomyAdminStore()
      await store.loadLevels()

      expect(store.levels).toEqual(mockLevels)
      expect(store.isLoadingLevels).toBe(false)
      expect(store.levelsError).toBeNull()
    })

    it('loadLevels() records error when data source fails', async () => {
      vi.spyOn(TaxonomyDataSource, 'getLevels').mockResolvedValue(
        new $DataSourceResponse<LevelType[]>(null, new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'Failed to load levels.',
          statusCode: 500,
        }))
      )

      const store = taxonomyAdminStore()
      await store.loadLevels()

      expect(store.levels).toEqual([])
      expect(store.levelsError).toBe('Failed to load levels.')
      // A failed level list leaves the tag list's state alone.
      expect(store.error).toBeNull()
    })

    it('updateLevel() changes pass mark and refreshes levels (Table IV Test 14)', async () => {
      const updatedLevel3: LevelType = {
        ...mockLevels[2],
        pass_mark: 75,
      }

      vi.spyOn(TaxonomyDataSource, 'getLevels').mockResolvedValue(
        new $DataSourceResponse([...mockLevels], null)
      )
      const updateSpy = vi.spyOn(TaxonomyDataSource, 'updateLevel').mockResolvedValue(
        new $DataSourceResponse(updatedLevel3, null)
      )

      const store = taxonomyAdminStore()
      await store.loadLevels()

      const success = await store.updateLevel(3, { pass_mark: 75 })
      expect(success).toBe(true)
      expect(updateSpy).toHaveBeenCalledWith(3, { pass_mark: 75 })
      expect(store.actionSuccess).toContain('Level 3 updated — pass mark now 75%')
      expect(store.editingLevel).toBeNull()
    })

    it('updateLevel() records actionError on failure', async () => {
      vi.spyOn(TaxonomyDataSource, 'updateLevel').mockResolvedValue(
        new $DataSourceResponse<LevelType>(null, new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'Invalid pass mark',
          statusCode: 400,
        }))
      )

      const store = taxonomyAdminStore()
      const success = await store.updateLevel(3, { pass_mark: 40 })

      expect(success).toBe(false)
      expect(store.actionError).toBe('Invalid pass mark')
    })

    it('setEditingLevel() sets and clears editing level', () => {
      const store = taxonomyAdminStore()
      store.setEditingLevel(mockLevels[0])
      expect(store.editingLevel).toEqual(mockLevels[0])

      store.setEditingLevel(null)
      expect(store.editingLevel).toBeNull()
    })
  })

  it('clearFeedback() clears action messages', () => {
    const store = taxonomyAdminStore()
    store.actionError = 'Some error'
    store.actionSuccess = 'Some success'

    store.clearFeedback()
    expect(store.actionError).toBeNull()
    expect(store.actionSuccess).toBeNull()
  })
})
