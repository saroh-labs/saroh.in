"use client";

import { useCallback, useEffect, useRef } from "react";

import type { BookingStep, StepUrl } from "./step-url";
import {
    impliedStep,
    parseStepUrl,
    serializeStepUrl,
    stepIndex,
} from "./step-url";

/** How a change of step reaches the address. */
export type StepMove = "push" | "replace";

/** Marks the entries the booking page writes, beside Next's own state. */
const MARK = { sarohBookingStep: true };

/**
 * Whether the page is writing its own address now. Next's router copies
 * its `__NA` mark into every write that passes its patch of the History
 * API, so the mark alone can't tell its writes from the page's.
 */
let writingOwn = false;

/** The page's own write of its address. */
function write(how: StepMove, url: string): void {
    writingOwn = true;
    try {
        if (how === "push") window.history.pushState(MARK, "", url);
        else window.history.replaceState(MARK, "", url);
    } finally {
        writingOwn = false;
    }
}

/**
 * The booking step in the address, kept in step with the page (U9, KD7).
 *
 * The page says what the address should be (`want`) on every draw. A move
 * to a later step is a new history entry (`pushState`), so Back returns to
 * the step before; anything else — another day on the same step, a step
 * the page fell back to (a time gone, a hold let go), a link that couldn't
 * stand — replaces the entry it is on. `willPush` makes the next change a
 * new entry even when it goes to an earlier step ("Book something else"). No server render: the History API changes the address
 * in place (Next's router takes the change through its own patch of
 * `pushState`, so `useSearchParams` reads it too), and Back and Forward
 * come back as `popstate`, handed to `onTraverse` to bring the page to
 * that entry.
 *
 * Nothing is written as the page first draws: the address it was opened
 * on is the server's, and the first draw matches it — unless it named a
 * step the page can't stand on, which is put right in place.
 *
 * Next's router can fall behind these writes: a Server Action that sets a
 * cookie (signing in with the code) refreshes the page at the address the
 * router last knew, and its history sync then pushes an earlier step's
 * address over the one on screen, so Back skipped a step. While the page
 * is up, a write of the router's own (`__NA`) to an address this page wrote
 * earlier and has since left is kept on the address the page is on, in
 * place (`keepOwnAddress`).
 */
export function useStepHistory({
    want,
    onTraverse,
}: {
    want: StepUrl;
    onTraverse: (url: StepUrl) => void;
}): {
    /** The next change of step is a move forward: a new history entry. */
    willPush: () => void;
} {
    const intent = useRef<StepMove | null>(null);
    const latest = useRef(onTraverse);
    useEffect(() => {
        latest.current = onTraverse;
    });

    const wanted = addressFor(want);
    // The first draw writes nothing: `null` until the page has drawn once.
    const written = useRef<string | null>(null);
    useEffect(() => {
        if (written.current === null) {
            written.current = wanted;
            // A link to a step the page can't stand on is put right in
            // place; any other address it opened on is left as it was.
            const named = parseStepUrl(window.location.search).step;
            if (named !== null && named !== want.step) {
                try {
                    write("replace", wanted);
                } catch {
                    // As below.
                }
            }
            return;
        }
        const how = intent.current;
        intent.current = null;
        if (wanted === currentAddress()) {
            written.current = wanted;
            return;
        }
        const from = stepNamed(window.location.search);
        const next = stepNamed(new URL(wanted, "https://x").search);
        const push =
            next !== from &&
            (how === "push" || stepIndex(next) > stepIndex(from));
        try {
            if (push) {
                write("push", wanted);
            } else {
                write("replace", wanted);
            }
        } catch {
            // An address the browser won't take: the page still works.
        }
        written.current = wanted;
        // `want.step` is in `wanted`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wanted]);

    // Every address this page has written, for `keepOwnAddress`.
    const left = useRef(new Set<string>());
    useEffect(() => {
        if (written.current !== null) left.current.add(written.current);
    });
    useEffect(
        () =>
            keepOwnAddress(
                () => written.current,
                (url) => left.current.has(url),
            ),
        [],
    );

    useEffect(() => {
        const onPop = () => {
            intent.current = null;
            written.current = currentAddress();
            latest.current(parseStepUrl(window.location.search));
        };
        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);

    const willPush = useCallback(() => {
        intent.current = "push";
    }, []);

    return { willPush };
}

/**
 * Wrap the History API while the booking page is up: a write of Next's
 * router (marked `__NA`) to an address the page wrote before and has left
 * since is a stale sync (see `useStepHistory`), so it replaces the entry in
 * place with the address the page is on. Any other write, and every write
 * once the page is gone, goes through as it was. Returns the unwrap.
 */
function keepOwnAddress(
    current: () => string | null,
    wroteBefore: (url: string) => boolean,
): () => void {
    if (typeof window === "undefined") return () => undefined;
    const { history } = window;
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    let active = true;
    const stale = (data: unknown, url: string | URL | null | undefined) => {
        const now = current();
        if (
            !active ||
            writingOwn ||
            now === null ||
            url === undefined ||
            url === null
        )
            return null;
        if (!(data as { __NA?: unknown } | null)?.__NA) return null;
        const to = new URL(String(url), window.location.href);
        const address = `${to.pathname}${to.search}${to.hash}`;
        return address !== now && wroteBefore(address) ? now : null;
    };
    const ownPush: History["pushState"] = (data, unused, url) => {
        const keep = stale(data, url);
        if (keep !== null) return replace(data, unused, keep);
        return push(data, unused, url);
    };
    const ownReplace: History["replaceState"] = (data, unused, url) => {
        const keep = stale(data, url);
        return replace(data, unused, keep ?? url);
    };
    history.pushState = ownPush;
    history.replaceState = ownReplace;
    return () => {
        // Something that wrapped these after us (Next's router) may still
        // call ours: they pass everything through from now on, and come
        // off only where they are still the outermost.
        active = false;
        if (history.pushState === ownPush) history.pushState = push;
        if (history.replaceState === ownReplace) history.replaceState = replace;
    };
}

/** The step an address is on: the one it names, else what its choices reach. */
function stepNamed(search: string): BookingStep {
    const url = parseStepUrl(search);
    return url.step ?? impliedStep(url);
}

/** The path, the query with `url` written into it, and the hash. */
function addressFor(url: StepUrl): string {
    if (typeof window === "undefined") return "";
    const { pathname, search, hash } = window.location;
    return `${pathname}${serializeStepUrl(search, url)}${hash}`;
}

function currentAddress(): string {
    if (typeof window === "undefined") return "";
    const { pathname, search, hash } = window.location;
    return `${pathname}${search}${hash}`;
}
