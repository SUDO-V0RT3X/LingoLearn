import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

//No HTTP: the account save and a learner's setup read are stubbed.
const { saveInterfaceLanguage, callWithParser, getSettings } = vi.hoisted(() => {
    const callWithParser = vi.fn()
    return {
        callWithParser,
        saveInterfaceLanguage: vi.fn(() => ({ callWithParser })),
        getSettings: vi.fn(),
    }
})

vi.mock('@/core/endpoints/endpoints', () => ({
    Endpoints: { Auth: { saveInterfaceLanguage } },
}))

vi.mock('@/features/onboarding_feature/datasources/onboardingDataSource', () => ({
    OnboardingDataSource: { getSettings },
}))

import { i18n } from '@/i18n'
import { authStore, type PublicUser } from '@/features/auth_feature/state/authStore'
import { applySavedLanguageFor, chooseLanguage } from '../localePreference'

function user(role: PublicUser['role'], interfaceLanguage?: 'english' | 'zulu' | null, id = 7): PublicUser {
    return {
        id,
        username: role === 'learner' ? 'lea' : null,
        firstName: 'Test',
        lastName: role,
        name: `Test ${role}`,
        email: role === 'learner' ? null : `${role}@example.test`,
        role,
        requiresGuardianLink: false,
        interfaceLanguage,
    }
}

/** Signs a user in the way the auth store does, so the cached copy is real. */
function signIn(signedIn: PublicUser) {
    authStore().setSession({ user: signedIn, token: 'token' })
}

beforeEach(async () => {
    setActivePinia(createPinia())
    window.localStorage.clear()
    vi.clearAllMocks()
    callWithParser.mockResolvedValue({ data: { interfaceLanguage: 'zulu' }, error: null })
    i18n.global.locale.value = 'english'
    //Forget the last signed-in account between cases.
    await applySavedLanguageFor(null)
})

describe('chooseLanguage', () => {
    it('nominal: a guardian\'s choice switches now and is saved on their account', async () => {
        const guardian = user('guardian', null)
        signIn(guardian)

        await chooseLanguage('zulu', authStore().currentUser)

        expect(i18n.global.locale.value).toBe('zulu')
        expect(saveInterfaceLanguage).toHaveBeenCalledWith('zulu')
        //The cached user remembers it, so a refresh does not undo the choice.
        expect(authStore().currentUser?.interfaceLanguage).toBe('zulu')
        expect(JSON.parse(window.localStorage.getItem('lingolearn_auth_user') ?? '{}').interfaceLanguage).toBe('zulu')
    })

    it('nominal: staff save through the same account route', async () => {
        await chooseLanguage('zulu', user('author'))
        await chooseLanguage('english', user('moderator', 'zulu', 8))

        expect(saveInterfaceLanguage.mock.calls).toEqual([['zulu'], ['english']])
    })

    it('boundary: signed out, the switch applies in this browser only', async () => {
        await chooseLanguage('zulu', null)

        expect(i18n.global.locale.value).toBe('zulu')
        expect(window.localStorage.getItem('lingolearn_interface_language')).toBe('zulu')
        expect(saveInterfaceLanguage).not.toHaveBeenCalled()
    })

    it('invalid: a failed save still leaves the switch in place', async () => {
        callWithParser.mockRejectedValue(new Error('offline'))

        await chooseLanguage('zulu', user('guardian'))

        expect(i18n.global.locale.value).toBe('zulu')
    })
})

describe('applySavedLanguageFor', () => {
    it('nominal: a guardian\'s saved isiZulu is applied when they sign in', async () => {
        await applySavedLanguageFor(user('guardian', 'zulu'))

        expect(i18n.global.locale.value).toBe('zulu')
        expect(getSettings).not.toHaveBeenCalled()
    })

    it('nominal: a learner of isiZulu gets the language their setup saved', async () => {
        getSettings.mockResolvedValue({ data: { target_language: 'zulu', interface_language: 'zulu' }, error: null })

        await applySavedLanguageFor(user('learner'))

        expect(getSettings).toHaveBeenCalledTimes(1)
        expect(i18n.global.locale.value).toBe('zulu')
    })

    it('nominal: a learner of English signs in to English, whatever was chosen before', async () => {
        //isiZulu chosen on the sign-in page, and isiZulu left on the account and the setup row.
        i18n.global.locale.value = 'zulu'
        window.localStorage.setItem('lingolearn_interface_language', 'zulu')
        getSettings.mockResolvedValue({ data: { target_language: 'english', interface_language: 'zulu' }, error: null })

        await applySavedLanguageFor(user('learner', 'zulu'))

        expect(i18n.global.locale.value).toBe('english')
        expect(window.localStorage.getItem('lingolearn_interface_language')).toBe('english')
        expect(saveInterfaceLanguage).not.toHaveBeenCalled()
    })

    it('nominal: a learner\'s setup wins over the account\'s language', async () => {
        getSettings.mockResolvedValue({ data: { target_language: 'zulu', interface_language: 'english' }, error: null })

        await applySavedLanguageFor(user('learner', 'zulu'))

        expect(i18n.global.locale.value).toBe('english')
    })

    it('boundary: a new learner with no setup yet keeps the language they signed up in', async () => {
        i18n.global.locale.value = 'zulu'
        getSettings.mockResolvedValue({ data: null, error: { statusCode: 404 } })

        await applySavedLanguageFor(user('learner', null))

        expect(i18n.global.locale.value).toBe('zulu')
    })

    it('boundary: a session check does not read a learner\'s setup again', async () => {
        getSettings.mockResolvedValue({ data: { target_language: 'english', interface_language: 'english' }, error: null })
        await applySavedLanguageFor(user('learner'))

        await applySavedLanguageFor(user('learner'))

        expect(getSettings).toHaveBeenCalledTimes(1)
    })

    it('boundary: a guardian who never chose keeps this browser\'s language, and nothing is saved', async () => {
        i18n.global.locale.value = 'zulu'

        await applySavedLanguageFor(user('guardian', null))

        expect(i18n.global.locale.value).toBe('zulu')
        expect(getSettings).not.toHaveBeenCalled()
        expect(saveInterfaceLanguage).not.toHaveBeenCalled()
    })

    it('boundary: a session check repeating the same language does not undo a switch made since', async () => {
        await applySavedLanguageFor(user('guardian', 'english'))
        i18n.global.locale.value = 'zulu'

        await applySavedLanguageFor(user('guardian', 'english'))

        expect(i18n.global.locale.value).toBe('zulu')
    })

    it('nominal: a language saved since (on another device) is applied at the next session check', async () => {
        await applySavedLanguageFor(user('guardian', 'english'))

        await applySavedLanguageFor(user('guardian', 'zulu'))

        expect(i18n.global.locale.value).toBe('zulu')
    })

    it('nominal: a refresh after a choice applies the choice, not the language from sign-in', async () => {
        const guardian = user('guardian', 'english')
        signIn(guardian)
        await applySavedLanguageFor(guardian)
        await chooseLanguage('zulu', authStore().currentUser)

        //A refresh starts from the cached user, before the session check answers.
        await applySavedLanguageFor(null)
        i18n.global.locale.value = 'english'
        await applySavedLanguageFor(JSON.parse(window.localStorage.getItem('lingolearn_auth_user') ?? 'null'))

        expect(i18n.global.locale.value).toBe('zulu')
    })
})
