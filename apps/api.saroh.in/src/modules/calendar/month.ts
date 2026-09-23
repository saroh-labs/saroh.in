import { DateTime } from "luxon";

import { fromMinor, toMinor } from "../../common/money";

/**
 * The Business Calendar's month, as pure bucketing (plan 2026-09-23-003, U4).
 *
 * The service reads each layer and turns its rows into dated items; this
 * file owns the month's window, which day a moment falls on, and how items,
 * the "to act on" list and takings land on days. Days are local dates in the
 * business's zone ("YYYY-MM-DD"); the month's first and last instants are
 * that zone's midnights, so an order at 00:30 IST on the 1st is the 1st even
 * though it is still the previous month in UTC.
 *
 * Every day of the month is present, and every day carries every layer the
 * viewer may see — a quiet day is zeros and empty lists, never a missing key,
 * so a screen never has to tell "nothing" from "not sent".
 */

/** The layers, in the order a screen lists them. */
export const LAYERS = [
    "orders",
    "collections",
    "subscriptions",
    "invoices",
    "bookings",
    "classes",
] as const;
export type LayerKey = (typeof LAYERS)[number];

export const LAYER_LABELS: Record<LayerKey, string> = {
    orders: "Orders",
    collections: "Collections",
    subscriptions: "Subscriptions",
    invoices: "Invoices",
    bookings: "Bookings",
    classes: "Classes",
};

/** Where an item opens. A class session opens its service, at its start. */
export type LinkType =
    "order" | "subscription" | "invoice" | "booking" | "service";

export interface CalendarLink {
    type: LinkType;
    id: string;
}

/** Kept per currency; amounts in different currencies are never added. */
export interface MoneyTotal {
    currency: string;
    amount: string;
}

/** One short line on a day: what it is, who, and where it opens. */
export interface CalendarItem {
    id: string;
    /** What happened, within its layer — e.g. `renewal`, `overdue`, `paid`. */
    kind: string;
    title: string;
    subtitle: string | null;
    /** The instant, when the item has one; a collection is a date only. */
    at: string | null;
    /** Money only — absent for a viewer who may not read it. */
    amount?: string;
    currency?: string;
    link: CalendarLink;
}

/** An item and the local day it belongs to. */
export interface DatedItem {
    layer: LayerKey;
    date: string;
    item: CalendarItem;
}

export interface LayerDay {
    /** The true count, which may exceed `items.length`. */
    count: number;
    /** The count per kind (e.g. invoices `due`, `overdue`, `paid`). */
    kinds: Record<string, number>;
    items: CalendarItem[];
}

export type ToActOnKind = "renewal_failed" | "invoice_overdue";

export interface ToActOn {
    kind: ToActOnKind;
    date: string;
    title: string;
    subtitle: string | null;
    amount?: string;
    currency?: string;
    link: CalendarLink;
}

export interface CalendarDay {
    date: string;
    layers: Partial<Record<LayerKey, LayerDay>>;
    /** How many of the month's "to act on" fall on this day. */
    toActOn: number;
    /** Money only: what was taken this day, each rupee once. */
    takings?: MoneyTotal[];
}

/** A payment taken, on a day — an order or a non-order invoice (ADR-008). */
export interface TakingEntry {
    date: string;
    currency: string;
    amount: { toString(): string };
}

/** How many items a day's layer lists; `count` is always the true total. */
export const ITEMS_PER_DAY = 50;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** True for "YYYY-MM". */
export function isMonth(value: string): boolean {
    return MONTH.test(value);
}

export interface MonthWindow {
    /** The zone's midnight starting the 1st. */
    start: Date;
    /** The zone's midnight starting the next month's 1st (exclusive). */
    end: Date;
    /** Every local date in the month, in order. */
    days: string[];
}

/** A month in a zone: its instants and its days. */
export function monthWindow(month: string, zone: string): MonthWindow {
    const match = MONTH.exec(month);
    if (!match) throw new Error(`Not a month: ${month}`);
    const first = DateTime.fromObject(
        { year: Number(match[1]), month: Number(match[2]), day: 1 },
        { zone },
    );
    const next = first.plus({ months: 1 });
    const days: string[] = [];
    for (let d = first; d < next; d = d.plus({ days: 1 })) {
        days.push(d.toFormat("yyyy-MM-dd"));
    }
    return { start: first.toJSDate(), end: next.toJSDate(), days };
}

