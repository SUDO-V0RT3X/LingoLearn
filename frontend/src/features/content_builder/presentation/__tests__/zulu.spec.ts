import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n'
import ContentBuilderScreen from '../ContentBuilderScreen.vue'
import ContentSubmitScreen from '../ContentSubmitScreen.vue'
import BlockMux from '../components/BlockMux.vue'
import ContentTypeImageBar from '../components/ContentTypeImageBar.vue'
import ContentTypeFillBlankBar from '../components/ContentTypeFillBlankBar.vue'
import ContentTypeMultipleChoiceBar from '../components/ContentTypeMultipleChoiceBar.vue'
import { contentBuilderScreenState } from '../state'
import { submissionChecks } from '@/features/content_builder/functions/submission'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes, type $ContentRecord } from '@/features/shared/models/contentType'

const text = (title: string, body: string) => new $ContentBlock(ContentBlockTypes.text, { title, text: body })
const refused = (message: string) =>
    new $DataSourceResponse<$ContentRecord>(null, new Exception({ exceptionType: ExceptionType.BAD_REQUEST, message, statusCode: 400 }))

function makeRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/content-builder', name: 'contentBuilder', component: { template: '<div />' } },
            { path: '/content-builder/:contentId', name: 'contentBuilderDraft', component: { template: '<div />' } },
            { path: '/content-builder/submit', name: 'contentSubmit', component: { template: '<div />' } },
        ],
    })
}

async function mountScreen(screen: typeof ContentBuilderScreen | typeof ContentSubmitScreen, pages: $ContentBlock[][]) {
    const router = makeRouter()
    router.push('/content-builder')
    await router.isReady()
    const state = contentBuilderScreenState()
    state.contentState = pages
    state.page = 0
    const wrapper = mount(screen, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, state }
}

beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(TaxonomyDataSource, 'getTags').mockResolvedValue(new $DataSourceResponse([], null))
    i18n.global.locale.value = 'zulu'
})

describe('the builder in isiZulu', () => {
    it('nominal: the header, pages, blocks and palette read in isiZulu', async () => {
        const pending = new $ContentBlock(ContentBlockTypes.pendingSelection, {})
        const { wrapper } = await mountScreen(ContentBuilderScreen, [[text('Sawubona', 'Unjani?'), pending]])
        const page = wrapper.text()
        expect(page).toContain('Ukwakha okuqukethwe')
        expect(page).toContain('Susa okusalungiswa')
        expect(page).toContain('Thumela kubuyekezwe')
        expect(page).toContain('Ikhasi 1')
        expect(page).toContain('amabhulokhi angu-2')
        expect(page).toContain('Khetha uhlobo lwebhulokhi')
        expect(page).toContain('Imibuzo')
        expect(page).toContain('Ukukhetha okuningi')
        expect(page).not.toContain('Delete draft')
        expect(page).not.toContain('Add block')
        expect(page).not.toContain('Multiple Choice')
        expect(wrapper.find('.builder__titleInput').attributes('placeholder')).toBe('Okusalungiswa okungenasihloko')
    })

    it('follows the interface language when it changes on screen', async () => {
        const { wrapper } = await mountScreen(ContentBuilderScreen, [[text('Sawubona', 'Unjani?')]])
        i18n.global.locale.value = 'english'
        await nextTick()
        expect(wrapper.text()).toContain('Delete draft')
        expect(wrapper.text()).not.toContain('Susa okusalungiswa')
    })

    it('a reason the server gives for refusing a save is shown in isiZulu', async () => {
        vi.spyOn(ContentDataSource, 'createContent')
            .mockResolvedValue(refused('text in a block can be at most 2000 characters'))
        const { wrapper, state } = await mountScreen(ContentBuilderScreen, [[text('Sawubona', 'Unjani?')]])
        state.setTitle('Ukubingelela')
        await state.save()
        await nextTick()
        expect(wrapper.find('[role="alert"]').text()).toBe('Umbhalo osebhulokhini ungaba nezinhlamvu ezingu-2000 kuphela')
    })

    it('a save that fails without a reason reads the isiZulu fallback', async () => {
        vi.spyOn(ContentDataSource, 'createContent').mockResolvedValue(
            new $DataSourceResponse<$ContentRecord>(null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'offline', statusCode: 0 })))
        const state = contentBuilderScreenState()
        state.setTitle('Ukubingelela')
        await state.save()
        expect(state.savingError?.message).toBe('Asikwazanga ukulondoloza lokhu okusalungiswa')
    })
})

