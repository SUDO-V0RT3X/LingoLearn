// The author dashboard, audio library and taxonomy admin read in isiZulu when
// the interface language is isiZulu, including server errors and relative times.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n'
import AuthorDashboardScreen from '@/features/media_feature/presentation/screens/AuthorDashboardScreen/AuthorDashboardScreen.vue'
import AudioUploadScreen from '@/features/media_feature/presentation/screens/AudioUploadScreen/AudioUploadScreen.vue'
import TaxonomyAdminScreen from '@/features/media_feature/presentation/screens/TaxonomyAdminScreen/TaxonomyAdminScreen.vue'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { taxonomyAdminStore } from '@/features/media_feature/state/taxonomyAdminStore'
import { formatRelativeTime } from '@/features/media_feature/functions/formatRelativeTime'
import { validateTheme } from '@/features/media_feature/functions/validateTaxonomy'
import { localizeMediaMessage } from '@/features/media_feature/functions/localizeMediaMessage'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { $ContentSummary } from '@/features/shared/models/contentType'
import type { TagWithUsage, LevelType } from '@/features/media_feature/models/TaxonomyTypes'

const summary = (over: Partial<$ContentSummary> = {}): $ContentSummary => ({
  contentId: 1, authorId: 3, authorName: 'Ana Author', title: 'Greetings', language: 'zulu',
  childFriendly: true, status: 'draft', version: 0, level: 2, chosenTags: [], kind: 'story',
  updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: null, ...over,
})

const tags: TagWithUsage[] = [
  { id: 1, name: 'travel', tag_type: 'theme', description: 'World travel', created_at: '', updated_at: '', usage_count: 5 },
  { id: 2, name: 'quiz', tag_type: 'test', description: '', created_at: '', updated_at: '', usage_count: 0 },
]
const levels: LevelType[] = [
  { id: 1, level_number: 1, name: 'Beginner', description: 'Basic phrases', pass_mark: 70, created_at: '', updated_at: '' },
]

