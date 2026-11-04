import type { LookId } from "@saroh/block-contract";
import { resolveVariant } from "@saroh/block-contract";
import type { PublicService, ServicesFeed } from "@saroh/site-blocks";

import type { Section } from "./publication";

/**
 * What a published Book page offers (`/book`). It is the way to book, so it
 * always offers what the business can be booked for: the booking flow's own
 * read (`getBookingPage`), never only the ids a snapshot froze. So the page
 * and `/book?service=` can't disagree, and an old publication is right with
 * no republish.
 *
 * The stored list keeps what the merchant set: their order, and their choice
 * when they made one. The publication doesn't say whether they made one: a
 * list is written whole, once, when the page is made (the services there were
 * then, oldest first), and nothing adds to it later. So it is read from the
 * list itself:
 *
 * - nothing on it is offered now (or the page has no list): everything offered;
 * - what it lists has no gap among the services offered: the list as it was
 *   written, and every service newer than it follows it;
 * - it leaves out one older than one it lists: the merchant chose. Those show,
 *   and "See all services" opens the flow on the rest.
 *
 * shortcut: a merchant who took only their NEWEST services off the list looks
 * like the second case and sees them back. An explicit "all services" on the
 * section would settle it, a contract and editor change the owner decides.
 *
 * Pure, so it is tested without a server.
 */

/** The flow's own list of every service (`?step=what`, a deep link). */
export const ALL_SERVICES_HREF = "/book?step=what";

/** The Book page's list where the page has none: as a new Book page draws it. */
const EVERY_SERVICE: Section = {
    type: "servicesList",
    contractVersion: 1,
    content: {
        heading: "Services",
        serviceIds: [],
        showPrices: true,
        layout: "cards",
        showDescriptions: false,
        buttonLabel: "Choose a time",
    },
};

/** The blocks that are a way to book by themselves, chosen by the merchant. */
const WAYS_IN = new Set(["servicesList", "booking", "timetable"]);

function storedIds(section: Section): string[] {
    const ids = (section.content as { serviceIds?: unknown } | null)
        ?.serviceIds;
    return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [];
}

/** One list over `offered`, oldest first as the flow's read gives them. */
export function offeredByList(
    ids: readonly string[],
    offered: readonly PublicService[],
): { services: PublicService[]; narrowed: boolean } {
    const byId = new Map(offered.map((s) => [s.id, s]));
    const listed = ids.flatMap((id) => byId.get(id) ?? []);
    if (listed.length === 0) return { services: [...offered], narrowed: false };
    const on = new Set(listed.map((s) => s.id));
    const last = Math.max(...listed.map((s) => offered.indexOf(s)));
    const newer = offered.slice(last + 1);
    return offered.slice(0, last).some((s) => !on.has(s.id))
        ? { services: listed, narrowed: true }
        : { services: [...listed, ...newer], narrowed: false };
}

/**
 * The sections to draw and each list's services, by section index. The first
 * list carries the offer; another one on the page keeps to its own ids, and
 * what those list isn't repeated in the first.
 */
export function bookPageOffer(
    sections: readonly Section[],
    offered: readonly PublicService[],
    look?: LookId,
): { sections: Section[]; serviceLists: (ServicesFeed | undefined)[] } {
    const drawn = sections.some((s) => WAYS_IN.has(s.type))
        ? [...sections]
        : [...sections, EVERY_SERVICE];
    const lists = drawn.filter((s) => s.type === "servicesList");
    const first = lists[0];
    const elsewhere = new Set(lists.slice(1).flatMap(storedIds));
    const serviceLists = drawn.map((section) => {
        if (section.type !== "servicesList") return undefined;
        if (section !== first) {
            return offeredOnly(storedIds(section), offered);
        }
        const { services, narrowed } = offeredByList(
            storedIds(section),
            offered.filter((s) => !elsewhere.has(s.id)),
        );
        const oneCard =
            resolveVariant("servicesList", section.content, look) ===
            "priceCard";
        return {
            services,
            moreHref:
                narrowed || (oneCard && services.length > 1)
                    ? ALL_SERVICES_HREF
                    : null,
        };
    });
    return { sections: drawn, serviceLists };
}

function offeredOnly(
    ids: readonly string[],
    offered: readonly PublicService[],
): ServicesFeed {
    const byId = new Map(offered.map((s) => [s.id, s]));
    return { services: ids.flatMap((id) => byId.get(id) ?? []) };
}
