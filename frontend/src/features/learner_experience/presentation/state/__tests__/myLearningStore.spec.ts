import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { myLearningStore } from '@/features/learner_experience/presentation/state/myLearningStore'
import { TestAttemptDataSource } from '@/features/learner_experience/datasources/learnerDataSource'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import type { $MyLearning } from '@/features/learner_experience/models/learnerTypes'

const learning = (over: Partial<$MyLearning> = {}): $MyLearning => ({
  currentLevel: 2, testsPassedAtLevel: 3, testsRequired: 6, readyForChallenge: false,
  testsCompleted: 4, testsPassed: 3, averagePercent: 75, history: [], bestResults: [], continueReading: [], ...over,
})

const failed = () => new $DataSourceResponse<$MyLearning>(
  null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'Failed to load your learning.', statusCode: 500 }))

describe('myLearningStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('nominal: loads the summary and works out progress toward the challenge', async () => {
    vi.spyOn(TestAttemptDataSource, 'getMyLearning').mockResolvedValue(new $DataSourceResponse(learning(), null))
    const store = myLearningStore()
    await store.load()

    expect(store.summary?.currentLevel).toBe(2)
    expect(store.challengeProgress).toBe(50)
    expect(store.testsToGo).toBe(3)
    expect(store.isLoading).toBe(false)
  })

  it('boundary: more passes than required is full progress with none to go', async () => {
    vi.spyOn(TestAttemptDataSource, 'getMyLearning')
      .mockResolvedValue(new $DataSourceResponse(learning({ testsPassedAtLevel: 8, readyForChallenge: true }), null))
    const store = myLearningStore()
    await store.load()

    expect(store.challengeProgress).toBe(100)
    expect(store.testsToGo).toBe(0)
  })

  it('keeps the last good summary when a reload fails', async () => {
    vi.spyOn(TestAttemptDataSource, 'getMyLearning')
      .mockResolvedValueOnce(new $DataSourceResponse(learning(), null))
      .mockResolvedValueOnce(failed())
    const store = myLearningStore()
    await store.load()
    await store.load()

    expect(store.summary?.currentLevel).toBe(2)
    expect(store.error?.message).toBe('Failed to load your learning.')
  })

  it('invalid input: nothing loaded yet means no progress, not a crash', async () => {
    vi.spyOn(TestAttemptDataSource, 'getMyLearning').mockResolvedValue(failed())
    const store = myLearningStore()
    await store.load()

    expect(store.summary).toBeNull()
    expect(store.challengeProgress).toBe(0)
    expect(store.testsToGo).toBe(0)
  })
})
