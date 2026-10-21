"use client";

import { useEffect, useRef, useState } from "react";

import { fetchHold } from "./api";
import type { Phase } from "./flow-state";
import type { HoldView } from "./model";

/** How often the page asks where a hold stands while its booker pays. */
const POLL_MS = 4_000;

export type Paying = Extract<Phase, { kind: "paying" }>;

/** A hold that stands as paid: the booked card, with its link to join. */
export function paidPhase(
    held: Paying,
    standing: HoldView["booking"],
    first: string,
): Extract<Phase, { kind: "done" }> {
    return {
        kind: "done",
        booking: standing
            ? {
                  ...held.booking,
                  online: standing.online,
                  meetingUrl: standing.meetingUrl,
              }
            : held.booking,
        paid: true,
        price: held.price,
        rest: held.rest ?? null,
        when: held.when,
        first,
    };
}

/**
 * Watching a pay-now hold while its booker pays (U19, E11): its minutes
 * left, and where it stands, read every few seconds. Confirmed, the page
 * moves on to the booked card; let go or run out, to the card that says so.
 *
 * The hold is watched on the pay step and also while the booker has gone
 * Back a step with it still held (`aside`, U9): a payment the provider's
 * window took meanwhile still confirms the booking, and a hold that runs
 * out after the window took the money still says so — never silence.
 */
export function useHoldWatch({
    apiUrl,
    phase,
    setPhase,
    aside,
    setAside,
    bookerFirst,
    leavingRef,
}: {
    apiUrl: string;
    phase: Phase;
    setPhase: React.Dispatch<React.SetStateAction<Phase>>;
    aside: Paying | null;
    setAside: React.Dispatch<React.SetStateAction<Paying | null>>;
    bookerFirst: string;
    /** Letting the hold go answers for itself. */
    leavingRef: React.RefObject<boolean>;
}): {
    now: number | null;
    /** Read the hold now, rather than at the next tick (P1). */
    checkHoldNow: React.RefObject<(() => void) | null>;
} {
    const [now, setNow] = useState<number | null>(null);
    const checkHoldNow = useRef<(() => void) | null>(null);
    const asideRef = useRef(aside);
    useEffect(() => {
        asideRef.current = aside;
    });

    const payingToken =
        phase.kind === "paying" ? phase.token : (aside?.token ?? null);
    useEffect(() => {
        if (!payingToken) return;
        const tick = () => setNow(Date.now());
        tick();
        const clock = setInterval(tick, 15_000);
        const settle = (next: (held: Paying) => Phase | null) => {
            const held = asideRef.current;
            if (held?.token === payingToken) {
                const moved = next(held);
                if (!moved) return;
                setAside(null);
                // Paid, or gone with money that may have left: said on
                // the page, whatever step it is on. Gone with nothing
                // paid, the step they went back to stays as it is.
                if (moved.kind === "done" || held.checkoutPaid) {
                    setPhase(moved);
                }
                return;
            }
            setPhase((p) => {
                if (p.kind !== "paying" || p.token !== payingToken) return p;
                return next(p) ?? p;
            });
        };
        const pollOnce = () => {
            void fetchHold(apiUrl, payingToken).then((result) => {
                if (leavingRef.current) return;
                if (!result.ok) {
                    // A cleared token: the hold was let go.
                    if (result.status === 404) {
                        settle((held) => ({
                            kind: "expired",
                            when: held.when,
                            checkoutPaid: held.checkoutPaid,
                        }));
                    }
                    return;
                }
                const state = result.value.state;
                settle((held) => {
                    if (state === "CONFIRMED") {
                        return paidPhase(
                            held,
                            result.value.booking,
                            bookerFirst,
                        );
                    }
                    if (state === "RELEASED" || state === "CANCELLED") {
                        return {
                            kind: "expired",
                            when: held.when,
                            checkoutPaid: held.checkoutPaid,
                        };
                    }
                    return null;
                });
            });
        };
        const poll = setInterval(pollOnce, POLL_MS);
        // Read at once when the window closes on a payment: its return has
        // been checked and settled by then (P1), so the page moves on
        // without waiting for the next tick.
        checkHoldNow.current = pollOnce;
        return () => {
            clearInterval(clock);
            clearInterval(poll);
            checkHoldNow.current = null;
        };
    }, [apiUrl, payingToken, bookerFirst, setPhase, setAside, leavingRef]);

    return { now, checkHoldNow };
}
