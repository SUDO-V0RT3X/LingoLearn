import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_NAME, APP_TAGLINE } from '@/core/brand'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { authStore } from '@/features/auth_feature/state/authStore'
import { i18n } from '@/i18n'
import SignInScreen from '../SignInScreen.vue'

async function mountScreen() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/sign-in', name: 'signIn', component: SignInScreen },
      { path: '/home', name: 'home', component: { render: () => null } },
    ],
  })
  await router.push('/sign-in')
  await router.isReady()
  const wrapper = mount(SignInScreen, { global: { plugins: [router] } })
  return { wrapper, router }
}

function openSignUp(wrapper: Awaited<ReturnType<typeof mountScreen>>['wrapper']) {
  return wrapper.get('#auth-tab-sign-up').trigger('click')
}

describe('SignInScreen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('shows the product name, tagline and the sign-in tab first', async () => {
    const { wrapper } = await mountScreen()
    expect(wrapper.text()).toContain(APP_NAME)
    expect(wrapper.text()).toContain(APP_TAGLINE)
    expect(wrapper.get('#auth-tab-sign-in').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('input[name="identifier"]').exists()).toBe(true)
  })

  it('nominal: signs in and goes to the user’s home', async () => {
    const { wrapper, router } = await mountScreen()
    const login = vi.spyOn(authStore(), 'login').mockResolvedValue(true)

    await wrapper.get('input[name="identifier"]').setValue('one_learner')
    await wrapper.get('input[name="password"]').setValue('123456789')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledWith({ identifier: 'one_learner', password: '123456789' })
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('invalid: shows the server’s message when sign-in is refused, and stays put', async () => {
    const { wrapper, router } = await mountScreen()
    const state = authStore()
    vi.spyOn(state, 'login').mockImplementation(async () => {
      state.error = new Exception({ exceptionType: ExceptionType.UNAUTHORIZED, message: 'Invalid credentials', statusCode: 401 })
      return false
    })

    await wrapper.get('input[name="identifier"]').setValue('one_learner')
    await wrapper.get('input[name="password"]').setValue('wrong')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Invalid credentials')
    expect(router.currentRoute.value.name).toBe('signIn')
  })

  it('asks a learner for a username and a guardian for an email', async () => {
    const { wrapper } = await mountScreen()
    await openSignUp(wrapper)

    expect(wrapper.find('input[name="username"]').exists()).toBe(true)
    expect(wrapper.find('input[name="email"]').exists()).toBe(false)

    await wrapper.get('input[name="role"][value="guardian"]').setValue(true)
    expect(wrapper.find('input[name="username"]').exists()).toBe(false)
    expect(wrapper.find('input[name="email"]').exists()).toBe(true)
  })

  it('offers only the self-service account types', async () => {
    const { wrapper } = await mountScreen()
    await openSignUp(wrapper)
    const values = wrapper.findAll('input[name="role"]').map((input) => (input.element as HTMLInputElement).value)
    expect(values).toEqual(['learner', 'guardian'])
  })

  it('invalid: refuses mismatched passwords without calling the server', async () => {
    const { wrapper } = await mountScreen()
    const signUp = vi.spyOn(authStore(), 'signUp')
    await openSignUp(wrapper)

    await wrapper.get('input[name="first-name"]').setValue('Lea')
    await wrapper.get('input[name="last-name"]').setValue('Learner')
    await wrapper.get('input[name="username"]').setValue('lea')
    await wrapper.get('input[name="password"]').setValue('password123')
    await wrapper.get('input[name="confirm-password"]').setValue('password124')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(signUp).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toBe('Passwords do not match.')
  })

  it('invalid: refuses a guardian email without a domain suffix', async () => {
    const { wrapper } = await mountScreen()
    const signUp = vi.spyOn(authStore(), 'signUp')
    await openSignUp(wrapper)
    await wrapper.get('input[name="role"][value="guardian"]').setValue(true)

    await wrapper.get('input[name="email"]').setValue('parent@home')
    await wrapper.get('input[name="password"]').setValue('password123')
    await wrapper.get('input[name="confirm-password"]').setValue('password123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(signUp).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toBe('Please enter a valid email address.')
  })

  it('nominal: creates a learner account with a username and no email', async () => {
    const { wrapper, router } = await mountScreen()
    const signUp = vi.spyOn(authStore(), 'signUp').mockResolvedValue(true)
    await openSignUp(wrapper)

    await wrapper.get('input[name="first-name"]').setValue('Lea')
    await wrapper.get('input[name="last-name"]').setValue('Learner')
    await wrapper.get('input[name="username"]').setValue('lea')
    await wrapper.get('input[name="password"]').setValue('password123')
    await wrapper.get('input[name="confirm-password"]').setValue('password123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(signUp).toHaveBeenCalledWith({ role: 'learner', firstName: 'Lea', lastName: 'Learner', username: 'lea', password: 'password123' })
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('shows and hides the password', async () => {
    const { wrapper } = await mountScreen()
    const password = () => wrapper.get('input[name="password"]').attributes('type')
    expect(password()).toBe('password')
    await wrapper.get('.auth__reveal').trigger('click')
    expect(password()).toBe('text')
    await wrapper.get('.auth__reveal').trigger('click')
    expect(password()).toBe('password')
  })

  it('in isiZulu: shows the sign-in page, sign-up form and server refusals in isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    const { wrapper } = await mountScreen()
    const state = authStore()
    vi.spyOn(state, 'login').mockImplementation(async () => {
      state.error = new Exception({ exceptionType: ExceptionType.UNAUTHORIZED, message: 'Invalid credentials', statusCode: 401 })
      return false
    })

    expect(wrapper.text()).toContain('Siyakwamukela futhi')
    expect(wrapper.text()).toContain('Funda, lalela futhi ukhule')
    expect(wrapper.text()).toContain('Igama lomsebenzisi noma i-imeyili')
    expect(wrapper.text()).not.toContain('Welcome back')
    expect(wrapper.text()).not.toContain(APP_TAGLINE)

    await wrapper.get('input[name="identifier"]').setValue('one_learner')
    await wrapper.get('input[name="password"]').setValue('wrong')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Imininingwane yokungena ayilungile')

    await openSignUp(wrapper)
    expect(wrapper.text()).toContain('Vula i-akhawunti yakho')
    expect(wrapper.text()).toContain('Uhlobo lwe-akhawunti')
    expect(wrapper.text()).toContain('Umnakekeli')
    expect(wrapper.text()).not.toContain('Account type')
  })

  it('every text box is named by its own label, and capped at the account limits', async () => {
    const { wrapper } = await mountScreen()
    const labelFor = (id: string) => wrapper.find(`label[for="${id}"]`).text()
    expect(labelFor('auth-identifier')).toBe('Username or email')
    expect(wrapper.get('#auth-identifier').attributes('maxlength')).toBe('60')
    expect(wrapper.get('#auth-password').attributes('maxlength')).toBe('20')

    await openSignUp(wrapper)
    expect(labelFor('auth-first-name')).toBe('First name')
    expect(labelFor('auth-last-name')).toBe('Last name')
    expect(labelFor('auth-username')).toBe('Username')
    expect(labelFor('auth-confirm-password')).toBe('Confirm password')
    expect(wrapper.get('#auth-username').attributes('maxlength')).toBe('20')
    expect(wrapper.get('#auth-password').attributes('maxlength')).toBe('20')
    expect(wrapper.get('#auth-confirm-password').attributes('maxlength')).toBe('20')

    await wrapper.findAll('input[name="role"]')[1].setValue(true)
    expect(labelFor('auth-email')).toBe('Email')
    expect(wrapper.get('#auth-email').attributes('maxlength')).toBe('60')
  })

  it('in isiZulu: the browser\'s own "fill in this field" bubble is in isiZulu too', async () => {
    i18n.global.locale.value = 'zulu'
    const { wrapper } = await mountScreen()
    const input = wrapper.get('#auth-identifier')
    await input.trigger('invalid')
    expect((input.element as HTMLInputElement).validationMessage).toBe('Sicela ugcwalise le nkambu.')
  })
})
