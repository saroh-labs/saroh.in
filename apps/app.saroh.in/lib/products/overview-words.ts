/**
 * The product page's Overview in words (#522), after "Saroh Product Detail":
 * the availability card, the "Linked to this product" cards, the Details
 * tags and the access line. Pure and client-safe; the API does the
 * arithmetic, these only say it.
 */

import type { OverviewOrder, ProductPlacement } from "./overview-rules";
import { ORDER_STATUS_LABEL, plural } from "./overview-rules";

// ---- Availability ----

export interface Availability {
    /** More promised than is on some shelf: the card turns into an alert. */
    short: boolean;
    label: string;
    /** The big figure: what can be sold, or "N short". */
    figure: string;
    note: string;
}

/**
 * "Can be sold now · 25 · 30 on hand, 5 promised" — or, when open orders
 * hold more than a shelf has, "Short for orders already placed · 2 short".
 * `short` is summed shelf by shelf: a surplus at one storefront doesn't
 * cover a gap at another.
 */
export function availability(
    totals: {
        onHand: number;
        promised: number;
        canSell: number;
        short: number;
    },
    perStore: string | null = null,
): Availability {
    const note = `${totals.onHand} on hand, ${totals.promised} promised${
        perStore ? ` · ${perStore}` : ""
    }`;
    if (totals.short > 0) {
        return {
            short: true,
            label: "Short for orders already placed",
            figure: `${totals.short} short`,
            note,
        };
    }
    return {
        short: false,
        label: "Can be sold now",
        figure: String(totals.canSell),
        note,
    };
}

/** "10 at Hill Road, 15 online" — only when there is more than one. */
export function sellableByStore(
    stores: readonly { name: string; canSell: number }[],
): string | null {
    if (stores.length < 2) return null;
    return stores
        .map((s) =>
            s.name.trim().toLowerCase() === "online"
                ? `${s.canSell} online`
                : `${s.canSell} at ${s.name}`,
        )
        .join(", ");
}

/**
 * "5 held by 3 open orders — 800g 4, 400g 1": what the promised units are,
 * and which sizes hold them. Null when nothing is promised. With orders
 * unread, the number still stands — it comes from the product's shelves.
 */
export function heldByLine(
    promised: number,
    openOrders: number | null,
    bySize: readonly { title: string; promised: number }[],
): string | null {
    if (promised <= 0) return null;
    if (openOrders === null) {
        return `Promised stock (${promised}) comes from the product itself, so it is still right while orders are down.`;
    }
    const sizes = bySize
        .filter((s) => s.promised > 0)
        .map((s) => `${s.title} ${s.promised}`)
        .join(", ");
    const held = `${promised} held by ${plural(openOrders, "open order")}`;
    return sizes ? `${held} — ${sizes}` : held;
}

// ---- Linked to this product ----

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/** "3 open · 41 in September". */
export function ordersSummary(
    openCount: number,
    thisMonth: number,
    now: Date,
): string {
    return `${openCount} open · ${thisMonth} in ${MONTHS[now.getMonth()]}`;
}

/** An order's reference as people say it: "#1020"; "ORD-507" as it is. */
export function orderRef(number: string): string {
    return /^\d+$/.test(number) ? `#${number}` : number;
}

/** "#1020 Priya — 800g × 2, new". */
export function openOrderLine(
    order: OverviewOrder,
    productName: string,
): string {
    const first = order.customer.trim().split(/\s+/)[0] || order.customer;
    const what = order.lines
        .map((l) => `${l.title || productName} × ${l.quantity}`)
        .join(", ");
    const status = (
        ORDER_STATUS_LABEL[order.status] ?? order.status
    ).toLowerCase();
    return `${orderRef(order.orderNumber)} ${first} — ${what}, ${status}`;
}

/**
 * The collections it shows in now — a hand-picked one keeps an archived
 * product but doesn't show it. The Overview's card, the tab's count and
 * the Collections tab all count these (#524).
 */
export function shownCollections(
    placement: ProductPlacement,
): ProductPlacement["collections"] {
    return placement.collections.filter((c) => c.showing);
}

/** "In 2 collections" and their names; "In no collection" and "—". */
export function collectionsSummary(placement: ProductPlacement): {
    count: string;
    names: string;
} {
    const shown = shownCollections(placement);
    return {
        count:
            shown.length === 0
                ? "In no collection"
                : `In ${plural(shown.length, "collection")}`,
        names: shown.map((c) => c.name).join(", ") || "—",
    };
}

/**
 * "Shown on 2 pages" and each page — or, until the website has a block
 * that shows products (#473), that it doesn't yet.
 */
export function websiteSummary(placement: ProductPlacement): {
    headline: string;
    lines: string[];
} {
    const { showsProducts, pages } = placement.website;
    if (!showsProducts) {
        return {
            headline: "Not on the website",
            lines: ["The website doesn't show products yet."],
        };
    }
    if (pages.length === 0) {
        return {
            headline: "Not on any page",
            lines: ["No published page shows it or its collections."],
        };
    }
    return {
        headline: `Shown on ${plural(pages.length, "page")}`,
        lines: pages.map((p) => p.title || p.path),
    };
}

// ---- Details ----

export type DetailTag = "On the shop" | "Team only" | "Hidden until filled in";

/**
 * The tag beside a detail: whether customers see it. One the shop would
 * show but that is empty says so — "Hidden until filled in" — rather than
 * claiming it is on the shop.
 */
export function detailTag(filled: boolean, onShop: boolean): DetailTag {
    if (!onShop) return "Team only";
    return filled ? "On the shop" : "Hidden until filled in";
}

/** What an empty detail reads. */
export const NOT_FILLED_IN = "Not filled in";

// ---- Who is looking ----

/**
 * The line under the header for anyone who can't change the product:
 * who they are signed in as, what they can do here, and who can change
 * that. Null for someone who can change it.
 */
export function accessLine(may: {
    roleLabel: string;
    canWrite: boolean;
    canStock: boolean;
    canReply: boolean;
}): string | null {
    if (may.canWrite) return null;
    const can = [
        may.canStock ? "change stock counts" : null,
        may.canReply ? "reply to and hide reviews" : null,
    ].filter((x): x is string => x !== null);
    const does = can.length
        ? `You can ${can.join(" and ")} here.`
        : "You can look, but not change anything.";
    return `You're signed in as ${may.roleLabel}. ${does} An owner or admin can change what you can do in Team.`;
}

/**
 * Where the product sells, for the header's line: its storefronts'
 * names while published, else why it isn't on the shop.
 */
export function whereItSells(
    status: "PUBLISHED" | "DRAFT" | "ARCHIVED",
    storefronts: readonly string[],
): string {
    if (status === "ARCHIVED") return "not on the shop";
    if (status === "DRAFT") return "not on the shop yet";
    return storefronts.length ? storefronts.join(", ") : "not sold anywhere";
}
