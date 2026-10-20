"use client";

import { useEffect } from "react";

import { withArrival } from "@/lib/customers/prefill";
import { rememberLastView } from "@/lib/services/bookings-opens";
import type { CalendarLayout } from "@/lib/services/calendar-href";

import { PHONE_WIDTHS } from "../header/use-phone";

/**
 * Which view Bookings stays on, once it is drawn (Q4, Q15, U6). When
 * nothing chose one (no view in the address, "Where I left it" with
 * nothing left yet) the server draws Day; a phone then moves to List, with
 * the address saying so. Otherwise the view shown is kept for "Where I
 * left it" on this device. The width is asked once, here, so the phone's
 * first Day is never kept as its choice.
 */
export function useOpeningView({
    layout,
    listFirst,
    listHref,
    replace,
}: {
    layout: CalendarLayout;
    /** Nothing chose the view: the server fell back to Day. */
    listFirst: boolean;
    /** The address of List on the same day, person and cancelled choice. */
    listHref: string;
    replace: (href: string) => void;
}): void {
    useEffect(() => {
        const phone =
            typeof window.matchMedia === "function" &&
            window.matchMedia(PHONE_WIDTHS).matches;
        if (listFirst && layout === "day" && phone) {
            // New booking opened by the address (`?new=1`) stays named.
            replace(withArrival(listHref, window.location.search));
            return;
        }
        rememberLastView(layout);
    }, [layout, listFirst, listHref, replace]);
}