describe('the submit screen in isiZulu', () => {
    it('nominal: checks, pickers and hints read in isiZulu', async () => {
        const { wrapper } = await mountScreen(ContentSubmitScreen, [[text('Sawubona', 'Unjani?')]])
        const page = wrapper.text()
        expect(page).toContain('Isihloko sibhaliwe')
        expect(page).toContain('Inani lomaka alidluli ku-10')
        expect(page).toContain('Umusho ngamunye une-[] eyodwa')
        expect(page).toContain('Izinga 1')
        expect(page).toContain('isiZulu')
        expect(page).toContain('Kulungele izingane')
        expect(page).toContain('Indaba')
        expect(page).toContain('Umbhalo')
        expect(page).not.toContain('Title written')
        expect(page).not.toContain('Submit for review')
        expect(page).not.toContain('Level 1')
    })

    it('a draft not ready to submit says why in isiZulu', async () => {
        const state = contentBuilderScreenState()
        state.contentState = [[text('Sawubona', 'Unjani?')]]
        await state.submit()
        expect(state.submittingError?.message).toContain('Akukakulungeli ukuthunyelwa')
        expect(state.submittingError?.message).toContain('ulimi lukhethiwe')
    })

    it('the check labels follow the locale, while their keys stay the same', () => {
        const details = { title: '', language: null, level: null }
        const zulu = submissionChecks([[]], details)
        i18n.global.locale.value = 'english'
        const english = submissionChecks([[]], details)
        expect(zulu.map(c => c.key)).toEqual(english.map(c => c.key))
        expect(zulu[0].label).toBe('Isihloko sibhaliwe')
        expect(english[0].label).toBe('Title written')
    })
})

describe('the block editors in isiZulu', () => {
    it('the type picker names each type in isiZulu', () => {
        const state = contentBuilderScreenState()
        state.contentState = [[new $ContentBlock(ContentBlockTypes.pendingSelection, {})]]
        state.page = 0
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        expect(mux.text()).toContain('Khetha uhlobo')
        expect(mux.findAll('.blockOption').map(o => o.text()))
            .toEqual(['Umbhalo', 'Isithombe', 'Umsindo', 'Ukukhetha okuningi', 'Gcwalisa isikhala', 'Lalela ukhethe'])
    })

    it('a multiple choice question in editing and read only reads in isiZulu', () => {
        const editing = mount(ContentTypeMultipleChoiceBar, { props: { editable: true } })
        expect(editing.text()).toContain('Izimpendulo')
        expect(editing.text()).toContain('Engeza impendulo')
        expect(editing.find('.choiceOption__input').attributes('placeholder')).toBe('Impendulo 1')
        const reading = mount(ContentTypeMultipleChoiceBar, { props: { editable: false } })
        expect(reading.text()).toContain('Umbuzo ongenasihloko')
        expect(reading.text()).not.toContain('Untitled question')
    })

    it('the fill in the blank hint keeps the marker inside the isiZulu sentence', () => {
        const bar = mount(ContentTypeFillBlankBar, { props: { editable: true } })
        expect(bar.find('.blankBlock__hint').text()).toBe('Bhala u-[] emushweni lapho igama elishodayo lingena khona.')
        expect(bar.find('.blankBlock__hint code').text()).toBe('[]')
    })

    it('an upload the server refuses shows its reason in isiZulu', async () => {
        vi.spyOn(MediaDataSource, 'uploadImage').mockResolvedValue({
            data: null,
            error: new Exception({ exceptionType: ExceptionType.BAD_REQUEST, message: 'The file content is not the image type its name and type claim.', statusCode: 400 }),
        } as never)
        const bar = mount(ContentTypeImageBar, { props: { editable: true } })
        expect(bar.text()).toContain('Khetha isithombe')
        const input = bar.find('input[type="file"]')
        const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'phone.png', { type: 'image/png' })
        Object.defineProperty(input.element, 'files', { value: [file] })
        await input.trigger('change')
        await flushPromises()
        expect(bar.find('[role="alert"]').text()).toContain('akuhambisani nohlobo lwesithombe')
    })
})
