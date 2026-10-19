import { beforeEach, describe, expect, it, vi } from 'vitest'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource'
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource'
import type { LearnerAccess } from '@/features/onboarding_feature/models/OnboardingTypes'
import { forgetPlacement, learnerGateTarget, placementRouteTarget } from '../placementGate'

// The gate in front of the placement test uses the same steps, in the same
// order, as the one in front of every learning screen: setup, then a guardian
// link for a child, then placement.

const adult: LearnerAccess = { isUnder13: false, hasActiveParentLink: false, canAccessContent: true, contentAudience: 'general' }
const unlinkedChild: LearnerAccess = { isUnder13: true, hasActiveParentLink: false, canAccessContent: false, contentAudience: 'child' }

function placed(value: boolean) {
    vi.spyOn(PlacementDataSource, 'getLearnerLevel').mockResolvedValue(
        new $DataSourceResponse({ userId: 7, levelNumber: 1, placed: value }, null))
}
function access(value: LearnerAccess | null, statusCode = 404) {
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(value
        ? new $DataSourceResponse(value, null)
        : new $DataSourceResponse<LearnerAccess>(null, new Exception({ exceptionType: ExceptionType.FAILED, message: 'x', statusCode })))
}

describe('placementRouteTarget (the guard on /placement-test)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        forgetPlacement()
    })

    it('nominal: a set-up adult who is not placed may take the test', async () => {
        placed(false)
        access(adult)
        expect(await placementRouteTarget(7)).toBeNull()
    })

    it('nominal: an unlinked child is sent to parent linking, not shown the intro', async () => {
        placed(false)
        access(unlinkedChild)
        expect(await placementRouteTarget(7)).toEqual({ name: 'parentLinking', query: { blocked: 'under13' } })
    })

    it('nominal: a learner without saved setup is sent to setup first', async () => {
        placed(false)
        access(null, 404)
        expect(await placementRouteTarget(7)).toEqual({ name: 'learnerSetup' })
    })

    it('boundary: a placed learner goes to Explore, whatever else is true', async () => {
        placed(true)
        access(unlinkedChild)
        expect(await placementRouteTarget(7)).toEqual({ name: 'explore' })
        expect(OnboardingDataSource.getAccess).not.toHaveBeenCalled()
    })

    it('invalid: when access cannot be checked, the learner is let through (the server still refuses)', async () => {
        placed(false)
        access(null, 500)
        expect(await placementRouteTarget(7)).toBeNull()
    })

    it('matches learnerGateTarget step for step', async () => {
        for (const [state, status] of [[adult, 0], [unlinkedChild, 0], [null, 404]] as const) {
            forgetPlacement()
            placed(false)
            access(state, status || 404)
            const fromLearningScreen = await learnerGateTarget(7)
            const fromPlacement = await placementRouteTarget(7)
            // A learning screen sends them to the placement test exactly when the placement test lets them in.
            if (fromLearningScreen?.name === 'placementTest') expect(fromPlacement).toBeNull()
            else expect(fromPlacement).toEqual(fromLearningScreen)
        }
    })
})
