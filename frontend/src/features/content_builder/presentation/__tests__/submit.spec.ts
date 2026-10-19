import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { contentBuilderScreenState } from '../state'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { ReviewDetailDataSource } from '@/features/review_detail_feature/datasources/reviewDetailDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes, type $ContentRecord } from '@/features/shared/models/contentType'

const text = (title: string, body: string) => new $ContentBlock(ContentBlockTypes.text, { title, text: body })

const record = (over: Partial<$ContentRecord> = {}): $ContentRecord =>
    ({ contentId: 1, authorId: 3, title: '', language: null, childFriendly: false, status: 'draft', version: 0, level: null,
       chosenTags: [], kind: 'story', content: [[]], updatedAt: '2026-09-17T10:00:00.000Z', submittedAt: null, ...over })
const ok = (data: $ContentRecord) => new $DataSourceResponse(data, null)
//Status 0 is what the client reports when the server can't be reached; a 400 is the
//server refusing the request and saying why.
const failed = (message = 'offline', statusCode = 0) =>
    new $DataSourceResponse<$ContentRecord>(null, new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode }))

//Stands in for the backend: create hands out an id, submit echoes back a pending record.
function mockServer() {
    const create = vi.spyOn(ContentDataSource, 'createContent')
        .mockImplementation(async draft => ok(record({ contentId: 7, ...draft })))
    const edit = vi.spyOn(ContentDataSource, 'editContent')
        .mockImplementation(async (contentId, draft) => ok(record({ contentId, ...draft })))
    const send = vi.spyOn(ContentDataSource, 'submitContent')
        .mockImplementation(async (contentId, s) => ok(record({ contentId, status: 'pending', ...s })))
    return { create, edit, send }
}

//A draft with everything the submit screen asks for: pages, title, language, level and audience.
function readyDraft() {
    const state = contentBuilderScreenState()
    state.availableTags = ['travel', 'food', 'greetings']
    state.contentState = [[text('Greetings', 'Hola'), text('Farewells', 'Adios')]]
    state.page = 0
    state.setTitle('Saying hello')
    state.setLanguage('english')
    state.setLevel(2)
    state.setAudience('general')
    return state
}

beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    //Loading content also looks up the moderator's decisions on it; none by default.
    vi.spyOn(ReviewDetailDataSource, 'getMyFeedback').mockResolvedValue(new $DataSourceResponse([], null) as never)
})