describe('media screens in isiZulu', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    i18n.global.locale.value = 'zulu'
  })

  it('author dashboard: headings, table, statuses and actions are in isiZulu', async () => {
    vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(new $DataSourceResponse([
      summary({ contentId: 1, status: 'draft' }),
      summary({ contentId: 2, status: 'pending', kind: 'quiz', title: '' }),
    ], null))
    vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(new $DataSourceResponse([], null))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    const wrapper = mount(AuthorDashboardScreen, { global: { plugins: [router] } })
    await router.isReady()
    await flushPromises()

    const text = wrapper.text()
    expect(wrapper.get('h1').text()).toBe('Okuqukethwe kwami')
    expect(wrapper.get('[data-testid="item-summary"]').text()).toBe('Izinto ezingu-2 · Ezilindele ukubuyekezwa: 1')
    expect(text).toContain('Isihloko')
    expect(text).toContain('Isifundo')
    expect(text).toContain('Isivivinyo')
    expect(text).toContain('Izinga 2')
    expect(text).toContain('Kulungele izingane')
    expect(text).toContain('Okusalungiswa okungenasihloko')
    expect(wrapper.get('[data-testid="filter-pill-pending"]').text()).toBe('Kulindile 1')
    expect(wrapper.findAll('[data-testid="status-badge"]')[1].text()).toBe('Kulindele ukubuyekezwa')
    expect(wrapper.findAll('[data-testid="row-action"]').map((b) => b.text())).toEqual(['Hlela', 'Buka'])
    expect(text).not.toContain('My content')
    expect(text).not.toContain('Lesson')
  })

  it('author dashboard: a server error is shown in isiZulu', async () => {
    vi.spyOn(ContentDataSource, 'getMyContent').mockResolvedValue(new $DataSourceResponse<$ContentSummary[]>(null,
      new Exception({ exceptionType: ExceptionType.FAILED, message: 'failed request', statusCode: 500 })))
    vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(new $DataSourceResponse([], null))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    const wrapper = mount(AuthorDashboardScreen, { global: { plugins: [router] } })
    await router.isReady()
    await flushPromises()

    expect(wrapper.get('[data-testid="error"]').text()).toContain('Isicelo asiphumelelanga')
    expect(wrapper.get('[data-testid="error"]').text()).toContain('Zama futhi')
  })

  it('audio library: upload card, clip list and empty values are in isiZulu', async () => {
    vi.spyOn(MediaDataSource, 'listAudio').mockResolvedValue({
      data: [{ filename: 'b.mp3', fileUrl: '/uploads/audio/b.mp3', sizeBytes: 12_000, title: '', transcript: '' }],
      error: null,
    })
    const wrapper = mount(AudioUploadScreen)
    await flushPromises()

    const text = wrapper.text()
    expect(wrapper.get('h1').text()).toBe('Umtapo womsindo')
    expect(text).toContain('Layisha isiqeshana')
    expect(text).toContain('Khetha ifayela lomsindo, noma ulidonsele lapha')
    expect(text).toContain('Isiqeshana esingu-1')
    expect(text).toContain('Isiqeshana esingenasihloko')
    expect(text).toContain('Awukho umbhalo')
    expect(text).not.toContain('Upload a clip')
    expect(text).not.toContain('No transcript')
  })

  it('audio library: a file the browser rejects is explained in isiZulu', async () => {
    vi.spyOn(MediaDataSource, 'listAudio').mockResolvedValue({ data: [], error: null })
    const wrapper = mount(AudioUploadScreen)
    await flushPromises()

    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    const input = wrapper.get('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.get('[data-testid="validation-error"]').text()).toContain('alusekelwa')
    expect(wrapper.text()).toContain('Azikabikho iziqeshana')
  })

  it('taxonomy admin: tabs, stats, table and dialogs are in isiZulu', async () => {
    vi.spyOn(TaxonomyDataSource, 'getTagsWithUsage').mockResolvedValue(new $DataSourceResponse([...tags], null))
    vi.spyOn(TaxonomyDataSource, 'getLevels').mockResolvedValue(new $DataSourceResponse([...levels], null))
    const wrapper = mount(TaxonomyAdminScreen)
    await flushPromises()

    let text = wrapper.text()
    expect(wrapper.get('h1').text()).toBe('Izigaba')
    expect(text).toContain('Wonke amathegi')
    expect(text).toContain('Ingqikithi')
    expect(text).toContain('Izinto ezingu-5')
    expect(text).toContain('Ayabelwanga')
    expect(text).not.toContain('Total tags')
    expect(text).not.toContain('Unassigned')

    // A tag on content cannot be deleted; the dialog says so in isiZulu.
    await wrapper.findAll('[data-testid="btn-delete-tag"]')[0].trigger('click')
    const blocked = wrapper.get('[data-testid="delete-blocked"]')
    expect(blocked.text()).toContain('Le thegi isetshenziswa')
    expect(blocked.get('strong').text()).toBe('ezingxenyeni ezingu-5 zokuqukethwe')
    expect(wrapper.get('[data-testid="delete-modal"] h2').text()).toBe('Susa i-#travel?')

    await wrapper.get('[data-testid="tab-levels"]').trigger('click')
    text = wrapper.text()
    expect(text).toContain('Amamaki okuphasa')
    expect(text).toContain('Hlela imithetho')
  })

  it('taxonomy admin: server refusals reach the screen in isiZulu', async () => {
    vi.spyOn(TaxonomyDataSource, 'getTagsWithUsage').mockResolvedValue(new $DataSourceResponse([...tags], null))
    vi.spyOn(TaxonomyDataSource, 'createTag').mockResolvedValue(new $DataSourceResponse<never>(null,
      new Exception({ exceptionType: ExceptionType.CONFLICT, message: 'A tag named "travel" already exists', statusCode: 409 })))
    vi.spyOn(TaxonomyDataSource, 'deleteTag').mockResolvedValue(new $DataSourceResponse<never>(null,
      new Exception({ exceptionType: ExceptionType.CONFLICT, message: 'Cannot delete tag because it is currently assigned to content', statusCode: 409 })))
    const store = taxonomyAdminStore()
    await store.load()

    await store.createTag({ name: 'travel', tag_type: 'theme' })
    expect(store.actionError).toBe('Ithegi ebizwa ngokuthi "travel" isivele ikhona')

    await store.deleteTag(1)
    expect(store.actionError).toBe('Ithegi ayikwazi ukususwa ngoba okwamanje isetshenziswa okuqukethweni')
  })

  it('helpers follow the interface language', () => {
    const now = new Date('2026-09-12T12:00:00.000Z')
    expect(formatRelativeTime('2026-09-12T11:45:00.000Z', now)).toBe('Khona manje')
    expect(formatRelativeTime('2026-09-11T12:00:00.000Z', now)).toBe('Izolo')
    expect(formatRelativeTime('2026-09-09T12:00:00.000Z', now)).toBe('Ezinsukwini ezingu-3 ezedlule')
    expect(validateTheme(['travel', 'food'])).toBe('Kungakhethwa ingqikithi eyodwa kuphela')
    expect(localizeMediaMessage('File is larger than the 5 MB limit.')).toBe('Ifayela likhulu kunomkhawulo we-5 MB.')

    i18n.global.locale.value = 'english'
    expect(formatRelativeTime('2026-09-11T12:00:00.000Z', now)).toBe('Yesterday')
    expect(localizeMediaMessage('A tag named "x" already exists')).toBe('A tag named "x" already exists')
  })
})
