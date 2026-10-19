import { describe, expect, it } from 'vitest'
import { homeRouteNameFor, navFor } from '../navigation'

const routeNames = (items: ReturnType<typeof navFor>) => items.map((item) => item.to.name)

describe('navFor and the family page', () => {
  it('gives a learner aged 13 or more no family page: a guardian link is for a child', () => {
    expect(routeNames(navFor('learner', false))).not.toContain('parentLinking')
  })

  it('gives a child learner My grown-up', () => {
    const child = navFor('learner', true)
    expect(routeNames(child)).toContain('parentLinking')
    expect(child.find((item) => item.to.name === 'parentLinking')?.label).toBe('common.nav.myGrownUp')
  })

  it('gives a child Settings, like an adult, so they can reach their plan', () => {
    expect(routeNames(navFor('learner', true)).at(-1)).toBe('learnerSetup')
    expect(routeNames(navFor('learner', false)).at(-1)).toBe('learnerSetup')
  })

  it('keeps My children for a guardian, and their home there', () => {
    expect(routeNames(navFor('guardian', false))).toEqual(['parentLinking'])
    expect(homeRouteNameFor('guardian')).toBe('parentLinking')
  })

  it('child or not only matters for a learner', () => {
    expect(navFor('administrator', true)).toEqual(navFor('administrator', false))
    expect(routeNames(navFor('administrator', false))).not.toContain('parentLinking')
  })
})
