import { describe, it, expect } from 'vitest'
import { dropTargetIndex } from '../reorder'

describe('dropTargetIndex', () => {
    it('nominal: dropping down the list lands one above the gap, since the block leaves its old place', () => {
        expect(dropTargetIndex(0, 2, 3)).toBe(1)      // a into the gap between b and c
    })

    it('nominal: dropping up the list lands on the gap', () => {
        expect(dropTargetIndex(2, 0, 3)).toBe(0)
    })

    it('boundary: the gap above the first block and the gap below the last', () => {
        expect(dropTargetIndex(1, 0, 3)).toBe(0)
        expect(dropTargetIndex(0, 3, 3)).toBe(2)
    })

    it('boundary: the gap directly above or below the block itself leaves it in place', () => {
        expect(dropTargetIndex(1, 1, 3)).toBeNull()
        expect(dropTargetIndex(1, 2, 3)).toBeNull()
    })

    it('invalid input: a source outside the list', () => {
        expect(dropTargetIndex(-1, 0, 3)).toBeNull()
        expect(dropTargetIndex(3, 0, 3)).toBeNull()
    })

    it('invalid input: a gap outside the list', () => {
        expect(dropTargetIndex(0, 4, 3)).toBeNull()    // one gap past the gap below the last block
        expect(dropTargetIndex(0, 5, 3)).toBeNull()
        expect(dropTargetIndex(2, -1, 3)).toBeNull()
    })

    it('boundary: an empty list has nothing to move', () => {
        expect(dropTargetIndex(0, 0, 0)).toBeNull()
    })
})
