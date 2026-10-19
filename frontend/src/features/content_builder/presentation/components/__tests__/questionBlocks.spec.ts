import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ContentTypeMultipleChoiceBar from '../ContentTypeMultipleChoiceBar.vue'
import ContentTypeFillBlankBar from '../ContentTypeFillBlankBar.vue'
import ContentTypeListenChooseBar from '../ContentTypeListenChooseBar.vue'
import BlockMux from '../BlockMux.vue'
import { contentBuilderScreenState } from '../../state'
import { $ContentBlock, ContentBlockTypes, emptyValueFor } from '@/features/shared/models/contentType'

beforeEach(() => { setActivePinia(createPinia()) })

describe('ContentTypeMultipleChoiceBar', () => {
    const question = {
        title: 'Greetings',
        question: 'How do you say hello in Zulu?',
        options: ['Sawubona', 'Hamba kahle', 'Ngiyabonga'],
        correctOption: 0,
    }

    const valuesOf = (bar: ReturnType<typeof mount>, selector: string) =>
        bar.findAll(selector).map(f => (f.element as HTMLInputElement).value)

    it('nominal: editable shows the title, the question and a box per answer', () => {
        const bar = mount(ContentTypeMultipleChoiceBar, { props: { ...question, editable: true } })
        expect(valuesOf(bar, '.choiceBlockField__input')).toEqual(['Greetings', 'How do you say hello in Zulu?'])
        expect(valuesOf(bar, '.choiceOption__input')).toEqual(['Sawubona', 'Hamba kahle', 'Ngiyabonga'])
    })

    it('the right answer is the one marked, and marking another sends its position up', async () => {
        const bar = mount(ContentTypeMultipleChoiceBar, { props: { ...question, editable: true } })
        const marks = bar.findAll('.choiceOption__correct')
        expect(marks.map(m => (m.element as HTMLInputElement).checked)).toEqual([true, false, false])

        await marks[2].trigger('change')
        expect(bar.emitted('update:correctOption')?.at(-1)).toEqual([2])
    })

    it('typing in one answer sends the whole list up with the others unchanged', async () => {
        const bar = mount(ContentTypeMultipleChoiceBar, { props: { ...question, editable: true } })
        await bar.findAll('.choiceOption__input')[1].setValue('Salani kahle')
        expect(bar.emitted('update:options')?.at(-1)).toEqual([['Sawubona', 'Salani kahle', 'Ngiyabonga']])
    })

    it('adding an answer appends an empty one', async () => {
        const bar = mount(ContentTypeMultipleChoiceBar, { props: { ...question, editable: true } })
        await bar.find('.choiceOptions__add').trigger('click')
        expect(bar.emitted('update:options')?.at(-1)).toEqual([['Sawubona', 'Hamba kahle', 'Ngiyabonga', '']])
    })

    it('boundary: six answers is the most, and two is the fewest', async () => {
        const full = mount(ContentTypeMultipleChoiceBar, {
            props: { ...question, options: ['a', 'b', 'c', 'd', 'e', 'f'], editable: true },
        })
        expect(full.find('.choiceOptions__add').attributes('disabled')).toBeDefined()
        expect(full.findAll('.choiceOption__remove').every(b => b.attributes('disabled') === undefined)).toBe(true)

        const pair = mount(ContentTypeMultipleChoiceBar, {
            props: { ...question, options: ['a', 'b'], editable: true },
        })
        expect(pair.findAll('.choiceOption__remove').every(b => b.attributes('disabled') !== undefined)).toBe(true)
        await pair.findAll('.choiceOption__remove')[0].trigger('click')
        expect(pair.emitted('update:options')).toBeUndefined()
    })

    it('removing an answer above the marked one leaves the mark on the same words', async () => {
        const bar = mount(ContentTypeMultipleChoiceBar, {
            props: { ...question, correctOption: 2, editable: true },
        })
        await bar.findAll('.choiceOption__remove')[0].trigger('click')
        expect(bar.emitted('update:options')?.at(-1)).toEqual([['Hamba kahle', 'Ngiyabonga']])
        expect(bar.emitted('update:correctOption')?.at(-1)).toEqual([1])
    })

    it('read only shows the question with the right answer marked', () => {
        const bar = mount(ContentTypeMultipleChoiceBar, { props: { ...question, correctOption: 1, editable: false } })
        expect(bar.find('input').exists()).toBe(false)
        expect(bar.text()).toContain('Greetings')
        expect(bar.text()).toContain('How do you say hello in Zulu?')

        const answers = bar.findAll('.choiceBlockPreview__option')
        //The tick and the label are separate spans, spaced by the stylesheet rather than by text.
        expect(answers.map(a => a.text())).toEqual(['Sawubona', '✓Hamba kahleright answer', 'Ngiyabonga'])
        expect(answers[1].classes()).toContain('choiceBlockPreview__option--correct')
    })

    it('boundary: an empty question says what is missing', () => {
        const bar = mount(ContentTypeMultipleChoiceBar, {
            props: { ...emptyValueFor(ContentBlockTypes.multipleChoice), editable: false },
        })
        expect(bar.text()).toContain('Untitled question')
        expect(bar.text()).toContain('No question yet')
        expect(bar.text()).toContain('Empty answer')
    })
})

