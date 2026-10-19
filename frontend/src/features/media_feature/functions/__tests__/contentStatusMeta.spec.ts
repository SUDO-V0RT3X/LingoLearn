import { describe, it, expect } from 'vitest'
import { getStatusMeta, getRowActionLabel } from '../contentStatusMeta'

// brief tests for helper function "contentStatusMeta.ts"

describe('getStatusMeta', () => {
  it('returns the correct label and badge class for every status', () => {
    expect(getStatusMeta('draft')).toEqual({ label: 'Draft', badgeClass: '' })
    expect(getStatusMeta('pending')).toEqual({ label: 'Pending review', badgeClass: 'ui-badge--warning' })
    expect(getStatusMeta('approved')).toEqual({ label: 'Approved', badgeClass: 'ui-badge--success' })
    expect(getStatusMeta('rejected')).toEqual({ label: 'Rejected', badgeClass: 'ui-badge--danger' })
  })
})

describe('getRowActionLabel', () => {
  it('returns "Edit" for draft and rejected content', () => {
    expect(getRowActionLabel('draft')).toBe('Edit')
    expect(getRowActionLabel('rejected')).toBe('Edit')
  })

  it('returns "View" for pending and approved content', () => {
    expect(getRowActionLabel('pending')).toBe('View')
    expect(getRowActionLabel('approved')).toBe('View')
  })
})