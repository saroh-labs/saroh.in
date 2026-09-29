import type { SiteHeaderAction } from "@saroh/site-blocks";

import type { BookingPageLookup } from "./booking-page";

/**
 * The site header's main button (G17): "Book", "Order" or nothing.
 *
 * - **Book**, to `/book`, when the booking page would take a booking: the
 *   business has Appointments on and offers at least one service here.
 *   Appointments with nothing to book leads to an empty page, so it gets
 *   no button.
 * - **Order**, to `/shop`, only when `/shop` serves for this site (G11:
 *   the API's `SITE_SHOP` flag on, Commerce on and a sells-from storefront
 *   with listings). The layout passes `getCatalogue(siteId).ok`
 *   (`lib/catalogue.ts`), the same read `/shop` draws. Every product there
 *   has an action (G13): Add to bag, or "Ask about ordering".
 * - Otherwise none. A site whose booking read failed gets none too: a
 *   header without a button is better than one that promises a page the
 *   API couldn't vouch for.
 */
export function headerAction({
    booking,
    shopServes,
}: {
    booking: BookingPageLookup | null;
    shopServes: boolean;
}): SiteHeaderAction | null {
    if (booking?.ok && booking.page.open && booking.page.services.length > 0) {
        return { label: "Book", href: "/book" };
    }
    if (shopServes) return { label: "Order", href: "/shop" };
    return null;
}
