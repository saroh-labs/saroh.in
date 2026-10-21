import type { FrontDoor, Section } from "@saroh/site-blocks";

import { getBookingPage } from "./booking-page";
import { getCatalogue } from "./catalogue";
import { headerAction } from "./header-action";

/**
 * The way in a look's hero offers beside its button (DEC-172, plan U6,
 * #1094): the booking page while it takes bookings (the next free time
 * shows there once live facts are read, U8), else the shop while it
 * serves, else none. The same rule, on the same reads, as the header's
 * main button (`headerAction`): both are `cache`d, so a page the layout
 * has already asked about costs no second read.
 *
 * Only the home page under a look, with a hero, asks: the boards draw the
 * slot on the home's first screen alone (an About page opens on its own
 * title), Classic never draws it, and a page with no hero has nowhere to
 * put it.
 */
export async function frontDoorFor({
    siteId,
    look,
    sections,
    pages,
    home = true,
}: {
    siteId: string | null;
    look: string | null | undefined;
    /** The page is the site's home. */
    home?: boolean;
    sections: readonly Section[];
    pages?: readonly { path: string; kind?: string | null }[];
}): Promise<FrontDoor | null> {
    if (!siteId || !look || !home) return null;
    if (!sections.some((section) => section.type === "hero")) return null;
    const [booking, catalogue] = await Promise.all([
        getBookingPage(siteId),
        getCatalogue(siteId),
    ]);
    const action = headerAction({
        booking,
        shopServes: catalogue.ok,
        pages,
    });
    if (action?.kind === "book") return { kind: "book", href: action.href };
    if (action?.kind === "shop") return { kind: "shop", href: action.href };
    return null;
}
