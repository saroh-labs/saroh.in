"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
    CheckoutOutcome,
    CheckoutRequest,
    CheckoutSession,
} from "./checkout";
import { openProviderCheckout } from "./checkout";

/** Where the provider's window stands: not yet opened, open, or its answer. */
export type CheckoutStatus = "idle" | "open" | CheckoutOutcome;

/**
 * The provider's window for a pay-now hold (E11). It opens by itself once
 * the handoff arrives, and `open` opens it again — after the booker closed
 * it, or the provider refused. Leaving the paying card closes it: the hold
 * ran out, or the page moved on.
 */
export function useCheckout(
    request: CheckoutRequest | null,
    onPaid: () => void,
): { status: CheckoutStatus; open: () => void } {
    const [status, setStatus] = useState<CheckoutStatus>("idle");
    const session = useRef<CheckoutSession | null>(null);
    const latest = useRef({ request, onPaid });
    useEffect(() => {
        latest.current = { request, onPaid };
    });

    const open = useCallback(() => {
        const { request: now } = latest.current;
        if (!now) return;
        session.current?.close();
        const opened = openProviderCheckout(now);
        session.current = opened;
        setStatus("open");
        void opened.outcome.then((outcome) => {
            // A window the page has since replaced or closed says nothing.
            if (session.current !== opened) return;
            setStatus(outcome);
            if (outcome === "paid") latest.current.onPaid();
        });
    }, []);

    const ready = request !== null;
    useEffect(() => {
        if (ready) open();
    }, [ready, open]);

    useEffect(
        () => () => {
            session.current?.close();
            session.current = null;
        },
        [],
    );

    return { status, open };
}
