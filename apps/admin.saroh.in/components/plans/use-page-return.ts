"use client";

import type { RefObject } from "react";
import { useEffect } from "react";

import { reloadPage } from "./reload-page";

/** Coming back into view fires several events at once; one read answers them. */
export const RETURN_REFRESH_MS = 5_000;

/** How often to look while a version waits for the billing provider. */
export const WAITING_REFRESH_MS = 20_000;

/**
 * Read Plans & modules again when it comes back into view (the tab, the
 * window, the network), and every so often while a version waits for
 * billing, so an edit never starts from a version that was replaced while
 * the page sat open. Not while a save is about to go or on its way (the
 * save's own answer says what happened) or a dialog is open.
 *
 * `refreshedAt` is when the page was last read, by anyone; `refresh` sets it.
 */
export function usePageReturn(input: {
    refresh: () => void;
    refreshedAt: RefObject<number>;
    /** A save is about to go, or is on its way. */
    saving: () => boolean;
    /** Something on screen isn't saved. */
    dirty: () => boolean;
    /** A version is waiting for billing: it goes live without anyone here. */
    waiting: boolean;
}) {
    const { refresh, refreshedAt, saving, dirty, waiting } = input;
    useEffect(() => {
        const read = () => {
            if (document.visibilityState !== "visible") return;
            if (saving()) return;
            if (document.querySelector('[role="dialog"]')) return;
            if (Date.now() - refreshedAt.current < RETURN_REFRESH_MS) return;
            refresh();
        };
        // `persisted`: the browser's Back brought the page out of its
        // back/forward cache as it was left, however long ago. Next drops a
        // refresh asked for as it restores, so the page loads again; with
        // something unsaved it stays, and the save meets the API's rules.
        const onShow = (event: PageTransitionEvent) => {
            if (!event.persisted) return;
            if (dirty() || saving()) {
                refreshedAt.current = 0;
                return;
            }
            reloadPage();
        };
        document.addEventListener("visibilitychange", read);
        window.addEventListener("focus", read);
        window.addEventListener("online", read);
        window.addEventListener("pageshow", onShow);
        const poll = waiting ? setInterval(read, WAITING_REFRESH_MS) : null;
        return () => {
            document.removeEventListener("visibilitychange", read);
            window.removeEventListener("focus", read);
            window.removeEventListener("online", read);
            window.removeEventListener("pageshow", onShow);
            if (poll) clearInterval(poll);
        };
    }, [dirty, refresh, refreshedAt, saving, waiting]);
}