describe('ContentTypeListenChooseBar', () => {
    const listening = {
        title: 'At the door',
        fileUrl: '/uploads/audio/knock.mp3',
        transcript: 'Ubani lowo?',
        options: ['Who is that?', 'Where are you?'],
        correctOption: 0,
    }

    it('nominal: editable shows the title, the upload, the transcript and the answers', () => {
        const bar = mount(ContentTypeListenChooseBar, { props: { ...listening, editable: true } })
        expect((bar.find('.listenBlockField__input').element as HTMLInputElement).value).toBe('At the door')
        expect(bar.find('input[type="file"]').attributes('accept')).toBe('audio/*')
        expect(bar.find('.audioUpload__button').text()).toBe('Change file')
        expect(bar.find('.audioUpload__name').text()).toBe('knock.mp3')
        expect((bar.find('textarea').element as HTMLTextAreaElement).value).toBe('Ubani lowo?')
        expect(bar.findAll('.choiceOption__input').map(f => (f.element as HTMLInputElement).value))
            .toEqual(['Who is that?', 'Where are you?'])
    })

    it('the answers field is the one multiple choice uses, marking and all', async () => {
        const bar = mount(ContentTypeListenChooseBar, { props: { ...listening, editable: true } })
        await bar.findAll('.choiceOption__correct')[1].trigger('change')
        expect(bar.emitted('update:correctOption')?.at(-1)).toEqual([1])
    })

    it('typing in the transcript sends the new transcript up', async () => {
        const bar = mount(ContentTypeListenChooseBar, { props: { ...listening, editable: true } })
        await bar.find('textarea').setValue('Ubani lowo emnyango?')
        expect(bar.emitted('update:transcript')?.at(-1)).toEqual(['Ubani lowo emnyango?'])
    })

    it('read only plays the clip and marks the right answer, with no fields', () => {
        const bar = mount(ContentTypeListenChooseBar, { props: { ...listening, editable: false } })
        expect(bar.find('input').exists()).toBe(false)
        expect(bar.find('audio').attributes('src')).toContain('knock.mp3')
        expect(bar.text()).toContain('Ubani lowo?')
        expect(bar.find('.choiceBlockPreview__option--correct').text()).toContain('Who is that?')
    })

    it('boundary: an empty listening question says what is missing', () => {
        const bar = mount(ContentTypeListenChooseBar, {
            props: { ...emptyValueFor(ContentBlockTypes.listenChoose), editable: false },
        })
        expect(bar.text()).toContain('Untitled listening question')
        expect(bar.text()).toContain('No file attached')
        expect(bar.text()).toContain('No transcript yet')
        expect(bar.text()).toContain('Empty answer')
    })
})

