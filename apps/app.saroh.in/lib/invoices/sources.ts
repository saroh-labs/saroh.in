import type { InvoiceKind, InvoiceSource } from "./service";

/**
 * What an invoice was for, as the Invoices list's chips file it (round-2
 * D18). Pure, so the screen and its tests agree.
 *
 * Every source in the data has a chip: an order's paper (online, taken at
 * the counter, or a walk-in's — all of them the order's), a booking paid
 * online, a subscription's renewal, a pack sold, a course, and one written
 * by hand. A chip shows only when the business has any, so a shop never
 * meets "Courses". A correction is filed under what its original was for:
 * a credit note against a renewal is written MANUAL by the API, and would
 * otherwise sit under "By hand".
 */

export type SourceChip = "all" | InvoiceSource;

export const SOURCE_CHIPS: readonly { id: SourceChip; label: string }[] = [
    { id: "all", label: "All" },
    { id: "ORDER", label: "Orders" },
    { id: "BOOKING", label: "Bookings" },
    { id: "SUBSCRIPTION", label: "Subscriptions" },
    { id: "PACK", label: "Packs" },
    { id: "COURSE", label: "Courses" },
    { id: "MANUAL", label: "By hand" },
];

/** How the empty line names each: "No overdue invoices for packs." */
const NOUN: Record<InvoiceSource, string> = {
    ORDER: "orders",
    BOOKING: "bookings",
    SUBSCRIPTION: "subscriptions",
    PACK: "packs",
    COURSE: "courses",
    MANUAL: "invoices written by hand",
};

interface Filed {
    id: string;
    source: InvoiceSource;
    kind?: InvoiceKind;
    related?: { id: string } | null;
}

/** `?source=` as a chip; anything else is All. */
export function chipFromQuery(value: string | undefined): SourceChip {
    return SOURCE_CHIPS.some((c) => c.id === value)
        ? (value as SourceChip)
        : "all";
}

/**
 * What each row is filed under: its own source, or — for a correction —
 * its original's, when the original is on hand.
 */
export function filedUnder<T extends Filed>(
    rows: T[],
): Map<string, InvoiceSource> {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const out = new Map<string, InvoiceSource>();
    for (const r of rows) {
        const original =
            r.kind && r.kind !== "INVOICE" && r.related
                ? byId.get(r.related.id)
                : undefined;
        out.set(r.id, original?.source ?? r.source);
    }
    return out;
}

/** The rows a chip keeps. */
export function inChip<T extends Filed>(rows: T[], chip: SourceChip): T[] {
    if (chip === "all") return rows;
    const filed = filedUnder(rows);
    return rows.filter((r) => filed.get(r.id) === chip);
}

/**
 * The chips to offer: All and each source the business has any of — and
 * the chosen one, even when a link chose one with none, so it can be seen
 * and cleared. None at all when there is only one source: a chip that
 * narrows nothing is a step for no reason.
 */
export function chipsFor<T extends Filed>(
    rows: T[],
    chosen: SourceChip,
): typeof SOURCE_CHIPS {
    const present = new Set(filedUnder(rows).values());
    const offered = SOURCE_CHIPS.filter(
        (c) => c.id === "all" || c.id === chosen || present.has(c.id),
    );
    return offered.length > 2 || chosen !== "all" ? offered : [];
}

/** "No overdue invoices for packs.", "No invoices written by hand yet." */
export function chipEmptyLine(tabLabel: string, chip: SourceChip): string {
    // "Drafts" names the tab; the line reads "No draft invoices".
    const word = tabLabel === "Drafts" ? "draft" : tabLabel.toLowerCase();
    const tab = tabLabel === "All" ? "" : `${word} `;
    if (chip === "all") return `No ${tab}invoices.`;
    if (chip === "MANUAL") {
        return tab
            ? `No ${tab}invoices written by hand.`
            : "No invoices written by hand yet.";
    }
    return `No ${tab}invoices for ${NOUN[chip]}${tab ? "" : " yet"}.`;
}

/**
 * One pack's or course's invoices (`?pack=`, `?course=`), from Pack Detail's
 * Receipts and Course Detail's Payments. The design adds "pack" to a pack's
 * name; a name that already says it isn't told twice.
 */
export type InvoiceScope =
    | { kind: "pack"; id: string; name: string | null }
    | { kind: "course"; id: string; name: string | null };

export function scopeName(scope: InvoiceScope): string {
    const name = scope.name?.trim();
    if (!name) return scope.kind === "pack" ? "this pack" : "this course";
    if (scope.kind === "pack" && !/\bpack$/i.test(name)) return `${name} pack`;
    return name;
}

/** "Showing 3 for Morning pack" — the design's pill. */
export function scopeLine(scope: InvoiceScope, count: number): string {
    return `Showing ${count} for ${scopeName(scope)}`;
}

/** "No invoices for Morning pack yet" — the plan's empty line. */
export function scopeEmptyLine(scope: InvoiceScope): string {
    return `No invoices for ${scopeName(scope)} yet`;
}
