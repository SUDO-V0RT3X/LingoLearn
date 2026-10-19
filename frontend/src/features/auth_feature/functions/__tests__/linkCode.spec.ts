import { describe, expect, it } from 'vitest'
import { groupLinkCode, isLinkCode, normalizeLinkCode } from '../linkCode'

describe('link code helpers', () => {
  it('nominal: drops the spaces and dashes a code is read out with, and capitalises it', () => {
    expect(normalizeLinkCode('abc 234')).toBe('ABC234')
    expect(normalizeLinkCode(' ABC-234 ')).toBe('ABC234')
    expect(normalizeLinkCode('a-b c-2 3-4')).toBe('ABC234')
  })

  it('boundary: accepts exactly 6 letters and digits once separators are gone', () => {
    expect(isLinkCode('ABC 234')).toBe(true)
    expect(isLinkCode('abc-234')).toBe(true)
    expect(isLinkCode('ABC 23')).toBe(false)
    expect(isLinkCode('ABC 2345')).toBe(false)
  })

  it('invalid: refuses other characters', () => {
    expect(isLinkCode('ABC.234')).toBe(false)
    expect(isLinkCode('ABC_234')).toBe(false)
    expect(isLinkCode('')).toBe(false)
  })

  it('splits a code into two groups of three for reading aloud', () => {
    expect(groupLinkCode('ABC234')).toEqual(['ABC', '234'])
    expect(groupLinkCode('AB')).toEqual(['AB'])
  })
})
