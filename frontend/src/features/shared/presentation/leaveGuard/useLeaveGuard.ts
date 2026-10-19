import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { matchedRouteKey, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';

/**
 * Asks before the learner leaves a test or the challenge part-way through.
 *
 * Navigating inside the app (a link, the header, the browser's back or forward
 * button) waits for the learner's choice in LeaveGuardDialog: `asking` turns
 * true, and `stay()` or `leave()` settles it. Refreshing or closing the tab gets
 * the browser's own "Leave site?" warning, the only thing a page may show then.
 * Nothing is asked while `isInProgress()` is false, so once the results are
 * showing the learner can go anywhere.
 */
export function useLeaveGuard(isInProgress: () => boolean) {
    const asking = ref(false);
    let settle: ((leave: boolean) => void) | null = null;

    function answer(leave: boolean): void {
        const waiting = settle;
        settle = null;
        asking.value = false;
        waiting?.(leave);
    }

    function guard(): true | Promise<boolean> {
        if (!isInProgress()) return true;
        // A navigation still waiting for an answer is replaced by this one.
        answer(false);
        asking.value = true;
        return new Promise<boolean>((resolve) => { settle = resolve; });
    }

    // Route guards only exist for a screen the router shows (inside <RouterView>);
    // a screen mounted on its own, as in a unit test, still gets the unload warning.
    if (inject(matchedRouteKey, null)) {
        onBeforeRouteLeave(guard);
        // The same screen with another id (one test straight to another) is not a leave.
        onBeforeRouteUpdate(guard);
    }

    function onBeforeUnload(event: BeforeUnloadEvent): void {
        if (!isInProgress()) return;
        event.preventDefault();
        // Older browsers only warn when returnValue is set.
        event.returnValue = '';
    }

    onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
    onBeforeUnmount(() => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        answer(false);
    });

    return { asking, stay: () => answer(false), leave: () => answer(true) };
}
