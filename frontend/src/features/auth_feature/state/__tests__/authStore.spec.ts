import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { authStore, type PublicUser } from '../authStore'
import { AuthDataSource } from '../../datasources/authDataSource'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'

vi.mock('../../datasources/authDataSource', () => ({
    AuthDataSource: {
        signUp: vi.fn(),
        login: vi.fn(),
        logout: vi.fn(),
        me: vi.fn(),
        createLinkCode: vi.fn(),
        redeemParentLink: vi.fn(),
        getChildren: vi.fn(),
    },
}))

const learner: PublicUser = {
    id: 1,
    username: 'learnerone',
    firstName: 'Learner',
    lastName: 'One',
    name: 'Learner One',
    email: null,
    role: 'learner',
    requiresGuardianLink: false,
}

const guardian: PublicUser = {
    id: 2,
    username: null,
    firstName: 'Guardian',
    lastName: 'One',
    name: 'Guardian One',
    email: 'guardian@example.test',
    role: 'guardian',
    requiresGuardianLink: false,
}

beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
    vi.clearAllMocks()
})

describe('authStore', () => {
    // Lecture traceability: REQ-AUTH-001/002, component test with a datasource
    // stub, expected result is immediate login after successful learner signup.
    it('nominal: signs up a learner and persists the returned session', async () => {
        vi.mocked(AuthDataSource.signUp).mockResolvedValue({
            data: { user: learner, token: 'learner-token' },
            error: null,
        })
        const state = authStore()

        const success = await state.signUp({
            role: 'learner',
            firstName: learner.firstName ?? '',
            lastName: learner.lastName ?? '',
            username: learner.username ?? '',
            password: 'password123',
        })

        expect(success).toBe(true)
        expect(AuthDataSource.signUp).toHaveBeenCalledWith({
            role: 'learner',
            firstName: learner.firstName,
            lastName: learner.lastName,
            username: learner.username,
            password: 'password123',
        })
        expect(state.currentUser).toEqual(learner)
        expect(state.token).toBe('learner-token')
        expect(window.localStorage.getItem('lingolearn_auth_token')).toBe('learner-token')
    })

    // Lecture traceability: REQ-LINK-001, error-handling path,
    // expected result is no backend call when there is no signed-in user.
    it('invalid state: refuses to create a parent-link code before sign-in', async () => {
        const state = authStore()

        const success = await state.createLinkCode()

        expect(success).toBe(false)
        expect(state.error?.message).toBe('Please sign in first.')
        expect(AuthDataSource.createLinkCode).not.toHaveBeenCalled()
    })

    // Lecture traceability: REQ-LINK-002/003, component test with datasource
    // stubs, expected result is that a newly redeemed child appears in the list.
    it('nominal: reloads linked children after a parent code is redeemed', async () => {
        const linkedAt = '2026-09-14T10:00:00.000Z'
        vi.mocked(AuthDataSource.redeemParentLink).mockResolvedValue({
            data: { child: learner, linkedAt },
            error: null,
        })
        vi.mocked(AuthDataSource.getChildren).mockResolvedValue({
            data: [{ ...learner, linkedAt }],
            error: null,
        })
        const state = authStore()
        state.setSession({ user: guardian, token: 'guardian-token' })

        expect(state.children).toEqual([])

        const success = await state.redeemParentLink('ABC123')

        expect(success).toBe(true)
        expect(AuthDataSource.redeemParentLink).toHaveBeenCalledWith('ABC123', 'guardian-token')
        expect(state.hasLoadedChildren).toBe(true)
        expect(state.children).toEqual([{ ...learner, linkedAt }])
    })

    // Lecture traceability: REQ-LINK-003, component test with a datasource
    // stub, expected result is that persisted links are restored for a guardian.
    it('nominal: loads a guardian\'s previously linked children', async () => {
        const linkedAt = '2026-09-14T10:00:00.000Z'
        vi.mocked(AuthDataSource.getChildren).mockResolvedValue({
            data: [{ ...learner, linkedAt }],
            error: null,
        })
        const state = authStore()
        state.setSession({ user: guardian, token: 'guardian-token' })

        const success = await state.loadChildren()

        expect(success).toBe(true)
        expect(AuthDataSource.getChildren).toHaveBeenCalledWith('guardian-token')
        expect(state.hasLoadedChildren).toBe(true)
        expect(state.children).toEqual([{ ...learner, linkedAt }])
    })

    // Lecture traceability: REQ-AUTH-006, termination path,
    // expected result is that logout revokes the token and clears local state.
    it('termination: signs out and clears session, parent-link, and child state', async () => {
        vi.mocked(AuthDataSource.logout).mockResolvedValue({ data: undefined, error: null })
        const state = authStore()
        state.setSession({ user: guardian, token: 'guardian-token' })
        state.linkCode = 'ABC123'
        state.children = [{ ...learner, linkedAt: '2026-09-14T10:00:00.000Z' }]

        await state.logout()

        expect(AuthDataSource.logout).toHaveBeenCalledWith('guardian-token')
        expect(state.currentUser).toBeNull()
        expect(state.token).toBeNull()
        expect(state.linkCode).toBeNull()
        expect(state.children).toEqual([])
        expect(window.localStorage.getItem('lingolearn_auth_token')).toBeNull()
    })

    // Lecture traceability: REQ-AUTH-005, component test with a datasource
    // stub, expected result is that a valid saved token restores the user.
    it('nominal: restores a saved session after backend validation', async () => {
        vi.mocked(AuthDataSource.me).mockResolvedValue({ data: guardian, error: null })
        window.localStorage.setItem('lingolearn_auth_token', 'guardian-token')
        const state = authStore()

        const success = await state.restoreServerSession()

        expect(success).toBe(true)
        expect(AuthDataSource.me).toHaveBeenCalledWith('guardian-token')
        expect(state.currentUser).toEqual(guardian)
        expect(state.token).toBe('guardian-token')
    })

    // Lecture traceability: REQ-AUTH-005/006, termination path,
    // expected result is that an expired saved token is cleared locally.
    it('termination: clears a saved session when backend validation fails', async () => {
        vi.mocked(AuthDataSource.me).mockResolvedValue({
            data: null,
            error: new Exception({
                exceptionType: ExceptionType.FAILED,
                message: 'Session invalid',
                statusCode: 401,
            }),
        })
        window.localStorage.setItem('lingolearn_auth_token', 'expired-token')
        window.localStorage.setItem('lingolearn_auth_user', JSON.stringify(guardian))
        const state = authStore()

        const success = await state.restoreServerSession()

        expect(success).toBe(false)
        expect(AuthDataSource.me).toHaveBeenCalledWith('expired-token')
        expect(state.currentUser).toBeNull()
        expect(state.token).toBeNull()
        expect(window.localStorage.getItem('lingolearn_auth_token')).toBeNull()
        expect(window.localStorage.getItem('lingolearn_auth_user')).toBeNull()
    })
})