describe('ContentTypeFillBlankBar', () => {
    const blank = {
        title: 'Greetings',
        sentence: 'You say [] when you meet someone.',
        accepted: ['sawubona', 'Sawubona'],
    }

    it('nominal: editable shows the title, the sentence and a box per accepted spelling', () => {
        const bar = mount(ContentTypeFillBlankBar, { props: { ...blank, editable: true } })
        const fields = bar.findAll('.blankBlockField__input').map(f => (f.element as HTMLInputElement).value)
        expect(fields).toEqual(['Greetings', 'You say [] when you meet someone.', 'sawubona', 'Sawubona'])
        expect(bar.find('.blankBlock__hint').text()).toBe('Type [] in the sentence where the missing word goes.')
        expect(bar.find('.blankBlock__hint code').text()).toBe('[]')
    })

    it('typing in one accepted spelling sends the whole list up with the others unchanged', async () => {
        const bar = mount(ContentTypeFillBlankBar, { props: { ...blank, editable: true } })
        await bar.findAll('.blankBlockField__input')[3].setValue('SAWUBONA')
        expect(bar.emitted('update:accepted')?.at(-1)).toEqual([['sawubona', 'SAWUBONA']])
    })

    it('accepting another spelling appends an empty one', async () => {
        const bar = mount(ContentTypeFillBlankBar, { props: { ...blank, editable: true } })
        await bar.find('.blankAnswers__add').trigger('click')
        expect(bar.emitted('update:accepted')?.at(-1)).toEqual([['sawubona', 'Sawubona', '']])
    })

    it('boundary: six spellings is the most, and one is the fewest', async () => {
        const full = mount(ContentTypeFillBlankBar, {
            props: { ...blank, accepted: ['a', 'b', 'c', 'd', 'e', 'f'], editable: true },
        })
        expect(full.find('.blankAnswers__add').attributes('disabled')).toBeDefined()

        const one = mount(ContentTypeFillBlankBar, { props: { ...blank, accepted: ['a'], editable: true } })
        expect(one.find('.blankAnswer__remove').attributes('disabled')).toBeDefined()
        await one.find('.blankAnswer__remove').trigger('click')
        expect(one.emitted('update:accepted')).toBeUndefined()
    })

    it('removing a spelling keeps the rest', async () => {
        const bar = mount(ContentTypeFillBlankBar, { props: { ...blank, editable: true } })
        await bar.findAll('.blankAnswer__remove')[0].trigger('click')
        expect(bar.emitted('update:accepted')?.at(-1)).toEqual([['Sawubona']])
    })

    it('read only draws the marker as a gap, and lists what is accepted', () => {
        const bar = mount(ContentTypeFillBlankBar, { props: { ...blank, editable: false } })
        expect(bar.find('input').exists()).toBe(false)
        expect(bar.findAll('.blankBlockPreview__gap')).toHaveLength(1)

        //The marker itself is gone: it is drawn, not read out.
        const sentence = bar.find('.blankBlockPreview__sentence').text()
        expect(sentence).not.toContain('[]')
        expect(sentence).toContain('You say')
        expect(sentence).toContain('when you meet someone.')
        expect(bar.text()).toContain('sawubona, Sawubona')
    })

    it('a sentence with no marker still reads as a sentence', () => {
        const bar = mount(ContentTypeFillBlankBar, {
            props: { ...blank, sentence: 'No gap here.', editable: false },
        })
        expect(bar.find('.blankBlockPreview__sentence').text()).toBe('No gap here.')
        expect(bar.find('.blankBlockPreview__gap').exists()).toBe(false)
    })

    it('boundary: an empty sentence says what is missing', () => {
        const bar = mount(ContentTypeFillBlankBar, {
            props: { ...emptyValueFor(ContentBlockTypes.fillBlank), editable: false },
        })
        expect(bar.text()).toContain('Untitled sentence')
        expect(bar.text()).toContain('No sentence yet')
        expect(bar.text()).toContain('No spelling yet')
    })
})

