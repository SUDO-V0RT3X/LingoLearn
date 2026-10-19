import { describe, it, expect } from 'vitest'
import { $ContentBlock, ContentBlockTypes, emptyValueFor, isBlockOfType } from '../contentType'

describe('emptyValueFor', () => {
    it('nominal: a text block starts with both of its fields', () => {
        expect(emptyValueFor(ContentBlockTypes.text)).toEqual({ title: '', text: '' })
    })

    it('nominal: an audio block starts with all three of its fields', () => {
        expect(emptyValueFor(ContentBlockTypes.audio)).toEqual({ title: '', fileUrl: '', transcript: '' })
    })

    it('nominal: an image block starts with all three of its fields', () => {
        expect(emptyValueFor(ContentBlockTypes.image)).toEqual({ title: '', fileUrl: '', altText: '' })
    })

    it('nominal: a multiple choice block starts with the two answers a question needs', () => {
        expect(emptyValueFor(ContentBlockTypes.multipleChoice))
            .toEqual({ title: '', question: '', options: ['', ''], correctOption: 0 })
    })

    it('two multiple choice blocks do not share the same list of answers', () => {
        const first = emptyValueFor(ContentBlockTypes.multipleChoice)
        emptyValueFor(ContentBlockTypes.multipleChoice).options.push('Sawubona')
        expect(first.options).toEqual(['', ''])
    })

    it('nominal: a fill in the blank block starts with one accepted spelling', () => {
        expect(emptyValueFor(ContentBlockTypes.fillBlank))
            .toEqual({ title: '', sentence: '', accepted: [''] })
    })

    it('nominal: a listen and choose block starts with a clip and two answers', () => {
        expect(emptyValueFor(ContentBlockTypes.listenChoose))
            .toEqual({ title: '', fileUrl: '', transcript: '', options: ['', ''], correctOption: 0 })
    })

    it('boundary: a block with no type yet holds nothing', () => {
        expect(emptyValueFor(ContentBlockTypes.pendingSelection)).toEqual({})
    })

    it('every block type has an empty value, so a new type cannot be half added', () => {
        for (const type of Object.values(ContentBlockTypes)) {
            expect(emptyValueFor(type)).toBeDefined()
        }
    })
})

describe('isBlockOfType', () => {
    it('nominal: narrows a matching block so its fields are readable', () => {
        const block = new $ContentBlock(ContentBlockTypes.text, { title: 'Greetings', text: 'Hola' })
        expect(isBlockOfType(block, ContentBlockTypes.text)).toBe(true)
        if (isBlockOfType(block, ContentBlockTypes.text)) {
            expect(block.value.title).toBe('Greetings')   // typed, not a cast
        }
    })

    it('invalid input: rejects a block of another type', () => {
        const block = new $ContentBlock(ContentBlockTypes.audio, { title: '', fileUrl: '', transcript: '' })
        expect(isBlockOfType(block, ContentBlockTypes.text)).toBe(false)
    })

    it('boundary: an absent block is not of any type', () => {
        expect(isBlockOfType(undefined, ContentBlockTypes.text)).toBe(false)
    })
})

