import { describe, it, expect, beforeEach } from 'vitest'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { i18n } from '@/i18n'
import { friendlyError, levelLabel, progressPercent, starsFor, tagLabel } from '@/features/learner_experience/functions/learnerCopy'

const error = (message: string, statusCode = 500) =>
  new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode })

describe('levelLabel', () => {
  it('nominal: names a level with its reference label', () => {
    expect(levelLabel(2)).toBe('Level 2 · A1+')
  })

  it('boundary: the first and last levels are named, one past the scale is just a number', () => {
    expect(levelLabel(1)).toBe('Level 1 · A1')
    expect(levelLabel(6)).toBe('Level 6 · C1')
    expect(levelLabel(7)).toBe('Level 7')
  })

  it('invalid input: no level at all', () => {
    expect(levelLabel(null)).toBe('No level')
  })
})

describe('friendlyError', () => {
  it('nominal: turns the server\'s level refusal into words a learner understands', () => {
    expect(friendlyError(error('this content is above your level', 403))).toMatch(/above your level for now/)
  })

  it('nominal: a lost connection says so', () => {
    expect(friendlyError(error('Network error', 0))).toMatch(/can’t reach/)
  })

  it('shows any other message as sent, capitalised', () => {
    expect(friendlyError(error('expected 3 answers, got 2', 400))).toBe('Expected 3 answers, got 2')
  })

  it('invalid input: no error is no message, and an empty message is still a sentence', () => {
    expect(friendlyError(null)).toBe('')
    expect(friendlyError(error('', 500))).toBe('Something went wrong. Please try again.')
  })
})

describe('starsFor', () => {
  it('nominal: 80% is four stars', () => {
    expect(starsFor(80)).toBe(4)
  })

  it('boundary: 0% is none, 100% is all five, 70% rounds to four', () => {
    expect(starsFor(0)).toBe(0)
    expect(starsFor(100)).toBe(5)
    expect(starsFor(70)).toBe(4)
  })

  it('invalid input: out-of-range or missing scores are clamped', () => {
    expect(starsFor(150)).toBe(5)
    expect(starsFor(-10)).toBe(0)
    expect(starsFor(Number.NaN)).toBe(0)
  })
})

describe('progressPercent', () => {
  it('nominal: three of six is half way', () => {
    expect(progressPercent(3, 6)).toBe(50)
  })

  it('boundary: more than the total is full, a zero total is empty', () => {
    expect(progressPercent(8, 6)).toBe(100)
    expect(progressPercent(1, 0)).toBe(0)
  })
})

describe('in isiZulu', () => {
  beforeEach(() => { i18n.global.locale.value = 'zulu' })

  it('nominal: level names and the level refusal follow the interface language', () => {
    expect(levelLabel(2)).toBe('Izinga 2 · A1+')
    expect(levelLabel(null)).toBe('Alikho izinga')
    expect(friendlyError(error('this content is above your level', 403))).toMatch(/kungaphezu kwezinga lakho/)
  })

  it('known server and app messages are shown in isiZulu, not English', () => {
    expect(friendlyError(error('this content has no test', 400))).toBe('Lokhu okuqukethwe akunasivivinyo')
    expect(friendlyError(error('expected 3 answers, got 2', 400))).toBe('Bekulindeleke izimpendulo ezingu-3, kodwa kufike ezingu-2')
    expect(friendlyError(error('Failed to send your answers. Please try again.', 500))).toMatch(/^Asikwazanga ukuthumela/)
    expect(friendlyError(error('Network error', 0))).not.toMatch(/can’t reach/)
  })

  it('an unknown message is still shown as sent', () => {
    expect(friendlyError(error('something new', 500))).toBe('Something new')
  })
})

describe('tagLabel', () => {
  it('nominal: a known theme tag reads as words, in both languages', () => {
    expect(tagLabel('daily-life')).toBe('Daily life')
    expect(tagLabel('shopping')).toBe('Shopping')
    i18n.global.locale.value = 'zulu'
    expect(tagLabel('daily-life')).toBe('Impilo yansuku zonke')
    expect(tagLabel('listening')).toBe('Ukulalela')
  })

  it('boundary: a tag the app has no name for is tidied, not shown raw', () => {
    expect(tagLabel('market-day')).toBe('Market day')
    expect(tagLabel('road_safety')).toBe('Road safety')
    expect(tagLabel('')).toBe('')
  })
})

describe('friendlyError for content a learner cannot see', () => {
  it('a draft, pending or rejected piece just is not available, never "another author"', () => {
    const text = friendlyError(error('this content belongs to another author', 403))
    expect(text).toContain('isn’t available to read')
    expect(text).not.toMatch(/author/i)
  })
})
