import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TaxonomyAdminScreen from '../TaxonomyAdminScreen/TaxonomyAdminScreen.vue'
import { taxonomyAdminStore } from '@/features/media_feature/state/taxonomyAdminStore'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { TagWithUsage, LevelType } from '@/features/media_feature/models/TaxonomyTypes'

const testTags: TagWithUsage[] = [
  { id: 1, name: 'travel', tag_type: 'theme', description: 'World travel', created_at: '', updated_at: '', usage_count: 5 },
  { id: 2, name: 'food', tag_type: 'theme', description: 'Cuisine and cooking', created_at: '', updated_at: '', usage_count: 0 },
  { id: 3, name: 'quiz', tag_type: 'test', description: 'Formative quiz', created_at: '', updated_at: '', usage_count: 2 },
]

const testLevels: LevelType[] = [
  { id: 1, level_number: 1, name: 'Beginner', description: 'Basic phrases', pass_mark: 70, created_at: '', updated_at: '' },
  { id: 2, level_number: 2, name: 'Elementary', description: 'Simple stories', pass_mark: 70, created_at: '', updated_at: '' },
  { id: 3, level_number: 3, name: 'Intermediate', description: 'Complex texts', pass_mark: 70, created_at: '', updated_at: '' },
]

describe('TaxonomyAdminScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(TaxonomyDataSource, 'getTagsWithUsage').mockResolvedValue(
      new $DataSourceResponse([...testTags], null)
    )
    vi.spyOn(TaxonomyDataSource, 'getLevels').mockResolvedValue(
      new $DataSourceResponse([...testLevels], null)
    )
  })

  async function mountScreen() {
    const wrapper = mount(TaxonomyAdminScreen)
    await flushPromises()
    return wrapper
  }

  it('renders the header title and calls store.load on mount', async () => {
    const wrapper = await mountScreen()
    expect(wrapper.find('h1').text()).toBe('Taxonomy')
    expect(wrapper.text()).toContain('themes and assessment tags')
    expect(TaxonomyDataSource.getTagsWithUsage).toHaveBeenCalled()
    expect(TaxonomyDataSource.getLevels).toHaveBeenCalled()
  })

  it('renders vocabulary stats summary accurately', async () => {
    const wrapper = await mountScreen()
    const stats = wrapper.findAll('.stat')
    expect(stats.length).toBe(4)

    // Total: 3, Themes: 2, Assessments: 1, In use: 2
    expect(stats.map((stat) => stat.find('.stat__num').text())).toEqual(['3', '2', '1', '2'])
    expect(wrapper.text()).toContain('In use on content')
  })

  it('renders the table of tags with pills, types, and usage counts', async () => {
    const wrapper = await mountScreen()
    const rows = wrapper.findAll('[data-testid="tag-row"]')
    expect(rows.length).toBe(3)

    expect(wrapper.text()).toContain('#travel')
    expect(wrapper.text()).toContain('#food')
    expect(wrapper.text()).toContain('#quiz')
    expect(wrapper.text()).toContain('5 items')
    expect(wrapper.text()).toContain('Unassigned')
  })

  it('filters tags when clicking category filter pills', async () => {
    const wrapper = await mountScreen()
    await wrapper.get('[data-testid="type-filter-theme"]').trigger('click')
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="tag-row"]')
    expect(rows.length).toBe(2)
    expect(wrapper.text()).toContain('#travel')
    expect(wrapper.text()).toContain('#food')
    expect(wrapper.text()).not.toContain('#quiz')
  })

  it('filters tags when typing into the search input', async () => {
    const wrapper = await mountScreen()
    const searchInput = wrapper.find('[data-testid="tag-search"]')
    await searchInput.setValue('cooking')
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="tag-row"]')
    expect(rows.length).toBe(1)
    expect(wrapper.text()).toContain('#food')
    expect(wrapper.text()).not.toContain('#travel')
  })

  it('opens create modal on "+ Add New Tag" and saves new tag', async () => {
    const createSpy = vi.spyOn(TaxonomyDataSource, 'createTag').mockResolvedValue(
      new $DataSourceResponse({ id: 4, name: 'culture', tag_type: 'theme', description: '', created_at: '', updated_at: '' }, null)
    )

    const wrapper = await mountScreen()
    await wrapper.find('[data-testid="btn-add-tag"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="tag-modal"] h2').text()).toBe('New tag')

    const nameInput = wrapper.find('[data-testid="tag-modal"] input[type="text"]')
    await nameInput.setValue('culture')

    await wrapper.find('[data-testid="tag-modal"] form').trigger('submit')
    await flushPromises()

    expect(createSpy).toHaveBeenCalledWith({
      name: 'culture',
      tag_type: 'theme',
      description: undefined,
    })
    expect(wrapper.find('[data-testid="tag-modal"]').exists()).toBe(false)
  })

  it('opens edit modal with prefilled data and submits update', async () => {
    const updateSpy = vi.spyOn(TaxonomyDataSource, 'updateTag').mockResolvedValue(
      new $DataSourceResponse({ id: 1, name: 'expeditions', tag_type: 'theme', description: 'Updated', created_at: '', updated_at: '' }, null)
    )

    const wrapper = await mountScreen()
    await wrapper.findAll('[data-testid="btn-edit-tag"]')[0].trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="tag-modal"] h2').text()).toBe('Edit tag')

    const nameInput = wrapper.find('[data-testid="tag-modal"] input[type="text"]')
    expect((nameInput.element as HTMLInputElement).value).toBe('travel')

    await nameInput.setValue('expeditions')
    await wrapper.find('[data-testid="tag-modal"] form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith(1, {
      name: 'expeditions',
      tag_type: 'theme',
      description: 'World travel',
    })
  })

  it('a tag on content cannot be deleted: the dialog says why and offers no delete (Table IV Test 15)', async () => {
    const deleteSpy = vi.spyOn(TaxonomyDataSource, 'deleteTag')

    const wrapper = await mountScreen()
    await wrapper.findAll('[data-testid="btn-delete-tag"]')[0].trigger('click') // travel, usage_count = 5
    await flushPromises()

    expect(wrapper.get('[data-testid="delete-blocked"]').text()).toContain('5 pieces of content')
    expect(wrapper.find('[data-testid="btn-confirm-delete"]').exists()).toBe(false)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('an unused tag is deleted after confirming', async () => {
    const deleteSpy = vi.spyOn(TaxonomyDataSource, 'deleteTag').mockResolvedValue(
      new $DataSourceResponse({ message: 'Deleted' }, null)
    )

    const wrapper = await mountScreen()
    await wrapper.findAll('[data-testid="btn-delete-tag"]')[1].trigger('click') // food, unused
    await flushPromises()
    await wrapper.get('[data-testid="btn-confirm-delete"]').trigger('click')
    await flushPromises()

    expect(deleteSpy).toHaveBeenCalledWith(2)
    expect(wrapper.find('[data-testid="delete-modal"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="tag-row"]').length).toBe(2)
  })

  it('a tag on content keeps its type: the type select is locked when editing it', async () => {
    const wrapper = await mountScreen()
    await wrapper.findAll('[data-testid="btn-edit-tag"]')[0].trigger('click') // travel, in use
    expect(wrapper.get('[data-testid="tag-type"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="tag-type-locked"]').exists()).toBe(true)

    await wrapper.findAll('[data-testid="tag-modal"] button').find((b) => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.find('[data-testid="tag-modal"]').exists()).toBe(false)
    await wrapper.findAll('[data-testid="btn-edit-tag"]')[1].trigger('click') // food, unused
    expect(wrapper.get('[data-testid="tag-type"]').attributes('disabled')).toBeUndefined()
  })

  it('invalid: a failed tag load shows the error with a retry, not an empty table', async () => {
    const load = vi.spyOn(TaxonomyDataSource, 'getTagsWithUsage').mockResolvedValue(
      new $DataSourceResponse<TagWithUsage[]>(null, new Exception({
        exceptionType: ExceptionType.FAILED, message: 'Database error', statusCode: 500 }))
    )
    const wrapper = await mountScreen()
    expect(wrapper.get('[data-testid="tags-error"]').text()).toContain('Database error')
    expect(wrapper.find('[data-testid="tags-empty"]').exists()).toBe(false)

    load.mockResolvedValue(new $DataSourceResponse([...testTags], null))
    await wrapper.get('[data-testid="tags-error"] button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="tag-row"]').length).toBe(3)
  })

  it('boundary: a search that matches nothing shows an empty state', async () => {
    const wrapper = await mountScreen()
    await wrapper.find('[data-testid="tag-search"]').setValue('zzz')
    expect(wrapper.find('[data-testid="tags-empty"]').exists()).toBe(true)
  })

  it('renders error and success banners from store', async () => {
    const wrapper = await mountScreen()
    const store = taxonomyAdminStore()

    store.actionSuccess = 'Tag created successfully.'
    await flushPromises()
    expect(wrapper.find('[data-testid="banner-success"]').text()).toContain('Tag created successfully.')

    store.actionError = 'Cannot delete tag because it is currently assigned to content'
    await flushPromises()
    expect(wrapper.find('[data-testid="banner-error"]').text()).toContain('Cannot delete tag because it is currently assigned to content')
  })

  it('switches between Tags and Levels tabs', async () => {
    const wrapper = await mountScreen()

    // Initially on Tags tab
    expect(wrapper.find('[data-testid="btn-add-tag"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="levels-table"]').exists()).toBe(false)

    // Switch to Levels tab
    await wrapper.find('[data-testid="tab-levels"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="levels-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="btn-add-tag"]').exists()).toBe(false)
  })

  it('renders levels table with pass marks on the Levels tab', async () => {
    const wrapper = await mountScreen()
    await wrapper.find('[data-testid="tab-levels"]').trigger('click')
    await flushPromises()

    const rows = wrapper.findAll('[data-testid="levels-table"] tbody tr')
    expect(rows.length).toBe(3)

    expect(wrapper.text()).toContain('Beginner')
    expect(wrapper.text()).toContain('Elementary')
    expect(wrapper.text()).toContain('Intermediate')
    expect(wrapper.text()).toContain('70%')
  })

  it('opens level modal, edits level 3 pass mark to 75%, and saves (Table IV Test 14)', async () => {
    const updateSpy = vi.spyOn(TaxonomyDataSource, 'updateLevel').mockResolvedValue(
      new $DataSourceResponse({ ...testLevels[2], pass_mark: 75 }, null)
    )

    const wrapper = await mountScreen()
    await wrapper.find('[data-testid="tab-levels"]').trigger('click')
    await flushPromises()

    // Click "Edit Rules" on level 3 (third row)
    const editBtns = wrapper.findAll('[data-testid="btn-edit-level"]')
    expect(editBtns.length).toBe(3)
    await editBtns[2].trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="level-modal"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="level-modal"] h2').text()).toContain('Edit level 3 rules')

    // Change pass mark from 70 to 75 (Table IV Test 14)
    const passInput = wrapper.find('[data-testid="input-pass-mark"]')
    expect((passInput.element as HTMLInputElement).value).toBe('70')

    await passInput.setValue(75)
    await wrapper.find('[data-testid="level-modal"] form').trigger('submit')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledWith(3, {
      name: 'Intermediate',
      description: 'Complex texts',
      pass_mark: 75,
    })
    expect(wrapper.find('[data-testid="level-modal"]').exists()).toBe(false)
  })

  it('validates pass mark range in level edit modal', async () => {
    const wrapper = await mountScreen()
    await wrapper.find('[data-testid="tab-levels"]').trigger('click')
    await flushPromises()

    await wrapper.findAll('[data-testid="btn-edit-level"]')[0].trigger('click')
    await flushPromises()

    // Pass mark < 50
    const passInput = wrapper.find('[data-testid="input-pass-mark"]')
    await passInput.setValue(40)
    await wrapper.find('[data-testid="level-modal"] form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="level-form-error"]').text()).toContain('between 50 and 100')
  })
})

