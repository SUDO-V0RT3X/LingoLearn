import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '../formatRelativeTime'

// brief tests for formatRelativeTime.ts helper function
const NOW = new Date('2026-09-12T12:00:00.000Z')

describe('formatRelativeTime', () => {
  it('returns "Just now" for under an hour', () => {
    const thirtyMinAgo = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString()
    expect(formatRelativeTime(thirtyMinAgo, NOW)).toBe('Just now')
  })

  it('returns "N h ago" for same-day times', () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(twoHoursAgo, NOW)).toBe('2 h ago')
  })

  it('returns "Yesterday" for exactly one day ago', () => {
    const oneDayAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(oneDayAgo, NOW)).toBe('Yesterday')
  })

  it('returns "N days ago" for multiple days', () => {
    const threeDaysAgo = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(threeDaysAgo, NOW)).toBe('3 days ago')
  })
})