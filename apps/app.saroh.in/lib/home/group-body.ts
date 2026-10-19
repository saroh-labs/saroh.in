import { count } from "@/lib/format/plural";

import type { GroupLine } from "./group-words";
import type {
    HomeInline,
    HomeNeed,
    HomeNeedGroup,
    HomeNeedKind,
} from "./service";

/**
 * What a Needs you group says around its rows once it is open (DEC-171,
 * Home plan U7, boards `HANeedsD`, `HAInlineD`, `HPSheets`): the "3 more
 * orders" line under them, the low-stock note, the group's one action
 * while it is closed, and its line once everything in it is done here.
 *
 * The same words wherever the group's body is drawn: in place at a desk
 * (`need-groups.tsx`) or in a sheet on a phone (U17). Pure, so it is
 * tested without a page.
 */

/** What "4 more" names, per group. */
const MORE_NOUN: Record<HomeNeedKind, [string, string]> = {
    ORDERS: ["order", "orders"],
    BILLS: ["bill", "bills"],
    AWAITING_PAYMENT: ["booking", "bookings"],
    ENQUIRIES: ["enquiry", "enquiries"],
    PAYMENTS: ["payment", "payments"],
    REVIEWS: ["review", "reviews"],
    STOCK: ["product", "products"],
    SETUP: ["thing", "things"],
};

/**
 * The line under the rows, or null when every row is here: "3 more
 * orders"; on bills, the rest of the overdue and the bills not due yet,
 * "5 more overdue, 6 not due yet" (`HANeedsD`).
 */
export function moreLabel(group: HomeNeedGroup): string | null {
    if (group.kind === "BILLS") {
        const notDue =
            group.all !== undefined && group.all > group.count
                ? group.all - group.count
                : 0;
        const parts = [
            group.more > 0 ? `${group.more} more overdue` : null,
            notDue > 0 ? `${notDue} not due yet` : null,
        ].filter((p): p is string => p !== null);
        return parts.length > 0 ? parts.join(", ") : null;
    }
    if (group.more <= 0) return null;
    const [one, many] = MORE_NOUN[group.kind];
    return count(group.more, `more ${one}`, `more ${many}`);
}

/** Where stock levels are set: the stock screen, every product. */
export const STOCK_LEVELS_HREF = "/commerce/stock";

/** Whether the group holds products running low (A14). */
export function holdsLowStock(group: Pick<HomeNeedGroup, "kind" | "codes">) {
    return group.kind === "STOCK" && group.codes.includes("COMMERCE_STOCK_LOW");
}

/**
 * Under the low-stock rows: only products with a stock level show here,
 * and where to set one (A14, `HANeedsD`). Null for any other group.
 */
export function stockNote(
    group: Pick<HomeNeedGroup, "kind" | "codes">,
): { text: string; link: { label: string; href: string } } | null {
    if (!holdsLowStock(group)) return null;
    return {
        text: "Only products with a stock level show here.",
        link: { label: "Set stock levels", href: STOCK_LEVELS_HREF },
    };
}

/** A stock row's own step: Add stock, on that product's stock. */
export function addStockLink(
    need: HomeNeed,
): { label: string; href: string } | null {
    if (
        need.code !== "COMMERCE_STOCK_LOW" &&
        need.code !== "COMMERCE_STOCK_SHORT"
    )
        return null;
    if (need.link || need.inline) return null;
    return { label: "Add stock", href: need.href };
}

/**
 * The list a group stands for, as the sheet's last button on a phone
 * ("Open all orders", "Open bookings", "Set stock levels", `HPSheets`).
 * The desk's line is itself that link.
 */
export function groupOpenAll(group: HomeNeedGroup): {
    label: string;
    href: string;
} {
    switch (group.kind) {
        case "ORDERS":
            return { label: "Open all orders", href: group.href };
        case "BILLS":
            return { label: "See bills", href: group.href };
        case "AWAITING_PAYMENT":
            return { label: "Open bookings", href: group.href };
        case "ENQUIRIES":
            return { label: "Open enquiries", href: group.href };
        case "PAYMENTS":
            return { label: "Open payments", href: group.href };
        case "REVIEWS":
            return { label: "Open reviews", href: group.href };
        case "STOCK":
            return holdsLowStock(group)
                ? { label: "Set stock levels", href: STOCK_LEVELS_HREF }
                : { label: "Open stock", href: group.href };
        case "SETUP":
            return { label: "Open all", href: group.href };
    }
}

/**
 * The one action a closed group offers beside its tag (`HAFailedD`, plan
 * U7): the first open row's own action ("Send payment link", "Reply",
 * "Retry by payment link"), which opens the group and that row's confirm
 * in place, never another page; on low stock, Add stock. Orders and bills
 * have their own buttons ("Open orders", "See bills", Remind all), so
 * none here. Null when there is nothing one press can start.
 */
export type GroupOneAction =
    | { kind: "row"; label: string; rowId: string }
    | { kind: "link"; label: string; href: string };

export function groupOneAction(
    group: HomeNeedGroup,
    doneIds: ReadonlySet<string> = new Set(),
): GroupOneAction | null {
    if (group.kind === "ORDERS" || group.kind === "BILLS") return null;
    if (group.kind === "SETUP") return null;
    if (group.kind === "STOCK") {
        const first = group.rows.find((r) => !doneIds.has(r.id));
        if (!first) return null;
        const step = addStockLink(first);
        return step
            ? {
                  kind: "link",
                  label: step.label,
                  href: group.rows.length === 1 ? step.href : group.href,
              }
            : null;
    }
    const row = group.rows.find(
        (r): r is HomeNeed & { inline: HomeInline } =>
            r.inline !== undefined && !doneIds.has(r.id),
    );
    if (!row) return null;
    return { kind: "row", label: row.inline.label, rowId: row.id };
}

/**
 * Every row this group stands for has been done here, and nothing is
 * left past them: the group folds (plan U7).
 */
export function groupEmptied(
    group: Pick<HomeNeedGroup, "rows" | "more" | "all" | "count">,
    doneIds: ReadonlySet<string>,
): boolean {
    if (group.more > 0 || group.rows.length === 0) return false;
    return group.rows.every((r) => doneIds.has(r.id));
}

/** What a group is called once it is empty: "Bookings awaiting payment". */
const KIND_NAME: Record<HomeNeedKind, string> = {
    ORDERS: "Orders to send or hand over",
    BILLS: "Overdue bills",
    AWAITING_PAYMENT: "Bookings awaiting payment",
    ENQUIRIES: "Enquiries",
    PAYMENTS: "Payments and refunds",
    REVIEWS: "Reviews",
    STOCK: "Stock",
    SETUP: "Setup",
};

/** The folded group's line: "All done", and which group it was. */
export function emptiedLine(kind: HomeNeedKind): GroupLine {
    return {
        title: "All done",
        sub: `${KIND_NAME[kind]} · nothing left to do here`,
        tag: null,
    };
}
