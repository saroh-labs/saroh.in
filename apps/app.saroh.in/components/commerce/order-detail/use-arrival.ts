"use client";

import { useEffect, useRef } from "react";

import type { Arrival } from "@/lib/orders/row-menu";

import type { Panel } from "./use-kitchen";

/**
 * What Order Detail was opened to do, from the Orders list's row menu and
 * quick view (plan B, B5; `arrivalOf`): open the refund or courier panel,
 * or print the ticket. Each happens once, only when the order allows it
 * (`allows`), and the address then drops the ask, so a reload or Back
 * doesn't do it again.
 */
export function useArrival(
    arrival: Arrival,
    allows: { refund: boolean; courier: boolean; print: boolean },
    setPanel: (p: Panel) => void,
) {
    const done = useRef(false);
    useEffect(() => {
        if (done.current || !arrival) return;
        done.current = true;
        if (arrival === "refund" && allows.refund) setPanel("refund");
        if (arrival === "courier" && allows.courier) setPanel("courier");
        const url = new URL(window.location.href);
        url.searchParams.delete("panel");
        url.searchParams.delete("print");
        window.history.replaceState(window.history.state, "", url);
        if (arrival === "print" && allows.print) {
            // After the page has painted, so the ticket prints whole.
            window.setTimeout(() => window.print(), 300);
        }
    }, [arrival, allows.refund, allows.courier, allows.print, setPanel]);
}
