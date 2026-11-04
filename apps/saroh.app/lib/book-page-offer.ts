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
 * The stored list keeps what the merchant set: their order, and the section's
 * display options (layout, prices, button label, heading). It never narrows
 * the offer (owner, 4 Nov 2026): whoever opens the Book page can pick anything
 * offered, so every other service offered follows the ones it names. Home,
 * Prices and other pages keep their stored selection.
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

function storedIds(section: Section): string[] {
    const ids = (section.content as { serviceIds?: unknown } | null)
        ?.serviceIds;
    return Array.isArray(ids)
        ? ids.filter((id): id is string => typeof id === "string")
        : [];
}

/** One list over `offered`: its stored order first, then every other one. */
export function offeredByList(
    ids: readonly string[],
    offered: readonly PublicService[],
): PublicService[] {
    const byId = new Map(offered.map((s) => [s.id, s]));
    const listed = ids.flatMap((id) => byId.get(id) ?? []);
    const on = new Set(listed.map((s) => s.id));
    return [...listed, ...offered.filter((s) => !on.has(s.id))];
}

/** A Booking block's service, when it names one. */
function bookingService(section: Section): string | null {
    const id = (section.content as { serviceId?: unknown } | null)?.serviceId;
    return typeof id === "string" && id !== "" ? id : null;
}

/**
 * The services a page without a list reaches through its other blocks: a
 * Booking block's, while it is offered, and a Timetable's classes with a
 * session on show. So a block that draws nothing, or stale ids, counts for
 * nothing, and a one-to-one service, which no timetable shows, counts only
 * where a Booking block names it.
 */
function reachedByBlocks(
    sections: readonly Section[],
    offered: readonly PublicService[],
    onTimetables: readonly (readonly string[] | null | undefined)[],
): Set<string> {
    const named = sections.flatMap((section, i) => {
        if (section.type === "booking") return bookingService(section) ?? [];
        return section.type === "timetable" ? (onTimetables[i] ?? []) : [];
    });
    return new Set(
        offered.filter((s) => named.includes(s.id)).map((s) => s.id),
    );
}

/**
 * The sections to draw and each list's services, by section index. The first
 * list carries the offer; another one on the page keeps to its own ids, and
 * what those list isn't repeated in the first. A page with no list keeps its
 * Booking and Timetable blocks and gets a list of what they don't reach, so it
 * is never blank or a dead end. `onTimetables` is what each Timetable has on
 * show, by section index (`getTimetableClasses`); null where its read failed.
 */
export function bookPageOffer(
    sections: readonly Section[],
    offered: readonly PublicService[],
    look?: LookId,
    onTimetables: readonly (readonly string[] | null | undefined)[] = [],
): { sections: Section[]; serviceLists: (ServicesFeed | undefined)[] } {
    const reached = reachedByBlocks(sections, offered, onTimetables);
    // A Booking block for a service that's gone only says booking is closed,
    // beside a list that shows it isn't.
    const kept = sections.filter(
        (s) =>
            s.type !== "booking" ||
            offered.some((o) => o.id === bookingService(s)),
    );
    const everyReached =
        kept.some((s) => s.type === "servicesList") ||
        reached.size === offered.length;
    const drawn = everyReached ? kept : [...kept, EVERY_SERVICE];
    const lists = drawn.filter((s) => s.type === "servicesList");
    const first = lists[0];
    const elsewhere = new Set(lists.slice(1).flatMap(storedIds));
    const serviceLists = drawn.map((section) => {
        if (section.type !== "servicesList") return undefined;
        if (section === EVERY_SERVICE) {
            return {
                services: offered.filter((s) => !reached.has(s.id)),
                moreHref: null,
            };
        }
        if (section !== first) {
            return offeredOnly(storedIds(section), offered);
        }
        const services = offeredByList(
            storedIds(section),
            offered.filter((s) => !elsewhere.has(s.id)),
        );
        // One card draws one service: the link is the only way to the rest.
        const oneCard =
            resolveVariant("servicesList", section.content, look) ===
            "priceCard";
        return {
            services,
            moreHref: oneCard && services.length > 1 ? ALL_SERVICES_HREF : null,
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
