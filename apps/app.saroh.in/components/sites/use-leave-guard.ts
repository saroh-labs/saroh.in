import { useEffect } from "react";

/**
 * The browser's own "leave site?" guard while there is unsaved work, for
 * editors that autosave: "autosaves" is not "has saved", and a closed tab
 * would otherwise drop what had not gone out yet. Shared by the site and post
 * editors (review of #328).
 */
export function useLeaveGuard(unsaved: boolean) {
    useEffect(() => {
        if (!unsaved) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [unsaved]);
}
