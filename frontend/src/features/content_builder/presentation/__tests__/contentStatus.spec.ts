// What the builder shows for each status, and rejected content: it opens as rejected
// with the moderator's reason, can be edited (which reopens it as a draft) and sent again.
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ContentBuilderScreen from '../ContentBuilderScreen.vue'
import { contentBuilderScreenState } from '../state'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource'
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { $ContentBlock, ContentBlockTypes, type $ContentRecord, type ContentStatus } from '@/features/shared/models/contentType'
import type { AuthorFeedbackRow } from '@/features/review_detail_feature/models/ReviewDetailTypes'
import { i18n } from '@/i18n'

const text = (title: string, body: string) => new $ContentBlock(ContentBlockTypes.text, { title, text: body })

const record = (over: Partial<$ContentRecord> = {}): $ContentRecord =>
    ({ contentId: 9, authorId: 3, title: 'Market day', language: 'english', childFriendly: true, status: 'draft',
       version: 1, level: 1, chosenTags: ['food'], kind: 'story', content: [[text('At the market', 'Fruit and bread')]],
       updatedAt: '2026-10-17T10:00:00.000Z', submittedAt: '2026-10-16T10:00:00.000Z', ...over })
const ok = <T>(data: T) => new $DataSourceResponse(data, null)

const REASON = 'Vocabulary is too advanced for level 1. Please simplify.'
const decision = (over: Partial<AuthorFeedbackRow> = {}): AuthorFeedbackRow =>
    ({ contentId: 9, title: 'Market day', decision: 'rejected', reason: REASON, moderator: 'One Moderator',
       decidedAt: '2026-10-17T09:00:00.000Z', ...over })

function makeRouter() {
    const elsewhere = { template: '<div class="elsewhere" />' }
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/content-builder', name: 'contentBuilder', component: ContentBuilderScreen },
            { path: '/content-builder/:contentId(\\d+)', name: 'contentBuilderDraft', component: ContentBuilderScreen },
            { path: '/content-builder/submit', name: 'contentSubmit', component: elsewhere },
            { path: '/author-dashboard', name: 'authorDashboard', component: elsewhere },
        ],
    })
}

async function openAt(path: string, setUp: (state: ReturnType<typeof contentBuilderScreenState>) => void = () => {}) {
    const router = makeRouter()
    const state = contentBuilderScreenState()
    setUp(state)
    router.push(path)
    await router.isReady()
    const wrapper = mount(defineComponent({ components: { RouterView }, template: '<RouterView />' }),
        { global: { plugins: [router] } })
    await flushPromises()
    return { router, state, wrapper }
}

const badge = (wrapper: VueWrapper) => wrapper.get('.builder__titleRow [data-testid="status-badge"]')
const titleInput = (wrapper: VueWrapper) => wrapper.get('.builder__titleInput').element as HTMLInputElement
const button = (wrapper: VueWrapper, label: string) =>
    wrapper.findAll('.builder__actions button').find(b => b.text() === label)

enableAutoUnmount(afterEach)

let getContent: MockInstance<typeof ContentDataSource.getContent>
let getMyFeedback: MockInstance<typeof ReviewDetailDataSource.getMyFeedback>

beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(TaxonomyDataSource, 'getTags').mockResolvedValue(ok([]) as never)
    getContent = vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(ok(record({ status: 'rejected' })))
    getMyFeedback = vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(ok([
        decision({ contentId: 4, reason: 'Another piece of content' }),
        decision({ decision: 'approved', reason: '', decidedAt: '2026-10-01T09:00:00.000Z' }),
        decision(),
    ]))
})

