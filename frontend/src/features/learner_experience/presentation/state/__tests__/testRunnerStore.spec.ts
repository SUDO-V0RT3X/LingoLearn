import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { testRunnerStore, isAnswered } from '@/features/learner_experience/presentation/state/testRunnerStore'
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource'
import { TestAttemptDataSource } from '@/features/learner_experience/datasources/learnerDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $ContentBlock, ContentBlockTypes, type $ContentRecord } from '@/features/shared/models/contentType'
import type { $TestResult } from '@/features/learner_experience/models/learnerTypes'

//Content as a learner receives it: the answers already taken out by the server.
const choice = new $ContentBlock(ContentBlockTypes.multipleChoice,
  { title: 'Greetings', question: 'Hello?', options: ['Hamba kahle', 'Sawubona'] } as never)
const gap = new $ContentBlock(ContentBlockTypes.fillBlank,
  { title: 'Greetings', sentence: 'You say [] in the morning.' } as never)
const text = new $ContentBlock(ContentBlockTypes.text, { title: '', text: 'Sawubona means hello.' })

const record = (over: Partial<$ContentRecord> = {}): $ContentRecord => ({
  contentId: 9, authorId: 3, title: 'Greetings test', language: 'zulu', childFriendly: true,
  status: 'approved', version: 1, level: 1, chosenTags: [], kind: 'quiz',
  content: [[text], [choice, gap]], updatedAt: '2026-09-16T09:00:00.000Z', submittedAt: null, ...over,
})

const result = (over: Partial<$TestResult> = {}): $TestResult => ({
  attemptId: 1, contentId: 9, total: 2, score: 2, percent: 100, passed: true, passMark: 70, countsTowardLevelUp: true,
  questions: [{ correct: true }, { correct: true }], ...over,
})

describe('testRunnerStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(record(), null))
  })

  it('nominal: picks out the questions in reading order with blank answers', async () => {
    const store = testRunnerStore()
    await store.load(9)

    expect(store.questions.map((block) => block.itemType)).toEqual(['Multiple Choice', 'Fill in the Blank'])
    expect(store.answers).toEqual([null, ''])
    expect(store.index).toBe(0)
    expect(store.title).toBe('Greetings test')
    expect(store.hasLoaded).toBe(true)
  })

  it('only moves forward, and only once the question is answered', async () => {
    const store = testRunnerStore()
    await store.load(9)

    store.next()
    expect(store.index).toBe(0)

    store.setAnswer(1)
    store.next()
    expect(store.index).toBe(1)
    expect(store.progress).toBe(50)

    //There is no going back, and no going past the last question.
    store.setAnswer('sawubona')
    store.next()
    expect(store.index).toBe(1)
    expect('previous' in store).toBe(false)
  })

  it('sends one answer per question, trimmed, and keeps the result', async () => {
    const submit = vi.spyOn(TestAttemptDataSource, 'submit').mockResolvedValue(new $DataSourceResponse(result(), null))
    const store = testRunnerStore()
    await store.load(9)
    store.setAnswer(1)
    store.next()
    store.setAnswer('  Sawubona ')
    await store.submit()

    expect(submit).toHaveBeenCalledWith(9, [1, 'Sawubona'])
    expect(store.result?.percent).toBe(100)
  })

  it('boundary: will not submit before the last question is answered', async () => {
    const submit = vi.spyOn(TestAttemptDataSource, 'submit')
    const store = testRunnerStore()
    await store.load(9)
    store.setAnswer(1)
    await store.submit()
    store.next()
    await store.submit()

    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps the answers when marking fails, so the learner can send them again', async () => {
    vi.spyOn(TestAttemptDataSource, 'submit').mockResolvedValue(new $DataSourceResponse<$TestResult>(
      null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'Network error', statusCode: 0 })))
    const store = testRunnerStore()
    await store.load(9)
    store.setAnswer(0)
    store.next()
    store.setAnswer('hello')
    await store.submit()

    expect(store.result).toBeNull()
    expect(store.submitError?.statusCode).toBe(0)
    expect(store.answers).toEqual([0, 'hello'])
    expect(store.isSubmitting).toBe(false)
  })

  it('retry starts the same test again from the first question', async () => {
    vi.spyOn(TestAttemptDataSource, 'submit').mockResolvedValue(new $DataSourceResponse(result(), null))
    const store = testRunnerStore()
    await store.load(9)
    store.setAnswer(1)
    store.next()
    store.setAnswer('x')
    await store.submit()
    store.retry()

    expect(store.result).toBeNull()
    expect(store.index).toBe(0)
    expect(store.answers).toEqual([null, ''])
  })

  it('invalid input: content the server refuses, or that is not approved, is a load error', async () => {
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse<$ContentRecord>(
      null, new Exception({ exceptionType: ExceptionType.FORBIDDEN, message: 'this content is above your level', statusCode: 403 })))
    const store = testRunnerStore()
    await store.load(9)
    expect(store.loadError?.statusCode).toBe(403)
    expect(store.questions).toEqual([])

    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(record({ status: 'pending' }), null))
    await store.load(9)
    expect(store.loadError?.statusCode).toBe(403)
  })

  it('content with no questions loads with an empty test', async () => {
    vi.spyOn(ContentDataSource, 'getContent').mockResolvedValue(new $DataSourceResponse(record({ content: [[text]], kind: 'story' }), null))
    const store = testRunnerStore()
    await store.load(9)
    expect(store.loadError).toBeNull()
    expect(store.questions).toEqual([])
  })
})

describe('isAnswered', () => {
  it('a pick or typed word counts; nothing, or only spaces, does not', () => {
    expect(isAnswered(0)).toBe(true)
    expect(isAnswered('a')).toBe(true)
    expect(isAnswered(null)).toBe(false)
    expect(isAnswered('   ')).toBe(false)
  })
})