/** The local date of a moment, in a zone. */
export function dayOf(at: Date, zone: string): string {
    return DateTime.fromJSDate(at, { zone }).toFormat("yyyy-MM-dd");
}

/** Add per currency, in minor units; zero totals are left out. */
export function sumMoney(
    entries: { currency: string; amount: { toString(): string } }[],
): MoneyTotal[] {
    const byCurrency = new Map<string, number>();
    for (const e of entries) {
        byCurrency.set(
            e.currency,
            (byCurrency.get(e.currency) ?? 0) + toMinor(e.amount),
        );
    }
    return [...byCurrency.entries()]
        .filter(([, minor]) => minor !== 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, minor]) => ({ currency, amount: fromMinor(minor) }));
}

const byWhen = (a: CalendarItem, b: CalendarItem) =>
    (a.at ?? "").localeCompare(b.at ?? "") || a.title.localeCompare(b.title);

/**
 * Lay items, to-act-on and takings onto the month's days. Anything dated
 * outside the month, or in a layer the viewer may not see, is dropped.
 * `takings` null means no takings are sent (no money, or a source failed).
 */
export function buildDays(input: {
    days: string[];
    layers: readonly LayerKey[];
    items: DatedItem[];
    toActOn: ToActOn[];
    takings: TakingEntry[] | null;
    itemsPerDay?: number;
}): CalendarDay[] {
    const cap = input.itemsPerDay ?? ITEMS_PER_DAY;
    const visible = new Set(input.layers);
    const byDay = new Map<string, CalendarDay>();
    for (const date of input.days) {
        const layers: Partial<Record<LayerKey, LayerDay>> = {};
        for (const layer of LAYERS) {
            if (visible.has(layer)) {
                layers[layer] = { count: 0, kinds: {}, items: [] };
            }
        }
        byDay.set(date, {
            date,
            layers,
            toActOn: 0,
            ...(input.takings === null ? {} : { takings: [] }),
        });
    }

    for (const { layer, date, item } of input.items) {
        const cell = byDay.get(date)?.layers[layer];
        if (!cell) continue;
        cell.count += 1;
        cell.kinds[item.kind] = (cell.kinds[item.kind] ?? 0) + 1;
        cell.items.push(item);
    }
    for (const day of byDay.values()) {
        for (const cell of Object.values(day.layers)) {
            cell.items.sort(byWhen);
            cell.items.splice(cap);
        }
    }

    for (const act of input.toActOn) {
        const day = byDay.get(act.date);
        if (day) day.toActOn += 1;
    }

    if (input.takings !== null) {
        const perDay = new Map<string, TakingEntry[]>();
        for (const entry of input.takings) {
            if (!byDay.has(entry.date)) continue;
            perDay.set(entry.date, [...(perDay.get(entry.date) ?? []), entry]);
        }
        for (const [date, entries] of perDay) {
            const day = byDay.get(date);
            if (day) day.takings = sumMoney(entries);
        }
    }

    return input.days.flatMap((date) => {
        const day = byDay.get(date);
        return day ? [day] : [];
    });
}

/**
 * What needs acting on, each thing once. A renewal whose charge is unpaid
 * past its due date is a failed renewal, not also an overdue invoice — it is
 * the same money. The rest of the overdue invoices follow (a viewer who
 * reads invoices but not subscriptions still sees a failed renewal, as the
 * invoice it is).
 */
export function mergeToActOn(
    failedRenewals: (ToActOn & { invoiceId: string })[],
    overdueInvoices: (ToActOn & { invoiceId: string })[],
): ToActOn[] {
    const seen = new Set<string>();
    const out: ToActOn[] = [];
    for (const { invoiceId, ...act } of [
        ...failedRenewals,
        ...overdueInvoices,
    ]) {
        if (seen.has(invoiceId)) continue;
        seen.add(invoiceId);
        out.push(act);
    }
    return out.sort(
        (a, b) =>
            a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    );
}
