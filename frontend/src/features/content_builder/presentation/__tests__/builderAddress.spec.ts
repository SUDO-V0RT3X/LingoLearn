import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
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
    ({ contentId: 9, authorId: 3, title: 'Greetings in isiZulu', language: 'zulu', childFriendly: false, status: 'draft',
       version: 0, level: null, chosenTags: [], kind: 'story', content: [[text('Sawubona', 'Hello')]],
       updatedAt: '2026-09-27T10:00:00.000Z', submittedAt: null, ...over })

//The builder's real addresses, with the builder mounted behind a RouterView the way
//the app mounts it, so moving between addresses reuses the same screen.
function makeRouter() {
    const elsewhere = { template: '<div class="elsewhere" />' }
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/content-builder', name: 'contentBuilder', component: ContentBuilderScreen },
            { path: '/content-builder/:contentId(\\d+)', name: 'contentBuilderDraft', component: ContentBuilderScreen },
            { path: '/content-builder/submit', name: 'contentSubmit', component: elsewhere },
            { path: '/dashboard', name: 'authorDashboard', component: elsewhere },
        ],
    })
}

async function openAt(path: string, setUp: (state: ReturnType<typeof contentBuilderScreenState>) => void = () => {}) {
    const router = makeRouter()
    const state = contentBuilderScreenState()
    setUp(state)
    router.push(path)
    await router.isReady()
    mount(defineComponent({ components: { RouterView }, template: '<RouterView />' }), { global: { plugins: [router] } })
    await flushPromises()
    return { router, state }
}

//A draft that has been saved as 9 and is still open in the builder.
const savedDraftNine = (state: ReturnType<typeof contentBuilderScreenState>) => {
    state.contentId = 9
    state.title = 'Greetings in isiZulu'
    state.contentState = [[text('Sawubona', 'Hello')]]
    state.page = 0
}

let getContent: MockInstance<typeof ContentDataSource.getContent>

beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    //Loading content also looks up the moderator's decisions on it; none by default.
    vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(new $DataSourceResponse([], null) as never)
    vi.spyOn(TaxonomyDataSource, 'getTags').mockResolvedValue(new $DataSourceResponse([], null) as never)
    getContent = vi.spyOn(ContentDataSource, 'getContent')
        .mockImplementation(async id => new $DataSourceResponse(record({ contentId: id }), null))
})

describe('starting new content', () => {
    it('"+ New content" after editing a saved draft opens an empty draft, not the old one', async () => {
        const { router, state } = await openAt('/content-builder/9', savedDraftNine)
        await router.push({ name: 'contentBuilder', query: { new: '1' } })
        await flushPromises()

        expect(state.contentId).toBeNull()
        expect(state.title).toBe('')
        expect(state.contentState.flat()).toHaveLength(0)
        expect(router.currentRoute.value.fullPath).toBe('/content-builder')
    })

    it('saving that new draft creates it rather than editing the old one', async () => {
        const create = vi.spyOn(ContentDataSource, 'createContent')
            .mockImplementation(async draft => new $DataSourceResponse(record({ contentId: 10, ...draft }), null))
        const edit = vi.spyOn(ContentDataSource, 'editContent')
        const { router, state } = await openAt('/content-builder/9', savedDraftNine)
        await router.push({ name: 'contentBuilder', query: { new: '1' } })
        await flushPromises()

        state.contentState = [[text('Umbhalo omusha', 'A new lesson')]]
        await state.save()
        await flushPromises()
        expect(create).toHaveBeenCalledOnce()
        expect(edit).not.toHaveBeenCalled()
        expect(router.currentRoute.value.fullPath).toBe('/content-builder/10')
    })
})

describe('the address names the draft on screen', () => {
    it('plain /content-builder with unsaved changes in progress shows that draft\'s id, without reloading it', async () => {
        const { router, state } = await openAt('/content-builder', s => { savedDraftNine(s); s.setTitle('Greetings, changed') })
        expect(router.currentRoute.value.fullPath).toBe('/content-builder/9')
        expect(state.title).toBe('Greetings, changed')
        expect(getContent).not.toHaveBeenCalled()
    })

    it('the first save of a new draft puts its id in the address', async () => {
        vi.spyOn(ContentDataSource, 'createContent')
            .mockImplementation(async draft => new $DataSourceResponse(record({ contentId: 10, ...draft }), null))
        const { router, state } = await openAt('/content-builder')
        state.contentState = [[text('Sawubona', 'Hello')]]
        await state.save()
        await flushPromises()
        expect(router.currentRoute.value.fullPath).toBe('/content-builder/10')
        expect(getContent).not.toHaveBeenCalled()
    })

    it('deleting a reopened draft takes its id out of the address', async () => {
        vi.spyOn(ContentDataSource, 'deleteContent').mockResolvedValue(new $DataSourceResponse(null, null) as never)
        const { router, state } = await openAt('/content-builder/9', savedDraftNine)
        await state.deleteDraft()
        await flushPromises()
        expect(state.contentId).toBeNull()
        expect(router.currentRoute.value.fullPath).toBe('/content-builder')
    })

    it('opening another draft by its address loads that draft', async () => {
        const { router } = await openAt('/content-builder/9', savedDraftNine)
        await router.push('/content-builder/12')
        await flushPromises()
        expect(getContent).toHaveBeenCalledWith(12)
    })
})

describe('carrying on with the same draft', () => {
    it('coming back from the submit screen keeps the draft', async () => {
        const { router, state } = await openAt('/content-builder/9', savedDraftNine)
        await router.push({ name: 'contentSubmit' })
        await router.push({ name: 'contentBuilder' })
        await flushPromises()
        expect(state.contentId).toBe(9)
        expect(state.title).toBe('Greetings in isiZulu')
        expect(router.currentRoute.value.fullPath).toBe('/content-builder/9')
    })

    it('leaving for another screen is not pulled back to the builder', async () => {
        const { router } = await openAt('/content-builder', savedDraftNine)
        await router.push({ name: 'contentSubmit' })
        await flushPromises()
        expect(router.currentRoute.value.name).toBe('contentSubmit')
        await router.push({ name: 'authorDashboard' })
        await flushPromises()
        expect(router.currentRoute.value.name).toBe('authorDashboard')
    })

    it('an unsaved new draft is kept when coming back to /content-builder', async () => {
        const { router, state } = await openAt('/content-builder')
        state.contentState = [[text('Sawubona', 'Hello')]]
        await router.push({ name: 'contentSubmit' })
        await router.push({ name: 'contentBuilder' })
        await flushPromises()
        expect(state.contentState.flat()).toHaveLength(1)
        expect(router.currentRoute.value.fullPath).toBe('/content-builder')
    })
})
