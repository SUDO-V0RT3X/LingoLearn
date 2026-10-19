import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ContentTypeAudioBar from '../ContentTypeAudioBar.vue'
import ContentTypeImageBar from '../ContentTypeImageBar.vue'
import BlockMux from '../BlockMux.vue'
import { contentBuilderScreenState } from '../../state'
import { $ContentBlock, ContentBlockTypes } from '@/features/shared/models/contentType'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'

beforeEach(() => { setActivePinia(createPinia()) })

describe('ContentTypeAudioBar', () => {
    const clip = { title: 'Answering the phone', fileUrl: 'http://localhost:4000/uploads/audio/answering.mp3', transcript: 'Hallo?' }

    it('nominal: editable shows the title and transcript fields, and the upload button', () => {
        const bar = mount(ContentTypeAudioBar, { props: { ...clip, editable: true } })
        const fields = bar.findAll('.mediaBlockField__input')
        expect(fields.map(f => (f.element as HTMLInputElement).value)).toEqual([clip.title, clip.transcript])
        //The upload control is the shared field now; the audio bar only places it.
        expect(bar.find('input[type="file"]').attributes('accept')).toBe('audio/*')
        expect(bar.find('.audioUpload__button').text()).toBe('Change file')
        expect(bar.find('.audioUpload__name').text()).toBe('answering.mp3')
    })

    it('the upload button offers to choose a file when the block has none', () => {
        const bar = mount(ContentTypeAudioBar, { props: { editable: true } })
        expect(bar.find('.audioUpload__button').text()).toBe('Choose file')
        expect(bar.find('.audioUpload__name').text()).toBe('No file attached')
    })

    it('typing in the transcript sends the new transcript up', async () => {
        const bar = mount(ContentTypeAudioBar, { props: { ...clip, editable: true } })
        await bar.find('textarea').setValue('Hallo? Is Pieter daar?')
        expect(bar.emitted('update:transcript')?.at(-1)).toEqual(['Hallo? Is Pieter daar?'])
    })

    it('read only plays the clip as content, with no fields', () => {
        const bar = mount(ContentTypeAudioBar, { props: { ...clip, editable: false } })
        expect(bar.find('input').exists()).toBe(false)
        expect(bar.text()).toContain('Answering the phone')
        expect(bar.find('audio').attributes('src')).toContain('answering.mp3')
        expect(bar.text()).toContain('Hallo?')
    })

    it('boundary: an empty clip says what is missing', () => {
        const bar = mount(ContentTypeAudioBar, { props: { editable: false } })
        expect(bar.text()).toContain('Untitled audio')
        expect(bar.text()).toContain('No file attached')
        expect(bar.text()).toContain('No transcript yet')
    })
})

