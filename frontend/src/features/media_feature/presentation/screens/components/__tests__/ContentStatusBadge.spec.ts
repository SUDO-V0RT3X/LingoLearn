import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContentStatusBadge from '../ContentStatusBadge.vue'

describe('ContentStatusBadge', () => {
  it('renders the right label for every status', () => {
    const labels = { draft: 'Draft', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' } as const
    for (const status of Object.keys(labels) as (keyof typeof labels)[]) {
      const wrapper = mount(ContentStatusBadge, { props: { status } })
      expect(wrapper.text()).toBe(labels[status])
    }
  })
  it('uses the design-system badge colour for the status', () => {
    expect(mount(ContentStatusBadge, { props: { status: 'approved' } }).classes()).toContain('ui-badge--success')
    expect(mount(ContentStatusBadge, { props: { status: 'rejected' } }).classes()).toContain('ui-badge--danger')
    expect(mount(ContentStatusBadge, { props: { status: 'draft' } }).classes()).toEqual(['ui-badge'])
  })
})
