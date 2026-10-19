import { PlacementDataSource } from '@/features/onboarding_feature/datasources/PlacementTestDataSource';
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';

//Learners known to have a level. Only "placed" is remembered: it can't be undone,
//while "not placed yet" is asked again so finishing the test opens the app at once.
const placedLearners = new Set<number>();

/**
 * Whether a learner has a level yet, from the placement test, skipping it, or a
 * level-up. Until they do, every learning screen sends them to the placement test.
 * A refusal (setup unfinished, or a child without a guardian link) counts as not
 * placed, so the placement screen can send them where they need to go; any other
 * failure lets them through rather than trapping them.
 */
export async function hasBeenPlaced(learnerId: number): Promise<boolean> {
    if (placedLearners.has(learnerId)) return true;
    const response = await PlacementDataSource.getLearnerLevel();
    if (response.data) {
        if (response.data.placed !== false) placedLearners.add(learnerId);
        return response.data.placed !== false;
    }
    return response.error?.statusCode !== 403;
}

/** Forgets what is known, for example after signing out. */
export function forgetPlacement(): void {
    placedLearners.clear();
}

type GateTarget = { name: string; query?: Record<string, string> };

/**
 * The steps before the placement test, in order: finish setup, then (for a
 * child) be linked to a guardian. 'clear' when both are done; null when access
 * could not be checked, so a failure lets the learner through rather than trapping them.
 */
async function accessStep(): Promise<GateTarget | 'clear' | null> {
    const access = await OnboardingDataSource.getAccess();
    if (!access.data) {
        // No access record yet means setup isn't finished.
        return access.error?.statusCode === 403 || access.error?.statusCode === 404 ? { name: 'learnerSetup' } : null;
    }
    if (!access.data.canAccessContent) return { name: 'parentLinking', query: { blocked: 'under13' } };
    return 'clear';
}

/**
 * Where a learner must go before any learning screen, or null when they may
 * continue. The steps come in order: finish setup, then (for a child) be linked
 * to a guardian, then take the placement test.
 */
export async function learnerGateTarget(learnerId: number): Promise<GateTarget | null> {
    if (await hasBeenPlaced(learnerId)) return null;
    const step = await accessStep();
    if (step === null) return null;
    return step === 'clear' ? { name: 'placementTest' } : step;
}

/**
 * Where a learner opening the placement test should go instead, or null when
 * they may take it. The same steps in the same order as learnerGateTarget, so an
 * unlinked child is sent to parent linking rather than shown the intro; a
 * learner who already has a level goes to Explore, since the test happens once.
 */
export async function placementRouteTarget(learnerId: number): Promise<GateTarget | null> {
    if (await hasBeenPlaced(learnerId)) return { name: 'explore' };
    const step = await accessStep();
    return step === null || step === 'clear' ? null : step;
}

/**
 * Where a learner opening a learning page (Explore, the reader, a quiz, My
 * learning, Level up) must go instead, or null when they may open it. Sent back
 * to setup, the target carries `from` (the page they asked for), so the setup
 * screen can say why they are there. Setup itself is never a learning page: a
 * learner can always reach it, for example to correct a mistyped date of birth
 * while no guardian is linked.
 */
export async function redirectForLearningPage(
    learnerId: number,
    requestedName: string,
): Promise<{ name: string; query?: Record<string, string> } | null> {
    if (requestedName === 'learnerSetup') return null;
    const gate = await learnerGateTarget(learnerId);
    if (gate?.name === 'learnerSetup') return { ...gate, query: { ...gate.query, from: requestedName } };
    return gate;
}
