import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ContentBuilderScreen from '../ContentBuilderScreen.vue'
import { contentBuilderScreenState } from '../state'
import { authStore } from '@/features/auth_feature/state/authStore'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'

const text = (title: string, body: string) => new $ContentBlock(ContentBlockTypes.text, { title, text: body })
const audio = () => new $ContentBlock(ContentBlockTypes.audio,
    { title: 'Clip', fileUrl: '/uploads/audio/clip.mp3', transcript: 'Sawubona' })

function makeRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/content-builder', name: 'contentBuilder', component: { template: '<div />' } },
            { path: '/content-builder/submit', name: 'contentSubmit', component: { template: '<div />' } },
        ],
    })
}

//The builder with a draft already open, mounted on the memory router.
async function mountBuilder(pages: $ContentBlock[][] = [[text('Greetings', 'Sawubona')]]) {
    const router = makeRouter()
    router.push('/content-builder')
    await router.isReady()

    const state = contentBuilderScreenState()
    state.contentState = pages
    state.page = 0
    state.title = 'Saying hello'

    const wrapper = mount(ContentBuilderScreen, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, state }
}

const previewButton = (wrapper: Awaited<ReturnType<typeof mountBuilder>>['wrapper']) =>
    wrapper.findAll('button').find(button => button.text() === 'Preview' || button.text() === 'Back to editing')!

beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
    //The builder loads the tag vocabulary when it opens; this screen's tests are
    //about the preview, so the call is answered here instead of over the network.
    vi.restoreAllMocks()
    vi.spyOn(TaxonomyDataSource, 'getTags').mockResolvedValue(new $DataSourceResponse([], null))
})

describe('author preview', () => {
    it('nominal: shows the draft in the learner\'s own reader, with its title and the author', async () => {
        const auth = authStore()
        auth.currentUser = { id: 3, username: null, firstName: 'Ana', lastName: 'Author',
                             name: 'Ana Author', email: 'ana@example.test', role: 'author',
                             requiresGuardianLink: false }

        const { wrapper } = await mountBuilder()
        await previewButton(wrapper).trigger('click')

        const preview = wrapper.find('[aria-label="Learner preview"]')
        expect(preview.exists()).toBe(true)
        expect(preview.find('.document-viewer').exists()).toBe(true)
        expect(preview.text()).toContain('Saying hello')
        expect(preview.text()).toContain('by Ana Author')
        expect(preview.text()).toContain('Sawubona')
    })

    it('hides the editor while previewing, and brings it back', async () => {
        const { wrapper } = await mountBuilder()
        expect(wrapper.find('.builder__split').exists()).toBe(true)

        await previewButton(wrapper).trigger('click')
        expect(wrapper.find('.builder__split').exists()).toBe(false)
        expect(previewButton(wrapper).text()).toBe('Back to editing')

        await previewButton(wrapper).trigger('click')
        expect(wrapper.find('.builder__split').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Learner preview"]').exists()).toBe(false)
    })

    it('closes the open block first, so the preview never shows a half-edited one', async () => {
        const { wrapper, state } = await mountBuilder()
        state.selectBlock(0)
        expect(state.inspectedBlock).toBe(0)

        await previewButton(wrapper).trigger('click')
        expect(state.inspectedBlock).toBe(-1)
    })

    it('boundary: there is nothing to preview until a block exists', async () => {
        const { wrapper } = await mountBuilder([[]])
        expect(previewButton(wrapper).attributes('disabled')).toBeDefined()

        await previewButton(wrapper).trigger('click')
        expect(wrapper.find('[aria-label="Learner preview"]').exists()).toBe(false)
    })

    it('an untitled draft previews under the same placeholder the builder shows', async () => {
        const { wrapper, state } = await mountBuilder()
        state.title = ''
        await previewButton(wrapper).trigger('click')
        expect(wrapper.find('[aria-label="Learner preview"]').text()).toContain('Untitled draft')
    })

    it('a locked draft can still be previewed, because reading changes nothing', async () => {
        const { wrapper, state } = await mountBuilder([[text('Greetings', 'Sawubona'), audio()]])
        state.status = 'pending'
        await flushPromises()

        expect(previewButton(wrapper).attributes('disabled')).toBeUndefined()
        await previewButton(wrapper).trigger('click')
        expect(wrapper.find('.document-viewer').exists()).toBe(true)
    })

    it('pages are turned in the preview exactly as a learner turns them', async () => {
        const { wrapper } = await mountBuilder([[text('Page one', 'First')], [text('Page two', 'Second')]])
        await previewButton(wrapper).trigger('click')

        const preview = wrapper.find('[aria-label="Learner preview"]')
        expect(preview.text()).toContain('First')
        expect(preview.text()).not.toContain('Second')

        const next = preview.findAll('button').find(button => button.text().toLowerCase().includes('next'))!
        await next.trigger('click')
        expect(preview.text()).toContain('Second')
    })
})
