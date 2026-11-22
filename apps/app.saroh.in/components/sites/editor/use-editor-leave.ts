import { useCallback, useEffect, useRef } from "react";

import { useLeaveGuard } from "@saroh/ui/use-leave-guard";

/** How long a way out waits for the editor's own save before it asks. */
const SETTLE_MS = 6000;
const TICK_MS = 100;

/**
 * Leaving the site editor. It saves by itself (the page, the look, the
 * name and the footer, each on its own short pause), so a way out waits
 * for those saves and goes. The person is asked only when the work can't
 * save: a save failed, someone else changed the page, or a section isn't
 * finished and so lives only in this tab.
 */
export function useEditorLeave({
    unsaved,
    stuck,
    waiting = 0,
    save,
}: {
    /** Anything on screen the server doesn't have yet. */
    unsaved: boolean;
    /** What is unsaved won't save without the person doing something. */
    stuck: boolean;
    /** Saved changes waiting for Publish: leaving loses none of them. */
    waiting?: number;
    /** The page's failed save, tried again: "Save and leave". */
    save?: () => Promise<boolean>;
}) {
    const now = useRef({ unsaved, stuck });
    useEffect(() => {
        now.current = { unsaved, stuck };
    }, [unsaved, stuck]);

    const settle = useCallback(
        () =>
            new Promise<boolean>((resolve) => {
                const until = Date.now() + SETTLE_MS;
                const tick = () => {
                    if (!now.current.unsaved) resolve(true);
                    else if (now.current.stuck || Date.now() > until) {
                        resolve(false);
                    } else setTimeout(tick, TICK_MS);
                };
                tick();
            }),
        [],
    );

    return useLeaveGuard({
        dirty: unsaved,
        lost: leaveLost(waiting),
        flush: settle,
        save,
    });
}

/**
 * What leaving loses (`fix/WXKStates` "Leaving with unsaved words"): only
 * what hasn't saved; every saved change still waits for Publish.
 */
export function leaveLost(waiting: number): string {
    if (waiting <= 0) {
        return "Your latest changes to this site haven't saved, and will be lost if you leave now.";
    }
    const other =
        waiting === 1
            ? "Your other change is saved and waits for Publish."
            : `Your other ${waiting} changes are saved and wait for Publish.`;
    return `${other} Only what you changed since the last save would be lost.`;
}
