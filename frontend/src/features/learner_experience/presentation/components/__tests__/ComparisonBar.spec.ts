import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ComparisonBar from '@/features/learner_experience/presentation/components/ComparisonBar.vue'
import { i18n } from '@/i18n'

//A button's words, without its play/pause symbol.
const label = (wrapper: ReturnType<typeof mount>, testId: string) =>
  wrapper.find(`[data-testid="${testId}"] .comparison-bar__label`).text()

describe('ComparisonBar', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('nominal: Play the example and Play mine side by side, each asking for its clip', async () => {
    const wrapper = mount(ComparisonBar, { props: { canCompare: true, playing: null } })
    expect(label(wrapper, 'compare-example')).toBe('Play the example')
    expect(label(wrapper, 'compare-mine')).toBe('Play mine')

    await wrapper.find('[data-testid="compare-example"]').trigger('click')
    await wrapper.find('[data-testid="compare-mine"]').trigger('click')
    expect(wrapper.emitted('play-example')).toHaveLength(1)
    expect(wrapper.emitted('play-mine')).toHaveLength(1)
  })

  it('the clip that is playing offers Pause instead', () => {
    const wrapper = mount(ComparisonBar, { props: { canCompare: true, playing: 'mine' } })
    expect(label(wrapper, 'compare-mine')).toBe('Pause')
    expect(label(wrapper, 'compare-example')).toBe('Play the example')
  })

  it('boundary: with nothing recorded yet there is nothing to compare, so it says to record first', () => {
    const wrapper = mount(ComparisonBar, { props: { canCompare: false, playing: null } })
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toBe('Record yourself first, then compare.')
  })

  it('isiZulu', () => {
    i18n.global.locale.value = 'zulu'
    const wrapper = mount(ComparisonBar, { props: { canCompare: true, playing: null } })
    expect(label(wrapper, 'compare-example')).toBe('Dlala isibonelo')
  })
})