describe('BlockMux with a multiple choice block', () => {
    function storeWith(block: $ContentBlock) {
        const state = contentBuilderScreenState()
        state.contentState = [[block]]
        state.page = 0
        state.selectBlock(0)
        return state
    }

    const block = () => new $ContentBlock(ContentBlockTypes.multipleChoice, {
        title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'], correctOption: 0,
    })

    it('editing the question keeps the answers and the right one', async () => {
        const state = storeWith(block())
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.findAll('.choiceBlockField__input')[1].setValue('How do you greet someone?')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.multipleChoice,
            value: { title: 'Greetings', question: 'How do you greet someone?', options: ['Sawubona', 'Hamba kahle'], correctOption: 0 },
        })
    })

    it('marking a different answer keeps everything else', async () => {
        const state = storeWith(block())
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.findAll('.choiceOption__correct')[1].trigger('change')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.multipleChoice,
            value: { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'], correctOption: 1 },
        })
    })

    it('a block that is not selected renders the question read only', () => {
        const state = storeWith(block())
        state.selectBlock(-1)
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        expect(mux.find('input').exists()).toBe(false)
        expect(mux.find('.choiceBlockPreview__option--correct').text()).toContain('Sawubona')
    })

    it('picking multiple choice from the palette gives an empty question with two answers', async () => {
        const state = storeWith(new $ContentBlock(ContentBlockTypes.pendingSelection, {}))
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        const options = mux.findAll('.blockOption')
        expect(options.map(o => o.text()))
            .toEqual(['Text', 'Image', 'Audio', 'Multiple choice', 'Fill in the blank', 'Listen and choose'])

        await options[3].trigger('click')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.multipleChoice,
            value: { title: '', question: '', options: ['', ''], correctOption: 0 },
        })
    })
})

describe('BlockMux with a fill in the blank block', () => {
    function storeWith(block: $ContentBlock) {
        const state = contentBuilderScreenState()
        state.contentState = [[block]]
        state.page = 0
        state.selectBlock(0)
        return state
    }

    const block = () => new $ContentBlock(ContentBlockTypes.fillBlank, {
        title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'],
    })

    it('editing the sentence keeps the accepted spellings', async () => {
        const state = storeWith(block())
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.findAll('.blankBlockField__input')[1].setValue('You say [] at night.')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.fillBlank,
            value: { title: 'Greetings', sentence: 'You say [] at night.', accepted: ['sawubona'] },
        })
    })

    it('a block that is not selected renders the sentence read only', () => {
        const state = storeWith(block())
        state.selectBlock(-1)
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        expect(mux.find('input').exists()).toBe(false)
        expect(mux.find('.blankBlockPreview__gap').exists()).toBe(true)
    })

    it('picking fill in the blank from the palette gives an empty sentence with one spelling', async () => {
        const state = storeWith(new $ContentBlock(ContentBlockTypes.pendingSelection, {}))
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.findAll('.blockOption')[4].trigger('click')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.fillBlank,
            value: { title: '', sentence: '', accepted: [''] },
        })
    })
})

describe('BlockMux with a listen and choose block', () => {
    function storeWith(block: $ContentBlock) {
        const state = contentBuilderScreenState()
        state.contentState = [[block]]
        state.page = 0
        state.selectBlock(0)
        return state
    }

    const block = () => new $ContentBlock(ContentBlockTypes.listenChoose, {
        title: 'At the door', fileUrl: 'knock.mp3', transcript: 'Ubani lowo?',
        options: ['Who is that?', 'Where are you?'], correctOption: 0,
    })

    it('marking a different answer keeps the clip and the transcript', async () => {
        const state = storeWith(block())
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.findAll('.choiceOption__correct')[1].trigger('change')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.listenChoose,
            value: {
                title: 'At the door', fileUrl: 'knock.mp3', transcript: 'Ubani lowo?',
                options: ['Who is that?', 'Where are you?'], correctOption: 1,
            },
        })
    })

    it('editing the transcript keeps the answers', async () => {
        const state = storeWith(block())
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.find('textarea').setValue('Ubani lowo emnyango?')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.listenChoose,
            value: {
                title: 'At the door', fileUrl: 'knock.mp3', transcript: 'Ubani lowo emnyango?',
                options: ['Who is that?', 'Where are you?'], correctOption: 0,
            },
        })
    })

    it('picking listen and choose from the palette gives an empty clip with two answers', async () => {
        const state = storeWith(new $ContentBlock(ContentBlockTypes.pendingSelection, {}))
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.findAll('.blockOption')[5].trigger('click')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.listenChoose,
            value: { title: '', fileUrl: '', transcript: '', options: ['', ''], correctOption: 0 },
        })
    })
})
