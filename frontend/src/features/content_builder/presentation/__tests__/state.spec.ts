import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { contentBuilderScreenState } from '../state'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'

function block(title: string) {
    return new $ContentBlock(ContentBlockTypes.text, { title, text: '' })
}

function storeWith(texts: string[]) {
    const state = contentBuilderScreenState()
    state.contentState = [texts.map(block)]
    state.page = 0
    return state
}

const order = (state: ReturnType<typeof contentBuilderScreenState>) =>
    state.contentState[0].map(b => (b.value as { title: string }).title)

beforeEach(() => { setActivePinia(createPinia()) })

describe('moveBlock', () => {
    it('nominal: moves a block down the page', () => {
        const state = storeWith(['a', 'b', 'c'])
        state.moveBlock(0, 2)          // drop a into the gap between b and c
        expect(order(state)).toEqual(['b', 'a', 'c'])
    })

    it('nominal: moves a block up the page', () => {
        const state = storeWith(['a', 'b', 'c'])
        state.moveBlock(2, 0)
        expect(order(state)).toEqual(['c', 'a', 'b'])
    })

    it('boundary: dropping into the gap below the last block', () => {
        const state = storeWith(['a', 'b', 'c'])
        state.moveBlock(0, 3)
        expect(order(state)).toEqual(['b', 'c', 'a'])
    })

    it('boundary: dropping a block back onto itself changes nothing', () => {
        const state = storeWith(['a', 'b', 'c'])
        state.hasUnsavedChange = false
        state.moveBlock(1, 1)
        state.moveBlock(1, 2)          // the gap directly below itself
        expect(order(state)).toEqual(['a', 'b', 'c'])
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('invalid input: an out of range source is ignored', () => {
        const state = storeWith(['a', 'b'])
        state.moveBlock(5, 0)
        state.moveBlock(-1, 1)
        expect(order(state)).toEqual(['a', 'b'])
    })

    it('marks the draft unsaved once a block actually moves', () => {
        const state = storeWith(['a', 'b'])
        state.hasUnsavedChange = false
        state.moveBlock(0, 2)
        expect(state.hasUnsavedChange).toBe(true)
    })
})

describe('moveBlock selection tracking', () => {
    it('the selected block stays selected when it is the one dragged', () => {
        const state = storeWith(['a', 'b', 'c'])
        state.selectBlock(0)
        state.moveBlock(0, 3)
        expect(state.inspectedBlock).toBe(2)
        expect(state.isBlockEditable(0, 2)).toBe(true)
    })

    it('the selection shifts when another block moves past it', () => {
        const state = storeWith(['a', 'b', 'c'])
        state.selectBlock(2)           // c is selected
        state.moveBlock(0, 3)          // a moves to the end, pushing c up
        expect(order(state)).toEqual(['b', 'c', 'a'])
        expect(state.inspectedBlock).toBe(1)
    })

    it('the selection is untouched when the move happens below it', () => {
        const state = storeWith(['a', 'b', 'c', 'd'])
        state.selectBlock(0)
        state.moveBlock(3, 1)
        expect(state.inspectedBlock).toBe(0)
    })

    it('no selection stays no selection', () => {
        const state = storeWith(['a', 'b'])
        state.selectBlock(-1)
        state.moveBlock(0, 2)
        expect(state.inspectedBlock).toBe(-1)
    })
})


//Pages given as block titles, e.g. [['a'], ['b', 'c']], with the given page selected.
function storeWithPages(pages: string[][], page = 0) {
    const state = contentBuilderScreenState()
    state.contentState = pages.map(titles => titles.map(block))
    state.page = page
    state.hasUnsavedChange = false
    return state
}

const titles = (state: ReturnType<typeof contentBuilderScreenState>) =>
    state.contentState.map(page => page.map(b => (b.value as { title: string }).title))

describe('addPage', () => {
    it('nominal: adds an empty page at the end and selects it', () => {
        const state = storeWithPages([['a'], ['b']])
        state.addPage()
        expect(titles(state)).toEqual([['a'], ['b'], []])
        expect(state.page).toBe(2)
    })

    it('marks the draft unsaved', () => {
        const state = storeWithPages([['a']])
        state.addPage()
        expect(state.hasUnsavedChange).toBe(true)
    })

    it('boundary: starts the page list again if there is none', () => {
        const state = storeWithPages([])
        state.contentState = null as unknown as $ContentBlock[][]
        state.addPage()
        expect(state.contentState).toEqual([[], []])
        expect(state.page).toBe(1)
    })
})

describe('selectPage', () => {
    it('nominal: switches to the page and closes any open block', () => {
        const state = storeWithPages([['a', 'b'], ['c']])
        state.selectBlock(1)
        state.selectPage(1)
        expect(state.page).toBe(1)
        expect(state.inspectedBlock).toBe(-1)
    })

    it('does not change the content or mark it unsaved', () => {
        const state = storeWithPages([['a'], ['b']])
        state.selectPage(1)
        expect(titles(state)).toEqual([['a'], ['b']])
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('permission: pages can still be browsed once the draft is submitted', () => {
        const state = storeWithPages([['a'], ['b']])
        state.status = 'pending'
        state.selectPage(1)
        expect(state.page).toBe(1)
    })
})

describe('removePage', () => {
    it('nominal: removes that page and keeps the others in order', () => {
        const state = storeWithPages([['a'], ['b'], ['c']], 2)
        state.removePage(1)
        expect(titles(state)).toEqual([['a'], ['c']])
    })

    it('removing a page before the selected one keeps the same page selected', () => {
        const state = storeWithPages([['a'], ['b'], ['c']], 2)
        state.removePage(0)
        expect(titles(state)[state.page]).toEqual(['c'])
    })

    it('removing a page after the selected one leaves the selection alone', () => {
        const state = storeWithPages([['a'], ['b'], ['c']], 0)
        state.removePage(2)
        expect(state.page).toBe(0)
    })

    it('removing the selected page selects the page before it', () => {
        const state = storeWithPages([['a'], ['b'], ['c']], 2)
        state.removePage(2)
        expect(state.page).toBe(1)
    })

    it('boundary: removing the first page while on it selects the new first page', () => {
        const state = storeWithPages([['a'], ['b']], 0)
        state.removePage(0)
        expect(state.page).toBe(0)
        expect(titles(state)[state.page]).toEqual(['b'])
    })

    it('a block added after removing the first page is kept in the content', () => {
        const state = storeWithPages([['a'], ['b']], 0)
        state.removePage(0)
        state.addBlock()
        expect(JSON.parse(JSON.stringify(state.contentState))[0]).toHaveLength(2)
    })

    it('boundary: the only page cannot be removed', () => {
        const state = storeWithPages([['a']], 0)
        state.removePage(0)
        expect(titles(state)).toEqual([['a']])
        expect(state.page).toBe(0)
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('invalid input: an out of range index changes nothing', () => {
        const state = storeWithPages([['a'], ['b']], 1)
        state.removePage(2)
        state.removePage(-1)
        expect(titles(state)).toEqual([['a'], ['b']])
        expect(state.page).toBe(1)
        expect(state.hasUnsavedChange).toBe(false)
    })

    it('closes any open block and marks the draft unsaved', () => {
        const state = storeWithPages([['a'], ['b', 'c']], 1)
        state.selectBlock(1)
        state.removePage(0)
        expect(state.inspectedBlock).toBe(-1)
        expect(state.hasUnsavedChange).toBe(true)
    })
})

describe('addBlock', () => {
    it('nominal: adds an empty block with no type yet to the end of the page', () => {
        const state = storeWithPages([['a']])
        state.addBlock()
        const added = state.contentState[0][1]
        expect(state.contentState[0]).toHaveLength(2)
        expect(added.itemType).toBe(ContentBlockTypes.pendingSelection)
        expect(added.value).toEqual({})
    })

    it('opens the new block so its type can be chosen straight away', () => {
        const state = storeWithPages([['a', 'b']])
        state.addBlock()
        expect(state.inspectedBlock).toBe(2)
        expect(state.isBlockEditable(0, 2)).toBe(true)
    })

    it('adds to the selected page only', () => {
        const state = storeWithPages([['a'], ['b']], 1)
        state.addBlock()
        expect(state.contentState[0]).toHaveLength(1)
        expect(state.contentState[1]).toHaveLength(2)
    })

    it('boundary: a page with no block list yet gets one', () => {
        const state = storeWithPages([])
        state.addBlock()
        expect(state.contentState[0]).toHaveLength(1)
        expect(state.inspectedBlock).toBe(0)
    })

    it('marks the draft unsaved', () => {
        const state = storeWithPages([['a']])
        state.addBlock()
        expect(state.hasUnsavedChange).toBe(true)
    })
})

describe('writeBlock', () => {
    it('nominal: replaces the block at that position with the new one', () => {
        const state = storeWithPages([['a', 'b']])
        state.writeBlock(1, new $ContentBlock(ContentBlockTypes.text, { title: 'B', text: 'written' }))
        expect(state.contentState[0][1].value).toEqual({ title: 'B', text: 'written' })
    })

    it('gives a block with no type its chosen type', () => {
        const state = storeWithPages([['a']])
        state.addBlock()
        state.writeBlock(1, new $ContentBlock(ContentBlockTypes.audio, { title: '', fileUrl: '', transcript: '' }))
        expect(state.getTypeForPageAndBlock(0, 1)).toBe(ContentBlockTypes.audio)
    })

    it('leaves every other block and page untouched', () => {
        const state = storeWithPages([['a', 'b', 'c'], ['d']])
        state.writeBlock(1, block('B'))
        expect(titles(state)).toEqual([['a', 'B', 'c'], ['d']])
    })

    it('marks the draft unsaved', () => {
        const state = storeWithPages([['a']])
        state.writeBlock(0, block('A'))
        expect(state.hasUnsavedChange).toBe(true)
    })
})

describe('deleteBlock', () => {
    it('nominal: removes that block and keeps the rest in order', () => {
        const state = storeWithPages([['a', 'b', 'c'], ['d']])
        state.deleteBlock(1)
        expect(titles(state)).toEqual([['a', 'c'], ['d']])
    })

    it('deleting the open block closes it', () => {
        const state = storeWithPages([['a', 'b']])
        state.selectBlock(1)
        state.deleteBlock(1)
        expect(state.inspectedBlock).toBe(-1)
    })

    it('deleting a block above the open one keeps the same block open', () => {
        const state = storeWithPages([['a', 'b', 'c']])
        state.selectBlock(2)
        state.deleteBlock(0)
        expect(state.inspectedBlock).toBe(1)
        expect(titles(state)[0][state.inspectedBlock]).toBe('c')
    })

    it('deleting a block below the open one leaves the selection alone', () => {
        const state = storeWithPages([['a', 'b', 'c']])
        state.selectBlock(0)
        state.deleteBlock(2)
        expect(state.inspectedBlock).toBe(0)
    })

    it('boundary: deleting the last block leaves an empty page', () => {
        const state = storeWithPages([['a']])
        state.deleteBlock(0)
        expect(state.contentState).toEqual([[]])
        expect(state.hasUnsavedChange).toBe(true)
    })
})

describe('selectBlock', () => {
    it('only the selected block on the selected page is editable', () => {
        const state = storeWithPages([['a', 'b'], ['c', 'd']])
        state.selectBlock(1)
        expect(state.isBlockEditable(0, 1)).toBe(true)
        expect(state.isBlockEditable(0, 0)).toBe(false)
        expect(state.isBlockEditable(1, 1)).toBe(false)   // same position, different page
    })

    it('selecting -1 leaves every block read only', () => {
        const state = storeWithPages([['a', 'b']])
        state.selectBlock(0)
        state.selectBlock(-1)
        expect(state.isBlockEditable(0, 0)).toBe(false)
    })
})
