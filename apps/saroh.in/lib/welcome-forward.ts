import type { TagConfig } from "@/lib/ga";
import { hasAdTags } from "@/lib/ga";
import { allowedNow, fireConversion, syncTags } from "@/lib/tags";
import { readWelcome, WELCOME_PATH } from "@/lib/welcome";

/**
 * How long `/welcome` holds a visitor so the conversion can leave before
 * the page does. Google's tag calls back when its request has gone; the
 * Pixel has no such call, so it gets a short fixed hold. Never longer than
 * the cap, whatever happens: a blocked or slow tag doesn't strand anyone.
 */
export const META_HOLD_MS = 1200;
export const MAX_WAIT_MS = 2500;

/**
 * What `/welcome` does when it opens (DEC-127): works out where the visitor
 * is going, counts the sign-up if it may, and sends them on.
 *
 * It counts only when all of these hold: accounts sent this visit just now,
 * an advertising tag has its id, and this browser accepted advertising
 * cookies on saroh.in (not the team's, no Do Not Track or Global Privacy
 * Control). Otherwise nothing loads and the visitor leaves at once.
 *
 * The address is cut back to `/welcome` before any tag loads, so where the
 * visitor is going (which can carry an invitation) is never part of a page
 * address a tag reports.
 *
 * Returns a function that drops the timers, for the caller's clean-up.
 */
export function forwardWelcome(input: {
    config: TagConfig;
    accountsUrl: string;
    /** Leaves the page; `location.replace`, so Back doesn't return here. */
    go: (url: string) => void;
    win?: Window;
    doc?: Document;
}): () => void {
    const { config, accountsUrl, win = window, doc = document } = input;
    const welcome = readWelcome(win.location.search, accountsUrl, Date.now());
    win.history.replaceState(null, "", WELCOME_PATH);

    let gone = false;
    const timers: number[] = [];
    const cancel = () => timers.forEach((t) => win.clearTimeout(t));
    const go = () => {
        if (gone) return;
        gone = true;
        cancel();
        input.go(welcome.next);
    };

    const allowed = allowedNow(win, doc);
    if (!welcome.id || !hasAdTags(config) || !allowed.ads) {
        go();
        return cancel;
    }

    syncTags(config, allowed, win, doc);
    const waiting = { google: true, meta: true };
    const maybeGo = () => {
        if (!waiting.google && !waiting.meta) go();
    };
    const told = fireConversion(
        "sign_up_completed",
        {
            id: welcome.id,
            onSent: () => {
                waiting.google = false;
                maybeGo();
            },
        },
        win,
    );
    if (!told.google) waiting.google = false;
    if (told.meta) {
        timers.push(
            win.setTimeout(() => {
                waiting.meta = false;
                maybeGo();
            }, META_HOLD_MS),
        );
    } else {
        waiting.meta = false;
    }
    if (told.google || told.meta) timers.push(win.setTimeout(go, MAX_WAIT_MS));
    maybeGo();
    return cancel;
}
