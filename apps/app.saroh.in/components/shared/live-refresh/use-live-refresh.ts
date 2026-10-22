"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

import {
    clearTyped,
    isLiveRoute,
    LIVE_INTERVAL_MS,
    markTyped,
    pageBusy,
    titleWithUnread,
} from "@/lib/live/refresh";

/** Two refreshes are never closer together than this. */
const MIN_GAP_MS = 2_000;

/**
 * The screen updates by itself (10 Oct 2026). One hook, mounted once in
 * the app shell (`LiveRefresh`), so no page keeps a timer of its own.
 *
 * It reads the page again (`router.refresh()`):
 * - when the tab is come back to (`visibilitychange`), on every page;
 * - when the connection returns (`online`), on every page;
 * - every 45 seconds while the tab is in view, on the few pages left open
 *   to watch (`LIVE_ROUTES`: Home, Orders, the bookings calendar and list,
 *   Notifications).
 *
 * And never:
 * - while a sheet, a dialog or the command menu is open, a guarded form is
 *   dirty, or a form on the page has been typed into (`pageBusy`);
 * - while the tab is hidden or the browser says it is offline;
 * - while a refresh is still on its way: one at a time.
 *
 * A refresh keeps what is on screen. It is the same call every save
 * already makes, so nothing here can lose typed work that a save couldn't.
 */
export function useLiveRefresh({
    intervalMs = LIVE_INTERVAL_MS,
}: { intervalMs?: number } = {}): void {
    const router = useRouter();
    const pathname = usePathname();
    const [pending, startTransition] = useTransition();
    // Read by the listeners, which outlive a render.
    const inFlight = useRef(false);
    useEffect(() => {
        inFlight.current = pending;
    }, [pending]);
    const startedAt = useRef(0);

    const refresh = useCallback(() => {
        if (document.visibilityState !== "visible") return;
        if (!navigator.onLine) return;
        // One at a time: not while the last is still on its way, and not
        // twice for one moment (coming back online in a tab just opened).
        if (inFlight.current) return;
        if (Date.now() - startedAt.current < MIN_GAP_MS) return;
        if (pageBusy(document)) return;
        startedAt.current = Date.now();
        startTransition(() => {
            router.refresh();
        });
    }, [router]);

    // Coming back to the tab, and the connection coming back.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === "visible") refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", refresh);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("online", refresh);
        };
    }, [refresh]);

    // The timer, only on a page that is watched.
    useEffect(() => {
        if (!isLiveRoute(pathname)) return;
        const timer = window.setInterval(refresh, intervalMs);
        return () => window.clearInterval(timer);
    }, [pathname, refresh, intervalMs]);

    // A form typed into is work in hand until it is sent or goes away.
    useEffect(() => {
        const onInput = (event: Event) => markTyped(event.target);
        const onSubmit = (event: Event) => clearTyped(event.target);
        document.addEventListener("input", onInput, true);
        document.addEventListener("submit", onSubmit, true);
        return () => {
            document.removeEventListener("input", onInput, true);
            document.removeEventListener("submit", onSubmit, true);
        };
    }, []);
}

/**
 * The unread count in the browser tab's title, on every page:
 * "(3) Orders · Saroh". Next writes the title again on each navigation, so
 * the head is watched and the count put back in front.
 */
export function useUnreadTitle(unread: number | null): void {
    useEffect(() => {
        const apply = () => {
            const want = titleWithUnread(document.title, unread);
            if (document.title !== want) document.title = want;
        };
        apply();
        const watcher = new MutationObserver(apply);
        watcher.observe(document.head, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        return () => {
            watcher.disconnect();
            // Leaving (signing out, the shell unmounting): the bare title.
            const bare = titleWithUnread(document.title, 0);
            if (document.title !== bare) document.title = bare;
        };
    }, [unread]);
}
