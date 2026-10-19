// The details an author picks on the submit screen (level, theme, tags, audience)
// survive going back to the builder and saving, and a reload of the draft.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ContentBuilderScreen from '../ContentBuilderScreen.vue'
import { contentBuilderScreenState } from '../state'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { $ContentBlock, ContentBlockTypes, type $ContentRecord } from '@/features/shared/models/contentType'

const text = (title: string, body: string) => new $ContentBlock(ContentBlockTypes.text, { title, text: body })

const record = (over: Partial<$ContentRecord> = {}): $ContentRecord =>
    ({ contentId: 1, authorId: 3, title: '', language: null, childFriendly: false, status: 'draft', version: 0, level: null,
       chosenTags: [], kind: 'story', content: [[]], updatedAt: '2026-10-17T10:00:00.000Z', submittedAt: null, ...over })
const ok = (data: $ContentRecord) => new $DataSourceResponse(data, null)

//Stands in for the backend, which stores what a draft save sends and returns it:
//childFriendly as a flag, the tags in the order given. The audience is not stored.
function mockServer() {
    const create = vi.spyOn(ContentDataSource, 'createContent')
        .mockImplementation(async draft => ok(record({ contentId: 7, ...draft })))
    const edit = vi.spyOn(ContentDataSource, 'editContent')
        .mockImplementation(async (contentId, draft) => ok(record({ contentId, ...draft })))
    const send = vi.spyOn(ContentDataSource, 'submitContent')
        .mockImplementation(async (contentId, s) => ok(record({ contentId, status: 'pending', ...s })))
    return { create, edit, send }
}

//A draft with pages and a title, the way the builder leaves it before Submit.
function draftInBuilder() {
    const state = contentBuilderScreenState()
    state.availableTags = ['travel', 'food', 'greetings', 'weather']
    state.contentState = [[text('Greetings', 'Hola')]]
    state.page = 0
    state.setTitle('Saying hello')
    return state
}

//What the author picks on the submit screen before pressing Back to builder.
function pickDetails(state: ReturnType<typeof contentBuilderScreenState>) {
    state.setLanguage('english')
    state.setAudience('child-friendly')
    state.setLevel(3)
    state.setAssignedTheme('greetings')
    state.toggleSupplementaryTag('food')
    state.toggleSupplementaryTag('travel')
}

beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    //Loading content also looks up the moderator's decisions on it; none by default.
    vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(new $DataSourceResponse([], null) as never)
})

describe('saving a draft sends the submit screen\'s details', () => {
    it('nominal: the first save sends the level and the tags, theme first', async () => {
        const { create } = mockServer()
        const state = draftInBuilder()
        pickDetails(state)
        await state.save()
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            language: 'english', childFriendly: true, level: 3, chosenTags: ['greetings', 'food', 'travel'],
        }))
    })

    it('a later save sends them too', async () => {
        const { edit } = mockServer()
        const state = draftInBuilder()
        state.contentId = 4
        pickDetails(state)
        await state.save()
        expect(edit).toHaveBeenCalledWith(4, expect.objectContaining({
            level: 3, chosenTags: ['greetings', 'food', 'travel'],
        }))
    })

    it('a draft with nothing picked yet sends no level and no tags', async () => {
        const { create } = mockServer()
        await draftInBuilder().save()
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ level: null, chosenTags: [] }))
    })

    it('the tags sent are a copy, so a later pick does not change a save in flight', async () => {
        const { create } = mockServer()
        const state = draftInBuilder()
        pickDetails(state)
        await state.save()
        state.toggleSupplementaryTag('weather')
        expect(create.mock.calls[0][0].chosenTags).toEqual(['greetings', 'food', 'travel'])
    })

    it('submitting a draft never saved creates it with its details first', async () => {
        const { create, send } = mockServer()
        const state = draftInBuilder()
        pickDetails(state)
        await state.submit()
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ level: 3, chosenTags: ['greetings', 'food', 'travel'] }))
        expect(send).toHaveBeenCalledWith(7, expect.objectContaining({ chosenTags: ['greetings', 'food', 'travel'] }))
    })
})

