import { beforeEach, describe, expect, it, vi } from 'vitest'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource'
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource'
import type { LearnerAccess } from '@/features/onboarding_feature/models/OnboardingTypes'
import type { LearnerLevelResponse } from '@/features/onboarding_feature/models/PlacementTestTypes'
import { forgetPlacement, redirectForLearningPage } from '../placementGate'

const refused = (statusCode: number) => new Exception({ exceptionType: ExceptionType.FORBIDDEN, message: 'no', statusCode })
const BLOCKED_CHILD: LearnerAccess = { isUnder13: true, hasActiveParentLink: false, canAccessContent: false, contentAudience: 'child' }

describe('redirectForLearningPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    forgetPlacement()
    vi.spyOn(PlacementDataSource, 'getLearnerLevel').mockResolvedValue(new $DataSourceResponse<LearnerLevelResponse>(null, refused(403)))
  })

  it('sends a learner without setup to setup, saying which page they asked for', async () => {
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse<LearnerAccess>(null, refused(404)))
    expect(await redirectForLearningPage(4, 'explore')).toEqual({ name: 'learnerSetup', query: { from: 'explore' } })
  })

  it('sends an unlinked child to link a grown-up from a learning page', async () => {
    vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(BLOCKED_CHILD, null))
    expect(await redirectForLearningPage(4, 'myLearning')).toEqual({ name: 'parentLinking', query: { blocked: 'under13' } })
  })

  it('never bounces setup itself, so an unlinked child can correct their date of birth', async () => {
    const access = vi.spyOn(OnboardingDataSource, 'getAccess').mockResolvedValue(new $DataSourceResponse(BLOCKED_CHILD, null))
    expect(await redirectForLearningPage(4, 'learnerSetup')).toBeNull()
    expect(access).not.toHaveBeenCalled()
  })

  it('lets a placed learner through', async () => {
    vi.mocked(PlacementDataSource.getLearnerLevel).mockResolvedValue(
      new $DataSourceResponse<LearnerLevelResponse>({ userId: 4, levelNumber: 2, placed: true }, null))
    expect(await redirectForLearningPage(4, 'explore')).toBeNull()
  })
})
