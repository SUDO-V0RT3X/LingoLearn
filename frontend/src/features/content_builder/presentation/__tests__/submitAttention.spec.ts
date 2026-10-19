import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ContentSubmitScreen from '../ContentSubmitScreen.vue'
import { contentBuilderScreenState } from '../state'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'

const text = (title: string, body: string) => new $ContentBlock(ContentBlockTypes.text, { title, text: body })
const choice = (options: string[], correctOption = 0) =>
    new $ContentBlock(ContentBlockTypes.multipleChoice, { title: 'Greetings', question: 'Hello?', options, correctOption })

function makeRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/content-builder', name: 'contentBuilder', component: { template: '<div />' } },
            { path: '/content-builder/submit', name: 'contentSubmit', component: { template: '<div />' } },
        ],
    })
}

//Mounts the submit screen on a draft whose details are all set, so only the blocks decide.
async function mountWith(pages: $ContentBlock[][]) {
    const router = makeRouter()
    router.push('/content-builder/submit')
    await router.isReady()
    const state = contentBuilderScreenState()
    state.contentState = pages
    state.page = 0
    state.title = 'Saying hello'
    state.language = 'zulu'
    state.level = 1
    state.audience = 'general'
    state.availableTags = ['travel']
    state.assignedTheme = 'travel'
    state.chosenTags = ['travel']
    const wrapper = mount(ContentSubmitScreen, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return { wrapper, state }
}

const submitButton = (wrapper: Awaited<ReturnType<typeof mountWith>>['wrapper']) =>
    wrapper.findAll('button').find(b => b.text() === 'Submit for review')!

beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(TaxonomyDataSource, 'getTags').mockResolvedValue(new $DataSourceResponse([{ id: 1, name: 'travel', tagType: 'theme' }] as never, null))
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => { run(); return 0 })
})

describe('the submit screen points at what is unfinished', () => {
    it('nominal: an unanswerable question is outlined and says what it needs', async () => {
        const { wrapper } = await mountWith([[text('Sawubona', 'Unjani?'), choice(['Yebo', 'yebo'])]])
        const blocks = wrapper.findAll('.preview__block')
        expect(blocks[0].classes()).not.toContain('is-incomplete')
        expect(blocks[1].classes()).toContain('is-incomplete')
        expect(blocks[1].text()).toContain('Write the question and at least two different answers')
        wrapper.unmount()
    })

    it('pressing Submit too early sends nothing, shakes the unfinished parts and says why', async () => {
        const submit = vi.spyOn(ContentDataSource, 'submitContent')
        const { wrapper, state } = await mountWith([[choice(['Yebo', ''])]])
        expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()
        expect(submitButton(wrapper).attributes('aria-disabled')).toBe('true')

        await submitButton(wrapper).trigger('click')
        await flushPromises()

        expect(submit).not.toHaveBeenCalled()
        expect(state.status).toBe('draft')
        expect(wrapper.find('main').classes()).toContain('submit--shaking')
        expect(wrapper.find('[role="alert"]').text()).toBe('Fix the parts marked in red, then submit.')
        wrapper.unmount()
    })

    it('an empty detail turns red only once the author has tried to submit', async () => {
        const { wrapper, state } = await mountWith([[text('Sawubona', 'Unjani?')]])
        state.level = null
        await flushPromises()
        const levelCard = () => wrapper.find('[data-check="level"]')
        expect(levelCard().classes()).toContain('is-incomplete')
        expect(wrapper.find('main').classes()).not.toContain('submit--tried')

        await submitButton(wrapper).trigger('click')
        await flushPromises()
        expect(wrapper.find('main').classes()).toContain('submit--tried')
        wrapper.unmount()
    })

    it('a failed check in the list is a button that leads to its block', async () => {
        const { wrapper } = await mountWith([[choice(['Yebo', ''])]])
        const jump = wrapper.findAll('.check__jump')
        expect(jump.map(b => b.text())).toEqual(['Every multiple choice question is answerable'])
        await jump[0].trigger('click')
        await flushPromises()
        expect(wrapper.find('main').classes()).toContain('submit--shaking')
        wrapper.unmount()
    })

    it('a ready draft has no red and submits as before', async () => {
        vi.spyOn(ContentDataSource, 'submitContent').mockResolvedValue(new $DataSourceResponse(null, null) as never)
        const { wrapper } = await mountWith([[choice(['Yebo', 'Cha'])]])
        expect(wrapper.findAll('.is-incomplete')).toHaveLength(0)
        expect(submitButton(wrapper).attributes('aria-disabled')).toBe('false')
        wrapper.unmount()
    })
})