describe('Back to builder, Save, then Submit again loses nothing', () => {
    it('nominal: the level, theme, extra tags, audience and language are all still picked', async () => {
        mockServer()
        const state = draftInBuilder()
        pickDetails(state)
        await state.save()
        expect(state.level).toBe(3)
        expect(state.assignedTheme).toBe('greetings')
        expect(state.chosenTags).toEqual(['greetings', 'food', 'travel'])
        expect(state.audience).toBe('child-friendly')
        expect(state.language).toBe('english')
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('an audience never picked stays unpicked rather than becoming general', async () => {
        mockServer()
        const state = draftInBuilder()
        state.setLevel(2)
        await state.save()
        expect(state.audience).toBeNull()
        expect(state.childFriendly).toBe(false)
    })

    it('general stays general, and child-friendly stays child-friendly', async () => {
        mockServer()
        const state = draftInBuilder()
        state.setAudience('general')
        await state.save()
        expect(state.audience).toBe('general')
        state.setAudience('child-friendly')
        await state.save()
        expect(state.audience).toBe('child-friendly')
    })

    it('extra tags with no theme picked do not turn the first of them into the theme', async () => {
        mockServer()
        const state = draftInBuilder()
        state.toggleSupplementaryTag('food')
        await state.save()
        expect(state.chosenTags).toEqual(['food'])
        expect(state.assignedTheme).toBeNull()
    })

    it('a failed save keeps every pick as it was', async () => {
        vi.spyOn(ContentDataSource, 'createContent').mockResolvedValue(new $DataSourceResponse<$ContentRecord>(null, null))
        const state = draftInBuilder()
        pickDetails(state)
        await state.save()
        expect(state.savingError).not.toBeNull()
        expect(state).toMatchObject({ level: 3, assignedTheme: 'greetings', audience: 'child-friendly' })
        expect(state.hasUnsavedChange).toBe(true)
    })
})

describe('reading the details back from the server', () => {
    it('loading a draft makes its first tag the theme and the rest extra tags', async () => {
        vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(ok(record({
            contentId: 5, level: 3, chosenTags: ['weather', 'food'], childFriendly: false,
        })))
        const state = contentBuilderScreenState()
        await state.loadDraft(5)
        expect(state.level).toBe(3)
        expect(state.assignedTheme).toBe('weather')
        expect(state.chosenTags).toEqual(['weather', 'food'])
        //Only the flag is stored, so a loaded draft reads it as an audience.
        expect(state.audience).toBe('general')
    })

    it('boundary: a draft with no tags loads with no theme', () => {
        const state = contentBuilderScreenState()
        state.applyRecord(record({ chosenTags: [], childFriendly: true }))
        expect(state.assignedTheme).toBeNull()
        expect(state.audience).toBe('child-friendly')
    })
})

describe('the submit screen\'s picks are changes to save', () => {
    it('choosing a level marks the draft unsaved, so Save is offered', () => {
        const state = draftInBuilder()
        state.hasUnsavedChange = false
        state.setLevel(4)
        expect(state.hasUnsavedChange).toBe(true)
    })

    it('adding or removing a tag marks the draft unsaved', () => {
        const state = draftInBuilder()
        state.hasUnsavedChange = false
        state.addChosenTag('travel')
        expect(state.hasUnsavedChange).toBe(true)
        state.hasUnsavedChange = false
        state.removeChosenTag('travel')
        expect(state.hasUnsavedChange).toBe(true)
    })

    it('removing a tag that was not chosen changes nothing', () => {
        const state = draftInBuilder()
        state.hasUnsavedChange = false
        state.removeChosenTag('travel')
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('a tag added as the theme goes first, ahead of extra tags already chosen', () => {
        const state = draftInBuilder()
        state.toggleSupplementaryTag('food')
        state.addChosenTag('travel')
        expect(state.assignedTheme).toBe('travel')
        expect(state.chosenTags).toEqual(['travel', 'food'])
    })
})

describe('the Back to builder button', () => {
    function makeRouter() {
        const elsewhere = { template: '<div class="elsewhere" />' }
        return createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/content-builder', name: 'contentBuilder', component: ContentBuilderScreen },
                { path: '/content-builder/:contentId(\\d+)', name: 'contentBuilderDraft', component: ContentBuilderScreen },
                { path: '/content-builder/submit', name: 'contentSubmit', component: elsewhere },
            ],
        })
    }

    async function openAt(path: string, setUp: (state: ReturnType<typeof contentBuilderScreenState>) => void) {
        //The builder loads the theme tags when it opens, and the submit screen offers those.
        const themes = ['greetings', 'food'].map(name => ({ name }))
        vi.spyOn(TaxonomyDataSource, 'getTags').mockResolvedValue(new $DataSourceResponse(themes, null) as never)
        const router = makeRouter()
        const state = contentBuilderScreenState()
        setUp(state)
        router.push(path)
        await router.isReady()
        mount(defineComponent({ components: { RouterView }, template: '<RouterView />' }), { global: { plugins: [router] } })
        await flushPromises()
        return { router, state }
    }

    it('returns to a saved draft without loading it again, so every pick stays', async () => {
        const getContent = vi.spyOn(ContentDataSource, 'getContent')
            .mockResolvedValue(ok(record({ contentId: 9, content: [[text('Greetings', 'Hola')]] })))
        const { router, state } = await openAt('/content-builder/9', state => {
            state.contentId = 9
            state.contentState = [[text('Greetings', 'Hola')]]
        })
        //Opening it by its address refreshed it once; going back must not load it again.
        getContent.mockClear()
        await router.push({ name: 'contentSubmit' })
        pickDetails(state)
        await router.push({ name: 'contentBuilder' })
        await flushPromises()

        expect(getContent).not.toHaveBeenCalled()
        expect(router.currentRoute.value.fullPath).toBe('/content-builder/9')
        expect(state).toMatchObject({ level: 3, assignedTheme: 'greetings', audience: 'child-friendly', language: 'english' })
        expect(state.chosenTags).toEqual(['greetings', 'food'])
    })

    it('returns to a draft never saved without clearing it', async () => {
        const getContent = vi.spyOn(ContentDataSource, 'getContent')
        const { router, state } = await openAt('/content-builder', state => {
            state.contentState = [[text('Greetings', 'Hola')]]
        })
        await router.push({ name: 'contentSubmit' })
        state.setLevel(5)
        state.setAssignedTheme('greetings')
        await router.push({ name: 'contentBuilder' })
        await flushPromises()

        expect(getContent).not.toHaveBeenCalled()
        expect(state).toMatchObject({ contentId: null, level: 5, assignedTheme: 'greetings' })
        expect(state.contentState.flat()).toHaveLength(1)
    })
})
