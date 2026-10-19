import { describe, expect, it } from 'vitest'
import { isUnder13 } from '../age'

const today = new Date(Date.UTC(2026, 9, 17))

describe('isUnder13', () => {
  it('counts the 13th birthday on the day, as the server does', () => {
    expect(isUnder13('2013-10-17', today)).toBe(false)
    expect(isUnder13('2013-10-18', today)).toBe(true)
    expect(isUnder13('2018-05-05', today)).toBe(true)
    expect(isUnder13('2001-02-03', today)).toBe(false)
  })

  it('is neither for an empty, half-typed or impossible date', () => {
    expect(isUnder13('', today)).toBeNull()
    expect(isUnder13('2018-05', today)).toBeNull()
    expect(isUnder13('2018-02-30', today)).toBeNull()
  })
})
