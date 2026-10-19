import { describe, it, expect } from 'vitest'
import { $ContentBlock, ContentBlockTypes, QUESTION_BLOCK_TYPES, emptyValueFor } from '@/features/shared/models/contentType'
import { answersAreUsable, blockProblem, deriveContentKind, isAvailableTag, submissionChecks, type SubmissionDetails } from '../submission'

const text = (title: string, body: string) => new $ContentBlock(ContentBlockTypes.text, { title, text: body })
const audio = (transcript: string, fileUrl = '/uploads/audio/clip.mp3') =>
    new $ContentBlock(ContentBlockTypes.audio, { title: 'clip', fileUrl, transcript })
const image = (fileUrl = '/uploads/images/a.png', altText = 'A picture') =>
    new $ContentBlock(ContentBlockTypes.image, { title: 'caption', fileUrl, altText })
const choice = (over: Partial<{ question: string; options: string[]; correctOption: number }> = {}) =>
    new $ContentBlock(ContentBlockTypes.multipleChoice,
        { title: 'Greetings', question: 'Hello?', options: ['Sawubona', 'Hamba kahle'], correctOption: 0, ...over })
const fillBlank = (over: Partial<{ sentence: string; accepted: string[] }> = {}) =>
    new $ContentBlock(ContentBlockTypes.fillBlank,
        { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'], ...over })
const listen = (over: Partial<{ fileUrl: string; transcript: string; options: string[]; correctOption: number }> = {}) =>
    new $ContentBlock(ContentBlockTypes.listenChoose,
        { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?',
          options: ['Who is that?', 'Where are you?'], correctOption: 0, ...over })
const pending = () => new $ContentBlock(ContentBlockTypes.pendingSelection, emptyValueFor(ContentBlockTypes.pendingSelection))

//The title, language, theme and audience are set on the submit screen; pass them in as ready
//unless a test is about them.
const details = (level: number | null, over: Partial<SubmissionDetails> = {}) =>
    ({
        title: 'Saying hello',
        language: 'english' as const,
        level,
        theme: 'travel',
        audience: 'general',
        chosenTags: ['travel'],
        ...over,
    })

const failedLabels = (pages: $ContentBlock[][], level: number | null,
                      over?: Partial<SubmissionDetails>) =>
    submissionChecks(pages, details(level, over)).filter(c => !c.passed).map(c => c.label)

describe('deriveContentKind', () => {
    it('nominal: text and audio only is a story', () => {
        expect(deriveContentKind([[text('a', 'b'), audio('t')]])).toBe('story')
    })

    it('nominal: each question type makes it a quiz', () => {
        expect(deriveContentKind([[text('a', 'b'), choice()]])).toBe('quiz')
        expect(deriveContentKind([[text('a', 'b'), fillBlank()]])).toBe('quiz')
        expect(deriveContentKind([[text('a', 'b'), listen()]])).toBe('quiz')
    })

    it('one question on a later page is enough', () => {
        expect(deriveContentKind([[text('a', 'b')], [audio('t')], [choice()]])).toBe('quiz')
    })

    it('boundary: empty content is a story', () => {
        expect(deriveContentKind([])).toBe('story')
        expect(deriveContentKind([[]])).toBe('story')
    })

    it('a block with no type yet is not a question', () => {
        expect(deriveContentKind([[text('a', 'b')], [audio('t'), pending()]])).toBe('story')
    })

    it('the list names exactly the three question types', () => {
        expect([...QUESTION_BLOCK_TYPES].sort()).toEqual(
            [ContentBlockTypes.fillBlank, ContentBlockTypes.listenChoose, ContentBlockTypes.multipleChoice].sort())
    })
})

describe('submissionChecks', () => {
    it('nominal: a complete draft passes every check', () => {
        expect(failedLabels([[text('Greetings', 'Hola')], [audio('Buenos dias')]], 3)).toEqual([])
    })

    it('always returns every check, passed or not, so the screen can list them all', () => {
        expect(submissionChecks([[text('a', 'b')]], details(1))).toHaveLength(14)
        expect(submissionChecks([], details(null))).toHaveLength(14)
    })

    it('invalid input: no level chosen', () => {
        expect(failedLabels([[text('a', 'b')]], null)).toEqual(['Level chosen'])
    })

    it('invalid input: no title, and no language', () => {
        expect(failedLabels([[text('a', 'b')]], 2, { title: '  ' })).toEqual(['Title written'])
        expect(failedLabels([[text('a', 'b')]], 2, { language: null })).toEqual(['Language chosen'])
    })

    it('invalid input: media with no file, and an image with no alt text', () => {
        expect(failedLabels([[audio('t', '')]], 2)).toEqual(['Every audio clip has a file and a transcript'])
        expect(failedLabels([[image('')]], 2)).toEqual(['Every image has a file and alt text'])
        expect(failedLabels([[image('/uploads/images/a.png', '')]], 2)).toEqual(['Every image has a file and alt text'])
    })

    it('boundary: a page with no blocks, and content with no pages at all', () => {
        expect(failedLabels([[text('a', 'b')], []], 2)).toEqual(['Every page has at least one block'])
        expect(failedLabels([], 2)).toEqual(['Every page has at least one block'])
    })

    it('invalid input: a block still waiting for a type', () => {
        expect(failedLabels([[text('a', 'b'), pending()]], 2)).toEqual(['Every block has a type'])
    })

    it('invalid input: a text block missing its title or its text', () => {
        expect(failedLabels([[text('', 'body')]], 2)).toEqual(['Every text block has a title and text'])
        expect(failedLabels([[text('title', '')]], 2)).toEqual(['Every text block has a title and text'])
    })

    it('boundary: whitespace does not count as content', () => {
        expect(failedLabels([[text('   ', '  ')]], 2)).toEqual(['Every text block has a title and text'])
        expect(failedLabels([[audio('   ')]], 2)).toEqual(['Every audio clip has a file and a transcript'])
    })

    it('boundary: with no audio at all, the transcript check passes', () => {
        expect(failedLabels([[text('a', 'b')]], 2)).not.toContain('Every audio clip has a file and a transcript')
    })

    it('every failure is reported together, not just the first', () => {
        expect(failedLabels([[pending(), text('', '')], []], null, { title: '', language: null, theme: null, audience: null })).toEqual([
            'Title written',
            'Language chosen',
            'Level chosen',
            'Theme chosen (exactly one)',
            'Audience chosen',
            'Every page has at least one block',
            'Every block has a type',
            'Every text block has a title and text',
        ])
    })

    it('Table IV Test 9: passes when exactly one level, theme, audience, and content type are valid', () => {
        expect(failedLabels([[text('a', 'b')]], 1, { theme: 'travel', audience: 'child-friendly' })).toEqual([])
    })

    it('Table IV Test 10: fails when multiple themes are selected', () => {
        expect(failedLabels([[text('a', 'b')]], 1, { theme: ['travel', 'food'] })).toContain('Theme chosen (exactly one)')
    })

    it('Table IV Test 11: fails when audience tag is left blank', () => {
        expect(failedLabels([[text('a', 'b')]], 1, { audience: '' })).toContain('Audience chosen')
        expect(failedLabels([[text('a', 'b')]], 1, { audience: null })).toContain('Audience chosen')
    })

    it('fails when total tags exceed 10', () => {
        const elevenTags = Array.from({ length: 11 }, (_, i) => `tag-${i}`)
        expect(failedLabels([[text('a', 'b')]], 1, { chosenTags: elevenTags })).toContain('Total tags do not exceed 10')
    })
})

describe('the tag set the taxonomy offers', () => {
    //What the taxonomy endpoint returns for theme tags.
    const available = ['greetings', 'travel', 'food']

    it('nominal: every offered tag is available', () => {
        for (const tag of available) {
            expect(isAvailableTag(tag, available)).toBe(true)
        }
    })

    it('invalid input: a tag the author made up is not available', () => {
        expect(isAvailableTag('my own tag', available)).toBe(false)
        expect(isAvailableTag('', available)).toBe(false)
    })

    it('boundary: matching is exact, so a different casing or stray space is refused', () => {
        expect(isAvailableTag('Travel', available)).toBe(false)
        expect(isAvailableTag(' travel', available)).toBe(false)
    })

    it('boundary: nothing is available before the tags have loaded', () => {
        expect(isAvailableTag('travel', [])).toBe(false)
    })
})

describe('answersAreUsable', () => {
    it('nominal: two filled in answers with the first marked', () => {
        expect(answersAreUsable(['Sawubona', 'Hamba kahle'], 0)).toBe(true)
    })

    it('boundary: one answer is not a choice, and an empty one does not count', () => {
        expect(answersAreUsable(['Sawubona'], 0)).toBe(false)
        expect(answersAreUsable(['Sawubona', '   '], 0)).toBe(false)
    })

    it('invalid input: the same answer twice, whatever the case', () => {
        expect(answersAreUsable(['Sawubona', 'Sawubona'], 0)).toBe(false)
        expect(answersAreUsable(['Sawubona', 'sawubona'], 0)).toBe(false)
    })

    it('invalid input: the mark is out of range, or on an empty answer', () => {
        expect(answersAreUsable(['a', 'b'], 2)).toBe(false)
        expect(answersAreUsable(['a', 'b'], -1)).toBe(false)
        expect(answersAreUsable(['a', 'b', '  '], 2)).toBe(false)
    })

    it('a third answer left empty is allowed, as long as two are filled in', () => {
        expect(answersAreUsable(['a', 'b', ''], 1)).toBe(true)
    })
})

describe('submissionChecks on question blocks', () => {
    it('nominal: a draft of finished questions passes every check', () => {
        expect(failedLabels([[choice(), fillBlank(), listen()]], 3)).toEqual([])
    })

    it('invalid input: a multiple choice block with no question, or unusable answers', () => {
        expect(failedLabels([[choice({ question: '  ' })]], 3)).toEqual(['Every multiple choice question is answerable'])
        expect(failedLabels([[choice({ options: ['Sawubona', ''] })]], 3))
            .toEqual(['Every multiple choice question is answerable'])
    })

    it('invalid input: a sentence with no gap, two gaps, or nothing accepted', () => {
        const label = 'Every sentence has one [] and a spelling to accept'
        expect(failedLabels([[fillBlank({ sentence: 'You say nothing.' })]], 3)).toEqual([label])
        expect(failedLabels([[fillBlank({ sentence: 'You say [] and [].' })]], 3)).toEqual([label])
        expect(failedLabels([[fillBlank({ accepted: ['  '] })]], 3)).toEqual([label])
    })

    it('invalid input: a listening question with no clip, no transcript, or one answer', () => {
        const label = 'Every listening question has a clip, a transcript and answers'
        expect(failedLabels([[listen({ fileUrl: '' })]], 3)).toEqual([label])
        expect(failedLabels([[listen({ transcript: '  ' })]], 3)).toEqual([label])
        expect(failedLabels([[listen({ options: ['Who is that?'] })]], 3)).toEqual([label])
    })

    it('a draft with no question blocks passes the question checks vacuously', () => {
        expect(failedLabels([[text('a', 'b')]], 3)).toEqual([])
    })
})

describe('blockProblem', () => {
    it('nominal: a finished block of every type has no problem', () => {
        for (const block of [text('a', 'b'), image(), audio('Sawubona'), choice(), fillBlank(), listen()]) {
            expect(blockProblem(block)).toBeNull()
        }
    })

    it('names the check each unfinished block fails, so the screen can mark that block', () => {
        expect(blockProblem(text('', 'b'))).toBe('textBlocks')
        expect(blockProblem(image('/uploads/images/a.png', ''))).toBe('images')
        expect(blockProblem(audio('  '))).toBe('audio')
        expect(blockProblem(choice({ question: '' }))).toBe('multipleChoice')
        expect(blockProblem(fillBlank({ sentence: 'You say nothing.' }))).toBe('fillBlank')
        expect(blockProblem(listen({ fileUrl: '' }))).toBe('listenChoose')
        expect(blockProblem(pending())).toBe('blocksHaveType')
    })

    it('invalid input: answers that look filled in but repeat, or a mark on an empty one, still fail', () => {
        expect(blockProblem(choice({ options: ['Yebo', 'yebo'] }))).toBe('multipleChoice')
        expect(blockProblem(choice({ options: ['Yebo', 'Cha', ''], correctOption: 2 }))).toBe('multipleChoice')
    })

    it('agrees with the checks: a draft fails a block check exactly when one of its blocks has that problem', () => {
        const pages = [[text('a', 'b'), choice({ question: '' })], [fillBlank()]]
        const failed = submissionChecks(pages, details(3)).filter(c => !c.passed).map(c => c.key)
        expect(failed).toEqual(['multipleChoice'])
        expect(pages.flat().map(blockProblem).filter(Boolean)).toEqual(['multipleChoice'])
    })
})
