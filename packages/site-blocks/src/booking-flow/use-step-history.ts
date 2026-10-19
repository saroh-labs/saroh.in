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
                    window.history.replaceState(MARK, "", wanted);
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
                window.history.pushState(MARK, "", wanted);
            } else {
                window.history.replaceState(MARK, "", wanted);
            }
        } catch {
            // An address the browser won't take: the page still works.
        }
        written.current = wanted;
        // `want.step` is in `wanted`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wanted]);

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
