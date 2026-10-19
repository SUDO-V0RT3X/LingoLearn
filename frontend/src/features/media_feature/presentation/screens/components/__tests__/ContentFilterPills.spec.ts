import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContentFilterPills from '../ContentFilterPills.vue'

describe('ContentFilterPills', () => {
  it('emits "select" with the clicked filter', async () => {
    const wrapper = mount(ContentFilterPills, { props: { active: 'all' } })
    await wrapper.get('[data-testid="filter-pill-approved"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['approved'])
  })

  it('marks the active pill', () => {
    const wrapper = mount(ContentFilterPills, { props: { active: 'pending' } })
    const pending = wrapper.get('[data-testid="filter-pill-pending"]')
    expect(pending.classes()).toContain('ui-chip--active')
    expect(pending.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="filter-pill-all"]').attributes('aria-pressed')).toBe('false')
  })

  it('shows how many items each filter holds, when counts are given', () => {
    const counts = { all: 4, draft: 1, pending: 2, approved: 1, rejected: 0 }
    const wrapper = mount(ContentFilterPills, { props: { active: 'all', counts } })
    expect(wrapper.get('[data-testid="filter-pill-pending"]').text()).toBe('Pending 2')
    expect(wrapper.get('[data-testid="filter-pill-rejected"]').text()).toBe('Rejected 0')
  })
})