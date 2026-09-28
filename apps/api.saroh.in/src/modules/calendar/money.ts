import type {
    CalendarLink,
    DatedItem,
    ItemOwes,
    LayerKey,
    MoneyCell,
} from "./month";

/**
 * The calendar's money: in, out and due (plan 005 E19, R13, default 47).
 *
 * Money is a list of entries, each dated the day it moved — or, for Due and
 * failed charges, the day of the item that asks for it — and each counted
 * once:
 *
 * - **In** is money taken: an order's paper paid (its invoice, and an
 *   edit's supplementary invoice), and every paid invoice that is not an
 *   order's own (a booking's, a renewal's, a hand-made one). An order's
 *   invoice is its order's money, never also an invoice's (DEC-023).
 * - **Out** is money handed back — each credit note on the day it was
 *   issued — plus the fee each provider reported on a payment, on the day
 *   it was captured. A payment with no reported fee has none (default 47).
 * - **Due** is money still asked for: issued invoices not yet paid,
 *   renewals still to come, and what a booking leaves to pay at the visit
 *   (default 50). A renewal charge unpaid past its due date is **failed**,
 *   totalled apart.
 *
 * An entry sits on the calendar item it belongs to that day, when there is
 * one (an order paid the day it was placed sits on the order). Money that
 * moved on a day its record has no item — an order paid, or refunded, days
 * after it was placed — is still the day's money: the entries hold it, so
 * the day's cells, the month's and an export of the entries all agree.
 */

export type MoneyKind =
    "order_paid" | "invoice_paid" | "refund" | "fee" | ItemOwes["kind"];

/** One amount of money on one day, in minor units of `currency`. */
export interface MoneyEntry {
    date: string;
    kind: MoneyKind;
    /** The layer it belongs to, for a breakdown by kind. */
    layer: LayerKey;
    title: string;
    subtitle: string | null;
    currency: string;
    in: number;
    out: number;
    due: number;
    failed: number;
    link: CalendarLink;
    /** The calendar item it sits on that day, or null when it has none. */
    itemId: string | null;
}

/**
 * Money read from payments and paper, before it is placed on an item. The
 * links are what it may sit on, best first: a booking's paid invoice sits
 * on its invoice, else on its booking that day.
 */
export interface MoneySource {
    date: string;
    kind: "order_paid" | "invoice_paid" | "refund" | "fee";
    layer: LayerKey;
    title: string;
    subtitle: string | null;
    currency: string;
    /** Positive: `in` for a payment, `out` for a refund or a fee. */
    cents: number;
    links: CalendarLink[];
}

const sameLink = (a: CalendarLink, b: CalendarLink) =>
    a.type === b.type && a.id === b.id;

/**
 * Place every source and every item's own Due on the items, and list them
 * all as entries. Items are changed in place: each one with money gains its
 * `in`/`out`/`due`/`failed` (and `currency`, `outWhy`).
 */
export function placeMoney(
    items: DatedItem[],
    sources: MoneySource[],
): MoneyEntry[] {
    const byDay = new Map<string, DatedItem[]>();
    for (const dated of items) {
        byDay.set(dated.date, [...(byDay.get(dated.date) ?? []), dated]);
    }
    const entries: MoneyEntry[] = [];

    for (const dated of items) {
        const owes = dated.owes;
        if (!owes || owes.cents <= 0) continue;
        const failed = owes.kind === "renewal_failed";
        entries.push(
            add(dated, {
                date: dated.date,
                kind: owes.kind,
                layer: dated.layer,
                title: dated.item.title,
                subtitle: dated.item.subtitle,
                currency: owes.currency,
                in: 0,
                out: 0,
                due: failed ? 0 : owes.cents,
                failed: failed ? owes.cents : 0,
                link: dated.item.link,
                itemId: dated.item.id,
            }),
        );
    }

    for (const source of sources) {
        if (source.cents === 0) continue;
        const into =
            source.kind === "order_paid" || source.kind === "invoice_paid";
        const home = findHome(byDay.get(source.date) ?? [], source);
        entries.push(
            add(home, {
                date: source.date,
                kind: source.kind,
                layer: source.layer,
                title: source.title,
                subtitle: source.subtitle,
                currency: source.currency,
                in: into ? source.cents : 0,
                out: into ? 0 : source.cents,
                due: 0,
                failed: 0,
                link: source.links[0],
                itemId: home?.item.id ?? null,
            }),
        );
    }
    return entries.sort(
        (a, b) =>
            a.date.localeCompare(b.date) ||
            a.kind.localeCompare(b.kind) ||
            a.title.localeCompare(b.title),
    );
}

/**
 * The item a source sits on that day: one linked to its first link, then
 * its next; within a link, one on the source's own layer first. An item in
 * another currency is never its home.
 */
function findHome(
    day: DatedItem[],
    source: MoneySource,
): DatedItem | undefined {
    const fits = (d: DatedItem) =>
        d.item.currency === undefined || d.item.currency === source.currency;
    for (const link of source.links) {
        const linked = day.filter(
            (d) => sameLink(d.item.link, link) && fits(d),
        );
        if (linked.length === 0) continue;
        return linked.find((d) => d.layer === source.layer) ?? linked[0];
    }
    return undefined;
}

/** Add an entry's money to its item, if it has one; returns the entry. */
function add(dated: DatedItem | undefined, entry: MoneyEntry): MoneyEntry {
    if (!dated) return entry;
    const item = dated.item;
    item.currency ??= entry.currency;
    item.in = (item.in ?? 0) + entry.in;
    item.out = (item.out ?? 0) + entry.out;
    item.due = (item.due ?? 0) + entry.due;
    item.failed = (item.failed ?? 0) + entry.failed;
    if (entry.out > 0) {
        const why = entry.kind === "fee" ? "fee" : "refund";
        const whys = new Set([...(item.outWhy ?? []), why]);
        item.outWhy = (["refund", "fee"] as const).filter((w) => whys.has(w));
    }
    return entry;
}

/** Sum entries per currency, in minor units; currencies in order. */
export function moneyCells(entries: MoneyEntry[]): MoneyCell[] {
    const by = new Map<string, MoneyCell>();
    for (const e of entries) {
        const cell = by.get(e.currency) ?? {
            currency: e.currency,
            in: 0,
            out: 0,
            net: 0,
            due: 0,
            failed: 0,
        };
        cell.in += e.in;
        cell.out += e.out;
        cell.net = cell.in - cell.out;
        cell.due += e.due;
        cell.failed += e.failed;
        by.set(e.currency, cell);
    }
    return [...by.values()].sort((a, b) =>
        a.currency.localeCompare(b.currency),
    );
}

/** Each day's cells, for the days given; entries on other days are left out. */
export function moneyByDay(
    days: string[],
    entries: MoneyEntry[],
): Map<string, MoneyCell[]> {
    const wanted = new Set(days);
    const per = new Map<string, MoneyEntry[]>();
    for (const e of entries) {
        if (!wanted.has(e.date)) continue;
        per.set(e.date, [...(per.get(e.date) ?? []), e]);
    }
    return new Map([...per].map(([date, list]) => [date, moneyCells(list)]));
}
