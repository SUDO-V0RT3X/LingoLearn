import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { learnerExperienceStore } from '@/features/learner_experience/presentation/state/learnerExperienceStore'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes,
         type $ContentRecord, type $ContentSummary } from '@/features/shared/models/contentType'
import type { OnboardingSettings } from '@/features/onboarding_feature/models/OnboardingTypes'
import type { LearnerAccess } from '@/features/onboarding_feature/models/OnboardingTypes'
import { CHILD_WALLPAPERS, DEFAULT_CHILD_WALLPAPER, DEFAULT_WALLPAPER, WALLPAPERS } from '@/features/learner_experience/functions/wallpapers'
import { ReadingDataSource } from '@/features/learner_experience/datasources/learnerDataSource'
import type { $ReadingProgress } from '@/features/learner_experience/models/learnerTypes'

const record = (over: Partial<$ContentRecord> = {}): $ContentRecord => ({
  contentId: 5, authorId: 3, title: 'Greetings', language: 'zulu', childFriendly: true,
  status: 'approved', version: 1, level: 1, chosenTags: [], kind: 'story',
  content: [[new $ContentBlock(ContentBlockTypes.text, { title: 'Hi', text: 'Sawubona' })]],
  updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: '2026-09-15T09:00:00.000Z', ...over,
})

const summary = (over: Partial<$ContentSummary> = {}): $ContentSummary => {
  const { content, ...rest } = record()
  void content
  return { ...rest, authorName: 'Ana Author', ...over }
}

