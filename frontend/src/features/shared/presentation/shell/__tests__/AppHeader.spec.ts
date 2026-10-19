import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import AppHeader from '../AppHeader.vue'
import { authStore, type PublicUser } from '@/features/auth_feature/state/authStore'
import { themeStore } from '@/features/shared/state/themeStore'
import { challengePlayStore } from '@/features/progress_feature/presentation/screens/ChallengePlayScreen/state/challengePlayStore'

const learner: PublicUser = {
  id: 7, username: 'thandi', firstName: 'Thandi', lastName: 'Zulu', name: 'Thandi Zulu',
  email: null, role: 'learner', requiresGuardianLink: false, interfaceLanguage: null,
}

function makeRouter() {
  const blank = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: blank },
      { path: '/sign-in', name: 'signIn', component: blank },
      { path: '/explore', name: 'explore', component: blank },
      { path: '/my-learning', name: 'myLearning', component: blank },
      { path: '/challenge-intro', name: 'challengeIntro', component: blank },
      { path: '/challenge/play', name: 'challengePlay', component: blank },
      { path: '/parent-linking', name: 'parentLinking', component: blank },
      { path: '/learner-setup', name: 'learnerSetup', component: blank },
    ],
  })
}

async function mountHeader(path = '/explore') {
  const router = makeRouter()
  await router.push(path)
  const wrapper = mount(AppHeader, { global: { plugins: [router, i18n] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

describe('AppHeader', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    authStore().currentUser = learner
    themeStore().setAudience('general')
  })

  it('shows who is signed in as plain text, with a separate Sign out button', async () => {
    const { wrapper, router } = await mountHeader()
    const profile = wrapper.get('[data-testid="header-profile"]')
    expect(profile.element.tagName).toBe('DIV')
    expect(profile.find('button').exists()).toBe(false)
    expect(profile.text()).toContain('Signed in as Thandi (Learner)')

    const logout = vi.spyOn(authStore(), 'logout').mockResolvedValue(undefined as never)
    await wrapper.get('[data-testid="sign-out"]').trigger('click')
    await flushPromises()
    expect(logout).toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('signIn')
    wrapper.unmount()
  })

  it('folds every link and signing out into an accessible menu, with no language switch for a learner', async () => {
    const { wrapper } = await mountHeader()
    const button = wrapper.get('[data-testid="header-menu-button"]')
    expect(button.attributes('aria-label')).toBe('Open menu')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="header-panel"]').exists()).toBe(false)

    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.attributes('aria-label')).toBe('Close menu')
    const panel = wrapper.get('[data-testid="header-panel"]')
    expect(panel.findAll('a').map((link) => link.text())).toEqual(['Explore', 'My learning', 'Level up', 'Settings'])
    //A learner chooses the interface language in Settings, not here.
    expect(panel.find('[data-testid="header-panel-language"]').exists()).toBe(false)
    expect(panel.findAll('[aria-pressed]')).toHaveLength(0)
    expect(panel.text()).toContain('Sign out')

    //Escape closes it and gives focus back to the button.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[data-testid="header-panel"]').exists()).toBe(false)
    expect(document.activeElement).toBe(button.element)
    wrapper.unmount()
  })

  describe('the English/isiZulu switch', () => {
    function account(role: PublicUser['role']): PublicUser {
      return {
        id: 20, username: null, firstName: 'Sam', lastName: 'Dube', name: 'Sam Dube',
        email: `${role}@example.test`, role, requiresGuardianLink: false, interfaceLanguage: null,
      }
    }

    function switches(wrapper: Awaited<ReturnType<typeof mountHeader>>['wrapper']) {
      return {
        wide: wrapper.find('[data-testid="header-language"]').exists(),
        options: wrapper.findAll('[data-testid="header-language"] [aria-pressed]').map((option) => option.text()),
      }
    }

    it('is not shown to an adult learner, in the bar or the menu', async () => {
      const { wrapper } = await mountHeader()
      expect(switches(wrapper).wide).toBe(false)
      await wrapper.get('[data-testid="header-menu-button"]').trigger('click')
      expect(wrapper.find('[data-testid="header-panel-language"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('is not shown to a child learner either', async () => {
      themeStore().setAudience('child')
      const { wrapper } = await mountHeader()
      expect(switches(wrapper).wide).toBe(false)
      await wrapper.get('[data-testid="header-menu-button"]').trigger('click')
      expect(wrapper.find('[data-testid="header-panel-language"]').exists()).toBe(false)
      themeStore().setAudience('general')
      wrapper.unmount()
    })

    it('is shown to a guardian, in the bar and in the phone menu', async () => {
      authStore().currentUser = account('guardian')
      const { wrapper } = await mountHeader('/')
      expect(switches(wrapper)).toEqual({ wide: true, options: ['English', 'isiZulu'] })
      await wrapper.get('[data-testid="header-menu-button"]').trigger('click')
      expect(wrapper.get('[data-testid="header-panel-language"]').findAll('[aria-pressed]').map((option) => option.text()))
        .toEqual(['English', 'isiZulu'])
      wrapper.unmount()
    })

    it.each(['author', 'moderator', 'administrator'] as const)('is shown to staff: %s', async (role) => {
      authStore().currentUser = account(role)
      const { wrapper } = await mountHeader('/')
      expect(switches(wrapper)).toEqual({ wide: true, options: ['English', 'isiZulu'] })
      wrapper.unmount()
    })

    it('is shown when signed out, so sign-up can be read in isiZulu', async () => {
      authStore().currentUser = null
      const { wrapper } = await mountHeader('/sign-in')
      expect(switches(wrapper)).toEqual({ wide: true, options: ['English', 'isiZulu'] })

      await wrapper.findAll('[data-testid="header-language"] [aria-pressed]')[1].trigger('click')
      await flushPromises()
      expect(i18n.global.locale.value).toBe('zulu')
      expect(wrapper.get('[data-testid="header-language"]').attributes('aria-label')).toBe('Ulimi')
      i18n.global.locale.value = 'english'
      wrapper.unmount()
    })
  })

  it('following a link from the menu closes it', async () => {
    const { wrapper, router } = await mountHeader()
    await wrapper.get('[data-testid="header-menu-button"]').trigger('click')
    await router.push('/my-learning')
    await flushPromises()
    expect(wrapper.find('[data-testid="header-panel"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('gives a child a Settings link too, after My grown-up', async () => {
    themeStore().setAudience('child')
    const { wrapper } = await mountHeader()
    const links = wrapper.get('[data-testid="header-nav"]').findAll('a').map((link) => link.text())
    expect(links).toEqual(['Explore', 'My stars', 'Level up', 'My grown-up', 'Settings'])
    themeStore().setAudience('general')
    wrapper.unmount()
  })

  it('locks the links while the level-up challenge is being answered, and unlocks them on the result', async () => {
    const challenge = challengePlayStore()
    challenge.phase = 'playing'
    const { wrapper } = await mountHeader('/challenge/play')
    const nav = () => wrapper.get('[data-testid="header-nav"]')
    expect(nav().findAll('a')).toHaveLength(0)
    const locked = nav().findAll('[aria-disabled="true"]')
    expect(locked).toHaveLength(4)
    expect(locked[0].attributes('title')).toBe('Finish the challenge first')

    challenge.phase = 'submitting'
    await flushPromises()
    expect(nav().findAll('a')).toHaveLength(0)

    challenge.phase = 'result'
    await flushPromises()
    expect(nav().findAll('a')).toHaveLength(4)
    wrapper.unmount()
  })

  it('unlocks the links when the challenge could not start', async () => {
    challengePlayStore().phase = 'blocked'
    const { wrapper } = await mountHeader('/challenge/play')
    expect(wrapper.get('[data-testid="header-nav"]').findAll('a')).toHaveLength(4)
    wrapper.unmount()
  })

  it('in isiZulu: the menu button and the lock read in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    challengePlayStore().phase = 'playing'
    const { wrapper } = await mountHeader('/challenge/play')
    expect(wrapper.get('[data-testid="header-menu-button"]').attributes('aria-label')).toBe('Vula imenyu')
    expect(wrapper.get('[data-testid="header-nav"] [aria-disabled="true"]').attributes('title')).toBe('Qeda inselelo kuqala')
    wrapper.unmount()
  })
})
