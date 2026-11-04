"use client";

import { useEffect } from "react";

/**
 * The header's Sign in and a booking in progress (owner, 4 Nov 2026). The
 * header and the flow are drawn apart (layout, page), so the press asks the
 * page: an event any flow on it can take, as the cookie notice's own is
 * asked to open. What was typed lives in the flow's memory, so nothing that
 * leaves `/book` may be the answer while a flow is open.
 */
const HEADER_SIGN_IN = "saroh:header-sign-in";

/** Whether a flow on the page opened its own sign-in. */
export function flowTookSignIn(): boolean {
    return !window.dispatchEvent(
        new Event(HEADER_SIGN_IN, { cancelable: true }),
    );
}

export function bookingOnPage(): boolean {
    return document.querySelector("[data-booking-step]") !== null;
}

/** `take` opens the flow's sign-in, or says false where it has none. */
export function useHeaderSignIn(take: () => boolean): void {
    useEffect(() => {
        const onAsk = (event: Event) => {
            if (take()) event.preventDefault();
        };
        window.addEventListener(HEADER_SIGN_IN, onAsk);
        return () => window.removeEventListener(HEADER_SIGN_IN, onAsk);
    });
}