describe('content id', () => {
    it('a new draft has no id until it is first saved', () => {
        expect(contentBuilderScreenState().contentId).toBeNull()
    })

    it('nominal: the first save creates the draft and keeps the id the server gives', async () => {
        const { create, edit } = mockServer()
        const state = readyDraft()
        await state.save()
        expect(create).toHaveBeenCalledOnce()
        expect(edit).not.toHaveBeenCalled()
        expect(state.contentId).toBe(7)
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('every later save edits the draft under that same id', async () => {
        const { create, edit } = mockServer()
        const state = readyDraft()
        await state.save()
        state.touchSavedContent()
        await state.save()
        expect(create).toHaveBeenCalledOnce()
        expect(edit).toHaveBeenCalledWith(7, {
            content: state.contentState,
            title: 'Saying hello',
            language: 'english',
            childFriendly: false,
            level: 2,
            chosenTags: [],
        })
    })

    it('a failed save keeps no id and reports the error', async () => {
        vi.spyOn(ContentDataSource, 'createContent').mockResolvedValue(failed())
        const state = readyDraft()
        await state.save()
        expect(state.contentId).toBeNull()
        expect(state.savingError).not.toBeNull()
    })

    it('loading a draft takes everything the server stored for it', async () => {
        vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(ok(record({
            contentId: 5, status: 'pending', level: 4, title: 'Market day', language: 'zulu',
            childFriendly: true, chosenTags: ['travel', 'food'],
            content: [[text('Loaded', 'from the server')]],
        })))
        const state = contentBuilderScreenState()
        await state.loadDraft(5)
        expect(state.contentId).toBe(5)
        expect(state.level).toBe(4)
        expect(state.title).toBe('Market day')
        expect(state.language).toBe('zulu')
        expect(state.childFriendly).toBe(true)
        expect(state.chosenTags).toEqual(['travel', 'food'])
        expect(state.page).toBe(0)
        expect(state.canEdit()).toBe(false)           // a submitted draft loads already locked
    })

    it('rejected content can be edited again, which reopens it as a draft', async () => {
        vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(ok(record({ contentId: 9, status: 'rejected' })))
        const state = contentBuilderScreenState()
        await state.loadDraft(9)
        expect(state.canEdit()).toBe(true)
    })

    it('invalid input: loading an unknown id reports an error', async () => {
        vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(failed('content not found'))
        const state = contentBuilderScreenState()
        await state.loadDraft(999)
        expect(state.loadingError).not.toBeNull()
        expect(state.contentId).toBeNull()
    })
})

describe('chosen tags and level', () => {
    it('nominal: a tag from the fixed set is added', () => {
        const state = readyDraft()
        expect(state.addChosenTag('travel')).toBe(true)
        expect(state.chosenTags).toEqual(['travel'])
    })

    it('permission: the store refuses a tag outside the fixed set, even if the screen is bypassed', () => {
        const state = readyDraft()
        expect(state.addChosenTag('my own tag')).toBe(false)
        expect(state.addChosenTag('Travel')).toBe(false)
        expect(state.chosenTags).toEqual([])
    })

    it('boundary: choosing the same tag twice keeps one', () => {
        const state = readyDraft()
        state.addChosenTag('travel')
        expect(state.addChosenTag('travel')).toBe(false)
        expect(state.chosenTags).toEqual(['travel'])
    })

    it('removes a tag', () => {
        const state = readyDraft()
        state.addChosenTag('travel')
        state.addChosenTag('food')
        state.removeChosenTag('travel')
        expect(state.chosenTags).toEqual(['food'])
    })

    it('boundary: levels 1 and 6 are accepted, 0 and 7 are ignored', () => {
        const state = readyDraft()
        state.setLevel(1); expect(state.level).toBe(1)
        state.setLevel(6); expect(state.level).toBe(6)
        state.setLevel(0); expect(state.level).toBe(6)
        state.setLevel(7); expect(state.level).toBe(6)
    })
})

describe('deleteDraft', () => {
    const deleted = () => new $DataSourceResponse<{ message: string }>({ message: 'content deleted successfully' }, null)

    it('nominal: a saved draft is deleted on the server under its id and a new empty draft starts', async () => {
        const remove = vi.spyOn(ContentDataSource, 'deleteContent').mockResolvedValue(deleted())
        const state = readyDraft()
        state.contentId = 3
        state.addChosenTag('travel')
        await state.deleteDraft()
        expect(remove).toHaveBeenCalledWith(3)
        expect(state.contentId).toBeNull()
        expect(state.contentState).toEqual([[]])
        expect(state.page).toBe(0)
        expect(state.level).toBeNull()
        expect(state.chosenTags).toEqual([])
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('a draft that was never saved is cleared without calling the server', async () => {
        const remove = vi.spyOn(ContentDataSource, 'deleteContent')
        const state = readyDraft()
        await state.deleteDraft()
        expect(remove).not.toHaveBeenCalled()
        expect(state.contentState).toEqual([[]])
    })

    it('a delete the server refuses keeps the draft and reports the error', async () => {
        vi.spyOn(ContentDataSource, 'deleteContent').mockResolvedValue(
            new $DataSourceResponse<{ message: string }>(null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'offline', statusCode: 0 })))
        const state = readyDraft()
        state.contentId = 3
        await state.deleteDraft()
        expect(state.contentId).toBe(3)
        expect(state.contentState[0]).toHaveLength(2)
        expect(state.deletingError?.message).toBe('Error deleting this draft')
        expect(state.isDeleting).toBe(false)
    })

    it('permission: a submitted draft cannot be deleted', async () => {
        mockServer()
        const remove = vi.spyOn(ContentDataSource, 'deleteContent')
        const state = readyDraft()
        state.addChosenTag('greetings')
        await state.submit()
        await state.deleteDraft()
        expect(remove).not.toHaveBeenCalled()
        expect(state.status).toBe('pending')
        expect(state.contentState[0]).toHaveLength(2)
    })
})

describe('submit', () => {
    it('nominal: a ready draft is sent under its id and comes back pending', async () => {
        const { send } = mockServer()
        const state = readyDraft()
        state.contentId = 3
        state.addChosenTag('greetings')
        await state.submit()
        expect(state.status).toBe('pending')
        expect(send).toHaveBeenCalledWith(3, expect.objectContaining({ level: 2, chosenTags: ['greetings'] }))
    })

    it('kind is not sent, because the server derives it', async () => {
        const { send } = mockServer()
        const state = readyDraft()
        state.addChosenTag('greetings')
        await state.submit()
        expect(send.mock.calls[0][1]).not.toHaveProperty('kind')
    })

    it('a draft that was never saved is created first, then submitted with the new id', async () => {
        const { create, send } = mockServer()
        const state = readyDraft()
        state.addChosenTag('greetings')
        await state.submit()
        expect(create).toHaveBeenCalledOnce()
        expect(send).toHaveBeenCalledWith(7, expect.anything())
        expect(state.contentId).toBe(7)
    })

    it('a draft that already has an id is not created again', async () => {
        const { create } = mockServer()
        const state = readyDraft()
        state.contentId = 3
        state.addChosenTag('greetings')
        await state.submit()
        expect(create).not.toHaveBeenCalled()
    })

    it('invalid input: a draft that fails its checks is not sent and stays a draft', async () => {
        const { create, send } = mockServer()
        const state = readyDraft()
        state.addChosenTag('greetings')
        state.level = null
        await state.submit()
        expect(create).not.toHaveBeenCalled()
        expect(send).not.toHaveBeenCalled()
        expect(state.status).toBe('draft')
        expect(state.submittingError?.message).toContain('level chosen')
    })

    it('a request the server rejects leaves the draft editable and shows its reason', async () => {
        mockServer()
        vi.spyOn(ContentDataSource, 'submitContent').mockResolvedValue(failed('every text block needs a title and text', 400))
        const state = readyDraft()
        state.addChosenTag('greetings')
        await state.submit()
        expect(state.status).toBe('draft')
        expect(state.canEdit()).toBe(true)
        expect(state.submittingError?.message).toBe('every text block needs a title and text')
        expect(state.isSubmitting).toBe(false)
    })

    it('Table IV Test 10: rejecting submission when multiple themes are selected', async () => {
        const state = readyDraft()
        state.setAssignedTheme(['travel', 'food'])
        await state.submit()
        expect(state.status).toBe('draft')
        expect(state.submittingError?.message).toContain('theme chosen (exactly one)')
    })

    it('Table IV Test 11: rejecting submission when audience is left blank', async () => {
        const state = readyDraft()
        state.addChosenTag('greetings')
        state.setAudience(null)
        await state.submit()
        expect(state.status).toBe('draft')
        expect(state.submittingError?.message).toContain('audience chosen')
    })

    it('rejecting submission when total tags exceed 10', async () => {
        const state = readyDraft()
        state.availableTags = Array.from({ length: 12 }, (_, i) => `tag-${i}`)
        state.setAssignedTheme('tag-0')
        for (let i = 1; i <= 10; i++) {
            state.chosenTags.push(`tag-${i}`)
        }
        await state.submit()
        expect(state.status).toBe('draft')
        expect(state.submittingError?.message).toContain('total tags do not exceed 10')
    })
})

describe('once submitted, the draft is read only', () => {
    async function submitted() {
        mockServer()
        const state = readyDraft()
        state.addChosenTag('greetings')
        await state.submit()
        return state
    }

    it('permission: no block can be added, written, moved or deleted', async () => {
        const state = await submitted()
        const before = JSON.stringify(state.contentState)
        state.addBlock()
        state.writeBlock(0, text('changed', 'changed'))
        state.moveBlock(0, 2)
        state.deleteBlock(0)
        state.addPage()
        state.removePage(0)
        expect(JSON.stringify(state.contentState)).toBe(before)
    })

    it('permission: level and tags cannot change', async () => {
        const state = await submitted()
        state.setLevel(5)
        expect(state.addChosenTag('food')).toBe(false)
        state.removeChosenTag('greetings')
        expect(state.level).toBe(2)
        expect(state.chosenTags).toEqual(['greetings'])
    })

    it('permission: no block can be opened for editing', async () => {
        const state = await submitted()
        state.selectBlock(0)
        expect(state.inspectedBlock).toBe(-1)
        expect(state.isBlockEditable(0, 0)).toBe(false)
    })

    it('submitting and saving again do nothing', async () => {
        const state = await submitted()
        const send = vi.spyOn(ContentDataSource, 'submitContent')
        const edit = vi.spyOn(ContentDataSource, 'editContent')
        send.mockClear(); edit.mockClear()
        await state.submit()
        await state.save()
        expect(send).not.toHaveBeenCalled()
        expect(edit).not.toHaveBeenCalled()
    })
})

describe('what the author is told when the server refuses', () => {
    it('saving shows the server\'s reason for a refused draft', async () => {
        vi.spyOn(ContentDataSource, 'createContent')
            .mockResolvedValue(failed('text in a block can be at most 2000 characters', 400))
        const state = readyDraft()
        await state.save()
        expect(state.savingError?.message).toBe('text in a block can be at most 2000 characters')
        expect(state.hasUnsavedChange).toBe(true)
    })

    it('saving says only that it failed when the server is down or broken', async () => {
        const state = readyDraft()
        vi.spyOn(ContentDataSource, 'createContent').mockResolvedValue(failed('Network error', 0))
        await state.save()
        expect(state.savingError?.message).toBe('Error saving this draft')

        vi.spyOn(ContentDataSource, 'createContent').mockResolvedValue(failed('internal server error', 500))
        await state.save()
        expect(state.savingError?.message).toBe('Error saving this draft')
    })

    it('editing a saved draft shows the reason too', async () => {
        mockServer()
        const state = readyDraft()
        await state.save()
        vi.spyOn(ContentDataSource, 'editContent')
            .mockResolvedValue(failed('text in a block can be at most 2000 characters', 400))
        await state.save()
        expect(state.savingError?.message).toBe('text in a block can be at most 2000 characters')
    })

    it('submitting a draft that was never saved shows the reason from creating it', async () => {
        const { send } = mockServer()
        vi.spyOn(ContentDataSource, 'createContent')
            .mockResolvedValue(failed('text in a block can be at most 2000 characters', 400))
        const state = readyDraft()
        state.addChosenTag('greetings')
        await state.submit()
        expect(state.submittingError?.message).toBe('text in a block can be at most 2000 characters')
        expect(send).not.toHaveBeenCalled()
    })

    it('boundary: every 4xx carries its reason, and 399 and 500 do not', async () => {
        const { reasonOr } = await import('../state')
        const error = (statusCode: number) => new Exception({ exceptionType: ExceptionType.FAILED, message: 'why', statusCode })
        expect(reasonOr(error(400), 'fallback')).toBe('why')
        expect(reasonOr(error(499), 'fallback')).toBe('why')
        expect(reasonOr(error(399), 'fallback')).toBe('fallback')
        expect(reasonOr(error(500), 'fallback')).toBe('fallback')
        expect(reasonOr(null, 'fallback')).toBe('fallback')
    })
})
