import { describe, it, expect } from 'vitest'
import { fileNameFromUrl } from '../fileName'

describe('fileNameFromUrl', () => {
    it('nominal: takes the file name from a full upload link', () => {
        expect(fileNameFromUrl('http://localhost:4000/uploads/audio/1694556000000-clip.mp3')).toBe('1694556000000-clip.mp3')
    })

    it('nominal: a bare file name is returned as it is', () => {
        expect(fileNameFromUrl('placeholder.png')).toBe('placeholder.png')
    })

    it('drops a query string, a fragment and a trailing slash', () => {
        expect(fileNameFromUrl('https://cdn.example/img/phone-box.png?v=2#top')).toBe('phone-box.png')
        expect(fileNameFromUrl('/uploads/audio/clip.mp3/')).toBe('clip.mp3')
    })

    it('decodes escaped characters so the name reads normally', () => {
        expect(fileNameFromUrl('/uploads/audio/ordering%20a%20coffee.mp3')).toBe('ordering a coffee.mp3')
    })

    it('invalid input: a broken escape is shown as written instead of throwing', () => {
        expect(fileNameFromUrl('/uploads/100%.png')).toBe('100%.png')
    })

    it('boundary: an empty or blank link has no file name', () => {
        expect(fileNameFromUrl('')).toBe('')
        expect(fileNameFromUrl('   ')).toBe('')
    })
})