describe('bug #6: content a moderator sent back opens as rejected and editable', () => {
    it('content submitted earlier in the session and since rejected is loaded again, not shown as pending', async () => {
        //The builder still holds content 9 as it was when the author submitted it.
        const { state, wrapper } = await openAt('/content-builder/9', s => {
            s.applyRecord(record({ status: 'pending' }))
            s.page = 0
        })

        expect(getContent).toHaveBeenCalledWith(9)
        expect(state.status).toBe('rejected')
        expect(badge(wrapper).text()).toBe('Rejected')
        expect(badge(wrapper).classes()).toContain('ui-badge--danger')
        expect(wrapper.find('[data-testid="locked-notice"]').exists()).toBe(false)
        expect(titleInput(wrapper).disabled).toBe(false)
        expect(button(wrapper, 'Resubmit for review')?.attributes('disabled')).toBeUndefined()
    })

    it("shows the moderator's reason, who sent it back and what to do next", async () => {
        const { wrapper } = await openAt('/content-builder/9')
        const feedback = wrapper.get('[data-testid="rejection-feedback"]')
        expect(feedback.text()).toContain("Moderator's feedback")
        expect(feedback.text()).toContain(REASON)
        expect(feedback.text()).not.toContain('Another piece of content')
        expect(feedback.text()).toContain('Sent back by One Moderator')
        expect(feedback.text()).toContain('saving reopens it as a draft')
    })

    it('a rejection left without a reason says so', async () => {
        getMyFeedback.mockResolvedValue(ok([decision({ reason: '' })]))
        const { wrapper } = await openAt('/content-builder/9')
        expect(wrapper.get('[data-testid="rejection-feedback"]').text()).toContain('No reason was left with this decision.')
    })

    it('editing and saving reopens it as a draft, and the feedback stays in view', async () => {
        const edit = vi.spyOn(ContentDataSource, 'editContent')
            .mockImplementation(async (contentId, draft) => ok(record({ contentId, ...draft, status: 'draft' })))
        const { state, wrapper } = await openAt('/content-builder/9')

        state.setTitle('Market day, simpler')
        await state.save()
        await flushPromises()

        expect(edit).toHaveBeenCalledWith(9, expect.objectContaining({ title: 'Market day, simpler' }))
        expect(badge(wrapper).text()).toBe('Draft')
        const feedback = wrapper.get('[data-testid="rejection-feedback"]')
        expect(feedback.text()).toContain(REASON)
        expect(feedback.text()).toContain('Reopened as a draft')
    })

    it('resubmitting sends it for review again as its next version', async () => {
        const send = vi.spyOn(ContentDataSource, 'submitContent')
            .mockImplementation(async (contentId, s) => ok(record({ contentId, ...s, status: 'pending', version: 2 })))
        const { state, wrapper } = await openAt('/content-builder/9')
        state.audience = 'child-friendly'
        state.assignedTheme = 'food'

        await state.submit()
        await flushPromises()

        expect(send).toHaveBeenCalledWith(9, expect.objectContaining({ title: 'Market day' }))
        expect(state.status).toBe('pending')
        expect(state.canEdit()).toBe(false)
        expect(wrapper.find('[data-testid="rejection-feedback"]').exists()).toBe(false)
        expect(badge(wrapper).text()).toBe('Pending review')
    })

    it('reads in isiZulu', async () => {
        i18n.global.locale.value = 'zulu'
        const { wrapper } = await openAt('/content-builder/9')
        expect(badge(wrapper).text()).toBe('Kwenqatshiwe')
        expect(wrapper.get('[data-testid="rejection-feedback"]').text()).toContain('Impendulo yomhleli')
    })
})

describe('the status badge and what each status allows', () => {
    const cases: Array<{ status: ContentStatus, label: string, badgeClass: string | null, editable: boolean }> = [
        { status: 'draft', label: 'Draft', badgeClass: null, editable: true },
        { status: 'pending', label: 'Pending review', badgeClass: 'ui-badge--warning', editable: false },
        { status: 'approved', label: 'Approved', badgeClass: 'ui-badge--success', editable: false },
        { status: 'rejected', label: 'Rejected', badgeClass: 'ui-badge--danger', editable: true },
    ]

    it.each(cases)('$status content shows "$label"', async ({ status, label, badgeClass, editable }) => {
        getContent.mockResolvedValue(ok(record({ status })))
        const { wrapper } = await openAt('/content-builder/9')
        expect(badge(wrapper).text()).toBe(label)
        if (badgeClass) expect(badge(wrapper).classes()).toContain(badgeClass)
        expect(titleInput(wrapper).disabled).toBe(!editable)
        expect(wrapper.find('[data-testid="locked-notice"]').exists()).toBe(!editable)
    })

    it('pending content explains it is read only until a moderator decides, and hides an older rejection', async () => {
        getContent.mockResolvedValue(ok(record({ status: 'pending', version: 2 })))
        const { wrapper } = await openAt('/content-builder/9')
        expect(wrapper.get('[data-testid="locked-notice"]').text()).toContain('read only until a moderator decides')
        expect(wrapper.find('[data-testid="rejection-feedback"]').exists()).toBe(false)
        expect(button(wrapper, 'Save')).toBeUndefined()
        expect(button(wrapper, 'Saved')?.attributes('disabled')).toBeDefined()
    })

    it('approved content says it is published and read only', async () => {
        getContent.mockResolvedValue(ok(record({ status: 'approved' })))
        const { wrapper } = await openAt('/content-builder/9')
        const notice = wrapper.get('[data-testid="locked-notice"]')
        expect(notice.text()).toContain('Approved and published for learners')
        expect(notice.classes()).toContain('ui-alert--success')
        expect(button(wrapper, 'Approved')?.attributes('disabled')).toBeDefined()
    })
})

describe('refreshing the content already open', () => {
    it('keeps the selected page', async () => {
        getContent.mockResolvedValue(ok(record({ content: [[text('One', '1')], [text('Two', '2')]] })))
        const state = contentBuilderScreenState()
        await state.loadDraft(9)
        state.selectPage(1)
        await state.loadDraft(9)
        expect(state.page).toBe(1)
    })

    it('never overwrites changes made while it was on its way', async () => {
        const state = contentBuilderScreenState()
        await state.loadDraft(9)
        const refresh = state.loadDraft(9)
        state.setTitle('Typed meanwhile')
        await refresh
        expect(state.title).toBe('Typed meanwhile')
    })

    it('unsaved changes are kept when coming back to the builder', async () => {
        const { router, state } = await openAt('/content-builder/9')
        state.setTitle('Not saved yet')
        getContent.mockClear()
        await router.push({ name: 'authorDashboard' })
        await router.push('/content-builder/9')
        await flushPromises()
        expect(getContent).not.toHaveBeenCalled()
        expect(state.title).toBe('Not saved yet')
    })
})
