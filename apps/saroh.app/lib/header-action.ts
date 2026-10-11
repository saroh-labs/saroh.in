import type { ModulePageStates, SiteHeaderAction } from "@saroh/site-blocks";
import { contactPageHref, sitePrimaryAction } from "@saroh/site-blocks";

import type { BookingPageLookup } from "./booking-page";

/**
 * The site header's main button (G17): the site's ONE primary action,
 * "Book", "Order", "Contact us" or nothing. The rule itself is
 * `sitePrimaryAction` in site-blocks, shared with the hero and the closing
 * band a template writes; this reads what the site has now and asks it.
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
 * - **Contact us**, to the site's contact page, for a site that neither
 *   takes bookings nor sells: its Contact module page while that shows
 *   (G15), else a page of its own at `/contact`.
 * - Otherwise none. A site whose booking read failed gets no Book: a
 *   header without that button is better than one that promises a page the
 *   API couldn't vouch for.
 *
 * `pages` are the published pages (the snapshot's); `modules` says which
 * module pages show now.
 */
export function headerAction({
    booking,
    shopServes,
    pages = [],
    modules,
}: {
    booking: BookingPageLookup | null;
    shopServes: boolean;
    pages?: readonly { path: string; kind?: string | null }[];
    modules?: ModulePageStates | null;
}): SiteHeaderAction | null {
    return sitePrimaryAction({
        books: Boolean(
            booking?.ok &&
            booking.page.open &&
            booking.page.services.length > 0,
        ),
        sells: shopServes,
        contactHref: contactPageHref(
            pages.map((page) => ({ href: page.path, kind: page.kind })),
            modules,
        ),
    });
}
