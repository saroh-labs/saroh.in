"use client";

import { AddonsPanel } from "./addons-panel";
import { CouponsPanel } from "./coupons-panel";
import { OfferGst } from "./offer-gst";
import { OfferTrials } from "./offer-trials";
import { OfferYearly } from "./offer-yearly";

/**
 * The Offers tab (plans catalogue U9): yearly billing, which price the
 * pricing page shows first, free trials and add-ons, all part of the shared
 * draft; and coupons, which aren't, and apply as soon as they are saved.
 * No heading of its own: the tab's label already says "Offers".
 */
export function TabOffers() {
    return (
        <section aria-label="Offers" className="grid gap-3.5 text-[13.5px]">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3.5">
                <OfferYearly />
                <OfferGst />
                <OfferTrials />
            </div>
            <AddonsPanel />
            <CouponsPanel />
        </section>
    );
}
