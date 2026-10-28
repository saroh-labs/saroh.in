/*
 * The shared "busy" signal. A screen holding unsaved work says so here,
 * and nothing reads the page again while it does: `useLeaveGuard` holds it
 * for every guarded form while it is dirty, so no screen has to remember.
 * The merchant app's live refresh (`lib/live/refresh.ts`) reads it.
 */
let holds = 0;

/** Hold live refresh; call the returned function to let go (once). */
export function holdLiveRefresh(): () => void {
    holds += 1;
    let held = true;
    return () => {
        if (!held) return;
        held = false;
        holds -= 1;
    };
}

export function liveRefreshHeld(): boolean {
    return holds > 0;
}