describe('ContentTypeImageBar', () => {
    const picture = { title: 'A phone box', fileUrl: '/uploads/images/phone-box.png', altText: 'A red phone box on a street corner' }

    afterEach(() => { vi.restoreAllMocks() })

    //Picks a file in the hidden input, as the browser would after the dialog.
    async function pick(bar: ReturnType<typeof mount>, file: File) {
        const input = bar.find('input[type="file"]')
        Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
        await input.trigger('change')
        await flushPromises()
    }

    it('nominal: editable shows the caption and alt text fields, the upload control and a preview', () => {
        const bar = mount(ContentTypeImageBar, { props: { ...picture, editable: true } })
        const fields = bar.findAll('.mediaBlockField__input')
        expect(fields.map(f => (f.element as HTMLInputElement).value)).toEqual([picture.title, picture.altText])
        expect(bar.find('input[type="file"]').attributes('accept')).toBe('image/png,image/jpeg,image/webp,image/gif')
        expect(bar.find('.imageUpload__button').text()).toBe('Change image')
        expect(bar.find('.imageUpload__name').text()).toBe('phone-box.png')
        expect(bar.find('img.imageUpload__preview').attributes('src')).toContain('/uploads/images/phone-box.png')
    })

    it('choosing a picture uploads it and keeps the link the server answers with', async () => {
        const spy = vi.spyOn(MediaDataSource, 'uploadImage')
            .mockResolvedValue({ data: { fileUrl: '/uploads/images/new.png' }, error: null })
        const bar = mount(ContentTypeImageBar, { props: { editable: true } })
        expect(bar.find('.imageUpload__button').text()).toBe('Choose image')

        await pick(bar, new File(['png'], 'hut.png', { type: 'image/png' }))
        expect(spy).toHaveBeenCalledOnce()
        expect(bar.emitted('update:fileUrl')?.at(-1)).toEqual(['/uploads/images/new.png'])
    })

    it('invalid input: a file that is not an allowed image is never sent', async () => {
        const spy = vi.spyOn(MediaDataSource, 'uploadImage')
        const bar = mount(ContentTypeImageBar, { props: { editable: true } })
        await pick(bar, new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))
        expect(spy).not.toHaveBeenCalled()
        expect(bar.find('[role="alert"]').text()).toMatch(/Unsupported format/)
        expect(bar.emitted('update:fileUrl')).toBeUndefined()
    })

    it('a refused upload shows the server\'s reason and keeps the old picture', async () => {
        vi.spyOn(MediaDataSource, 'uploadImage').mockResolvedValue({
            data: null,
            error: new Exception({ exceptionType: ExceptionType.FAILED, message: 'The file content is not the image type its name and type claim.', statusCode: 400 }),
        })
        const bar = mount(ContentTypeImageBar, { props: { ...picture, editable: true } })
        await pick(bar, new File(['x'], 'fake.png', { type: 'image/png' }))
        expect(bar.find('[role="alert"]').text()).toMatch(/not the image type/)
        expect(bar.emitted('update:fileUrl')).toBeUndefined()
    })

    it('boundary: an old typed link is not loaded and asks for an upload instead', () => {
        const bar = mount(ContentTypeImageBar, { props: { ...picture, fileUrl: 'https://example.com/a.png', editable: true } })
        expect(bar.find('img').exists()).toBe(false)
        expect(bar.find('[role="alert"]').text()).toMatch(/not an upload/)
    })

    it('typing in the alt text sends the new alt text up', async () => {
        const bar = mount(ContentTypeImageBar, { props: { ...picture, editable: true } })
        await bar.findAll('.mediaBlockField__input')[1].setValue('A phone box')
        expect(bar.emitted('update:altText')?.at(-1)).toEqual(['A phone box'])
    })

    it('read only shows the uploaded picture with its alt text, and the caption', () => {
        const bar = mount(ContentTypeImageBar, { props: { ...picture, editable: false } })
        expect(bar.find('input').exists()).toBe(false)
        expect(bar.find('img').attributes('alt')).toBe(picture.altText)
        expect(bar.find('img').attributes('src')).toContain('/uploads/images/phone-box.png')
        expect(bar.find('figcaption').text()).toBe('A phone box')
    })

    it('boundary: an empty image says what is missing', () => {
        const bar = mount(ContentTypeImageBar, { props: { editable: false } })
        expect(bar.text()).toContain('No file attached')
        expect(bar.text()).toContain('No caption')
        expect(bar.text()).toContain('No alt text yet')
        expect(bar.find('[role="img"]').attributes('aria-label')).toBe('Image with no description')
        expect(bar.find('img').exists()).toBe(false)
    })
})

describe('BlockMux with audio and image blocks', () => {
    function storeWith(block: $ContentBlock) {
        const state = contentBuilderScreenState()
        state.contentState = [[block]]
        state.page = 0
        state.selectBlock(0)
        return state
    }

    it('editing one audio field keeps the other two', async () => {
        const state = storeWith(new $ContentBlock(ContentBlockTypes.audio, { title: 'Clip', fileUrl: 'clip.mp3', transcript: '' }))
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.find('textarea').setValue('Goeie more')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.audio,
            value: { title: 'Clip', fileUrl: 'clip.mp3', transcript: 'Goeie more' },
        })
    })

    it('editing one image field keeps the other two', async () => {
        const state = storeWith(new $ContentBlock(ContentBlockTypes.image, { title: 'Caption', fileUrl: 'a.png', altText: '' }))
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        await mux.findAll('.mediaBlockField__input')[1].setValue('A café counter')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.image,
            value: { title: 'Caption', fileUrl: 'a.png', altText: 'A café counter' },
        })
    })

    it('a block that is not selected renders read only', () => {
        const state = storeWith(new $ContentBlock(ContentBlockTypes.image, { title: 'Caption', fileUrl: 'a.png', altText: 'Alt' }))
        state.selectBlock(-1)
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        expect(mux.find('input').exists()).toBe(false)
        expect(mux.find('figcaption').text()).toBe('Caption')
    })

    it('a block with no type offers image as one of its types, and picking it gives an empty image', async () => {
        const state = storeWith(new $ContentBlock(ContentBlockTypes.pendingSelection, {}))
        const mux = mount(BlockMux, { props: { page: 0, block: 0 } })
        const options = mux.findAll('.blockOption')
        expect(options.map(o => o.text())).toEqual(['Text', 'Image', 'Audio', 'Multiple choice', 'Fill in the blank', 'Listen and choose'])
        await options[1].trigger('click')
        expect(state.contentState[0][0]).toEqual({
            itemType: ContentBlockTypes.image,
            value: { title: '', fileUrl: '', altText: '' },
        })
    })
})
