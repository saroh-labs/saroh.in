"use client";

import { useEffect } from "react";

import { markVisitStep } from "@saroh/site-blocks/visit-source";

/**
 * Says a visit reached a step (U15): "looked" on a product or the booking
 * page, "started" on the checkout, "paid" on an order's confirmation page
 * after a successful online payment (DEC-181; the group and label only,
 * never the order). The checkout and the confirmation page are private:
 * they send no page view, and exactly this step goes from them. Sent at
 * most once per visit, with only where the visit came from, and only when
 * the site's beacon began a visit
 * (`components/site-view-beacon.tsx`): never on a preview, a test release
 * or for a browser that asks not to be tracked.
 *
 * A tick after mounting, so the beacon in the layout has counted the page
 * (and begun the visit, on a visit's first page) whichever hydrates first.
 */
export function VisitStep({ step }: { step: "looked" | "started" | "paid" }) {
    useEffect(() => {
        const timer = setTimeout(() => markVisitStep(step), 0);
        return () => clearTimeout(timer);
    }, [step]);
    return null;
}