const settings = (over: Partial<OnboardingSettings> = {}): OnboardingSettings => ({
  user_id: 7, target_language: 'zulu', date_of_birth: '2000-01-01', interface_language: 'english',
  daily_goal: 15, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

//The access policy, which the server sends from its own endpoint, not with the settings.
const access = (over: Partial<LearnerAccess> = {}): LearnerAccess => ({
  isUnder13: false, hasActiveParentLink: false, canAccessContent: true, contentAudience: 'general', ...over,
})

describe('learnerExperienceStore', () => {

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    window.localStorage.clear()
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(access(), null))
  })

  it('reads the target language and access policy from the onboarding row', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings')
      .mockResolvedValue(new $DataSourceResponse(settings(), null))
    const store = learnerExperienceStore()
    await store.loadLearnerSettings()

    expect(store.targetLanguage).toBe('zulu')
    expect(store.childFriendlyLocked).toBe(false)
  })

  it('locks the child gate when the access policy puts the learner in the child audience', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(settings(), null))
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(
      access({ isUnder13: true, hasActiveParentLink: true, contentAudience: 'child' }), null))
    const store = learnerExperienceStore()
    await store.loadLearnerSettings()

    expect(store.childFriendlyLocked).toBe(true)
  })

  it('leaves the gate unlocked, without an error, when the access policy cannot be loaded', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse(settings(), null))
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse<LearnerAccess>(
      null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'nope', statusCode: 500 })))
    const store = learnerExperienceStore()
    await store.loadLearnerSettings()

    expect(store.childFriendlyLocked).toBe(false)
    expect(store.targetLanguage).toBe('zulu')
  })

  it('treats a language the content model does not have as no language filter', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings')
      .mockResolvedValue(new $DataSourceResponse(settings({ target_language: 'venda' }), null))
    const store = learnerExperienceStore()
    await store.loadLearnerSettings()

    expect(store.targetLanguage).toBeNull()
  })

  it('keeps a failed setup load quiet when the learner simply has no settings row yet', async () => {
    vi.spyOn(OnboardingDataSource, 'getSettings').mockResolvedValue(new $DataSourceResponse<OnboardingSettings>(
      null, new Exception({ exceptionType: ExceptionType.NOT_FOUND, message: 'no settings', statusCode: 404 })))
    const store = learnerExperienceStore()
    await store.loadLearnerSettings()

    expect(store.settingsError).toBeNull()
    expect(store.areSettingsLoaded).toBe(true)
  })

  it('empties the catalogue and keeps the error when the list call fails', async () => {
    vi.spyOn(ContentDataSource, 'getApprovedContent').mockResolvedValue(new $DataSourceResponse<$ContentSummary[]>(
      null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'Failed to load content.', statusCode: 500 })))
    const store = learnerExperienceStore()
    store.catalogue = [summary()]
    await store.loadCatalogue()

    expect(store.catalogue).toEqual([])
    expect(store.catalogueError?.message).toBe('Failed to load content.')
    expect(store.isCatalogueLoading).toBe(false)
  })

  it('opens approved content and names its author from the catalogue row', async () => {
    vi.spyOn(ContentDataSource, 'getContent')
      .mockResolvedValue(new $DataSourceResponse(record(), null))
    const store = learnerExperienceStore()
    store.catalogue = [summary({ contentId: 5, authorName: 'Ana Author' })]
    await store.loadContent(5)

    expect(store.openContent?.title).toBe('Greetings')
    expect(store.openContentAuthorName).toBe('Ana Author')
  })

  it('has no byline for content the learner opened without the catalogue', async () => {
    vi.spyOn(ContentDataSource, 'getContent')
      .mockResolvedValue(new $DataSourceResponse(record(), null))
    const store = learnerExperienceStore()
    await store.loadContent(5)

    expect(store.openContentAuthorName).toBeNull()
  })

  it('refuses to open content that is not approved', async () => {
    vi.spyOn(ContentDataSource, 'getContent')
      .mockResolvedValue(new $DataSourceResponse(record({ status: 'pending' }), null))
    const store = learnerExperienceStore()
    await store.loadContent(5)

    expect(store.openContent).toBeNull()
    expect(store.contentError?.statusCode).toBe(403)
  })

  it('only the latest catalogue request fills the shelf when filters change quickly', async () => {
    let answerFirst: (value: $DataSourceResponse<$ContentSummary[]>) => void = () => {}
    vi.spyOn(ContentDataSource, 'getApprovedContent')
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
      .mockResolvedValueOnce(new $DataSourceResponse([summary({ title: 'Second' })], null))
    const store = learnerExperienceStore()

    const first = store.loadCatalogue({ level: 1 })
    await store.loadCatalogue({ level: 2 })
    answerFirst(new $DataSourceResponse([summary({ title: 'First' })], null))
    await first

    expect(store.catalogue.map((row) => row.title)).toEqual(['Second'])
    expect(store.isCatalogueLoading).toBe(false)
  })

  it('opens content at the page the learner left it on', async () => {
    const threePages = record({ content: [[], [], []].map(() =>
      [new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'x' })]) })
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(threePages, null))
    vi.spyOn(ReadingDataSource, 'getProgress').mockResolvedValue(new $DataSourceResponse({ page: 1, totalPages: 3 }, null))
    const store = learnerExperienceStore()
    await store.openForReading(5)

    expect(store.openContent?.contentId).toBe(5)
    expect(store.resumePage).toBe(1)
  })

  it('boundary: content left on its last page was finished, so it opens again at the start', async () => {
    const threePages = record({ content: [[], [], []].map(() =>
      [new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'x' })]) })
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(threePages, null))
    vi.spyOn(ReadingDataSource, 'getProgress').mockResolvedValue(new $DataSourceResponse({ page: 2, totalPages: 3 }, null))
    const store = learnerExperienceStore()
    await store.openForReading(5)

    expect(store.resumePage).toBe(0)
  })

  it('boundary: starts at the first page when the saved page is past the end or cannot be loaded', async () => {
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(record(), null))
    vi.spyOn(ReadingDataSource, 'getProgress').mockResolvedValue(new $DataSourceResponse({ page: 4, totalPages: 5 }, null))
    const store = learnerExperienceStore()
    await store.openForReading(5)
    expect(store.resumePage).toBe(0)

    vi.spyOn(ReadingDataSource, 'getProgress').mockResolvedValue(new $DataSourceResponse<$ReadingProgress>(
      null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'nope', statusCode: 500 })))
    await store.openForReading(5)
    expect(store.resumePage).toBe(0)
    expect(store.openContent).not.toBeNull()
  })

  it('saves the page and keeps a failed save as a note, not an error that stops reading', async () => {
    const save = vi.spyOn(ReadingDataSource, 'saveProgress')
      .mockResolvedValue(new $DataSourceResponse<$ReadingProgress>(
        null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'Failed to save your place.', statusCode: 500 })))
    const store = learnerExperienceStore()
    await store.saveReadingProgress(5, 1, 3)

    expect(save).toHaveBeenCalledWith(5, 1, 3)
    expect(store.progressSaveError?.message).toBe('Failed to save your place.')
    expect(store.contentError).toBeNull()
  })

  it('remembers each learner\'s own wallpaper, so the next person on this browser does not inherit it', () => {
    const store = learnerExperienceStore()
    const chosen = WALLPAPERS[2].css

    store.setWallpaper(chosen, 7, false)
    expect(store.wallpaper).toBe(chosen)
    expect(window.localStorage.getItem('lingolearn_learner_wallpaper:7')).toBe(chosen)
    expect(window.localStorage.getItem('lingolearn_learner_wallpaper')).toBeNull()

    //Someone else signs in on the same browser: they start on the default.
    store.loadWallpaperFor(8, false)
    expect(store.wallpaper).toBe(DEFAULT_WALLPAPER)
    store.loadWallpaperFor(7, false)
    expect(store.wallpaper).toBe(chosen)

    //An unknown one is ignored.
    store.setWallpaper('linear-gradient(0deg, red, blue)', 7, false)
    expect(store.wallpaper).toBe(chosen)
  })

  it('a child gets the bright set, and an adult wallpaper is not used in the child theme', () => {
    const store = learnerExperienceStore()
    store.setWallpaper(WALLPAPERS[1].css, 9, true)
    expect(store.wallpaper).toBe(DEFAULT_WALLPAPER)

    store.setWallpaper(CHILD_WALLPAPERS[3].css, 9, true)
    expect(store.wallpaper).toBe(CHILD_WALLPAPERS[3].css)

    window.localStorage.setItem('lingolearn_learner_wallpaper:9', WALLPAPERS[1].css)
    store.loadWallpaperFor(9, true)
    expect(store.wallpaper).toBe(DEFAULT_CHILD_WALLPAPER)
  })

  it('remembers the Explore level for the same learner only', () => {
    const store = learnerExperienceStore()
    store.rememberExploreLevel(7, 3)
    expect(store.rememberedExploreLevel(7)).toBe(3)
    expect(store.rememberedExploreLevel(8)).toBeNull()
  })

})
