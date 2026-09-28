import { localDateKey } from "@/lib/format/datetime";
import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { customerHref, invoiceHref } from "@/lib/invoices/links";

import type { MoneyTotal } from "./pack-cards";
import { money } from "./pack-cards";
import { day, totals } from "./pack-detail";
import type {
    PackActor,
    PackDetail,
    PackEventsPage,
    PackSale,
} from "./pack-detail-data";
import { paidByLabel } from "./sell-words";

/**
 * Pack Detail's Sales in words (round-2 E17, after "Saroh Pack Detail"):
 * sales and takings by month, the price history, and each sale with how it
 * was paid and who sold it. Pure. `pack:read` covers every amount here
 * (DEC-039); a receipt link needs `invoice:read` as well.
 *
 * How it was paid is a record of what the desk took, never a statement of
 * how a customer may pay (DEC-059).
 */

/** The months the Sales card draws, this one last. */
export const SALES_MONTHS = 6;

export interface MonthRow {
    key: string;
    /** "Apr". */
    label: string;
    /** "2 sold", or "—". */
    n: string;
    /** "₹3,000", or "" for none. */
    amt: string;
    /** 0–100, the bar against the biggest month. */
    pct: number;
}

function monthLabel(year: number, month: number): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        month: "short",
        timeZone: "UTC",
    })
        .format(new Date(Date.UTC(year, month - 1, 15)))
        .replace("Sept", "Sep");
}

function sumByCurrency(sales: readonly PackSale[]): MoneyTotal[] {
    const by = new Map<string, number>();
    for (const s of sales) {
        by.set(s.currency, (by.get(s.currency) ?? 0) + Number(s.price));
    }
    return Array.from(by, ([currency, amount]) => ({
        currency,
        amount: amount.toFixed(2),
    }));
}

/**
 * The last six months of sales, oldest first, in the business's zone. The
 * bar follows the pack's own currency; a sale in another shows in words.
 */
export function salesByMonth(
    sales: readonly PackSale[],
    currency: string,
    now: Date,
    timeZone: string,
): { months: MonthRow[]; note: string } {
    const [y, m] = localDateKey(now, timeZone).split("-").map(Number);
    const keys = Array.from({ length: SALES_MONTHS }, (_, i) => {
        const back = SALES_MONTHS - 1 - i;
        const at = new Date(Date.UTC(y, m - 1 - back, 15));
        const year = at.getUTCFullYear();
        const month = at.getUTCMonth() + 1;
        return {
            key: `${year}-${String(month).padStart(2, "0")}`,
            label: monthLabel(year, month),
        };
    });
    const monthOf = (s: PackSale) =>
        localDateKey(s.soldAt, timeZone).slice(0, 7);
    const groups = keys.map((k) => ({
        ...k,
        sales: sales.filter((s) => monthOf(s) === k.key),
    }));
    const own = (xs: readonly PackSale[]) =>
        xs
            .filter((s) => s.currency === currency)
            .reduce((n, s) => n + Number(s.price), 0);
    const most = Math.max(1, ...groups.map((g) => own(g.sales)));
    const months = groups.map((g) => ({
        key: g.key,
        label: g.label,
        n: g.sales.length > 0 ? `${g.sales.length} sold` : "—",
        amt: g.sales.length > 0 ? totals(sumByCurrency(g.sales)) : "",
        pct: Math.round((100 * own(g.sales)) / most),
    }));
    const inRange = groups.flatMap((g) => g.sales);
    const note =
        sales.length === 0
            ? "No sales yet."
            : inRange.length === 0
              ? "None in the last six months."
              : `${totals(sumByCurrency(inRange))} in the last six months`;
    return { months, note };
}

// — Price history ——————————————————————————————————————————————————————

export interface PriceEntry {
    /** "₹1,500 now", or an older "₹1,200". */
    t: string;
    /** "Since 3 Sep · 4 bought at this price". */
    sub: string;
}

export interface PriceHistory {
    entries: PriceEntry[];
    /** Said under the list when some of the history isn't here. */
    note: string | null;
    /** The one line "Everything about it" shows. */
    about: string;
}

interface PriceChange {
    at: string;
    before: string;
    after: string;
}

/** Price changes in the events read, newest first. */
function priceChanges(events: PackEventsPage): PriceChange[] {
    return events.events.flatMap((e) => {
        if (e.kind !== "CHANGED") return [];
        const pair = e.details.price;
        if (!Array.isArray(pair) || pair.length !== 2) return [];
        const [before, after] = pair as unknown[];
        // A draft's first price is setting it, not changing it.
        if (typeof before !== "string" || typeof after !== "string") return [];
        return [{ at: e.createdAt, before, after }];
    });
}

/**
 * What the pack has cost over time, from its CHANGED events: the price now
 * and each earlier one, with how many were bought at it. People keep the
 * price they paid. A pack older than its history, or one whose history is
 * longer than the page read, says so rather than claiming it never changed.
 */
export function priceHistory(
    pack: Pick<PackDetail, "price" | "currency">,
    events: PackEventsPage,
    sales: readonly PackSale[] | null,
    timeZone: string,
): PriceHistory {
    const changes = priceChanges(events);
    const partial = events.earlierUnrecorded || events.nextCursor !== null;
    const boughtAt = (price: string) =>
        sales === null
            ? null
            : sales.filter(
                  (s) =>
                      s.currency === pack.currency &&
                      Number(s.price) === Number(price),
              ).length;
    const M = (p: string) => money(p, pack.currency);
    const latest = changes.at(0);
    const nowCount = boughtAt(pack.price);
    const current: PriceEntry = {
        t: `${M(pack.price)} now`,
        sub: [
            latest
                ? `Since ${day(latest.at, timeZone)}`
                : partial
                  ? "No change recorded"
                  : "Since it was created",
            nowCount === null ? null : `${nowCount} bought at this price`,
        ]
            .filter(Boolean)
            .join(" · "),
    };
    const past = changes.map((c) => {
        const n = boughtAt(c.before);
        return {
            t: M(c.before),
            sub: [
                `Until ${day(c.at, timeZone)}`,
                n === null ? null : `${n} bought at it — they keep it`,
            ]
                .filter(Boolean)
                .join(" · "),
        };
    });
    const note = events.earlierUnrecorded
        ? "Earlier changes weren't recorded."
        : events.nextCursor !== null
          ? "Older changes are further back in Activity."
          : null;
    const about =
        changes.length > 0
            ? changes
                  .slice()
                  .reverse()
                  .map((c) => `${M(c.before)} until ${day(c.at, timeZone)}`)
                  .join(" · ")
            : partial
              ? "No change recorded"
              : "Unchanged since it was created";
    return { entries: [current, ...past], note, about };
}

// — Each sale ——————————————————————————————————————————————————————————

/** Who a change or sale is by, in a list: a name, or who it was. */
export function actorName(a: PackActor | null): string | null {
    if (!a) return null;
    if (a.kind === "CUSTOMER") return "The customer, online";
    return a.name ?? "A teammate";
}

export interface SaleRow {
    purchaseId: string;
    /** "12 Oct". */
    when: string;
    name: string;
    href: string;
    /** "₹1,500". */
    amount: string;
    /** Bought at an earlier price than today's. */
    older: boolean;
    /** "UPI", "None"; "Not recorded" for a sale from before it was kept. */
    method: string;
    /** "Sold by Priya"; null when nobody is recorded. */
    soldBy: string | null;
    /** Its receipt, for someone who may open invoices; null otherwise. */
    receiptHref: string | null;
}

export function saleRow(
    s: PackSale,
    pack: Pick<PackDetail, "price" | "currency">,
    opts: { timeZone: string; invoices: boolean },
): SaleRow {
    const by = s.soldBy;
    return {
        purchaseId: s.purchaseId,
        when: day(s.soldAt, opts.timeZone),
        name: s.contact.name,
        href: customerHref(s.contact.id),
        amount: money(s.price, s.currency),
        older:
            Number(s.price) !== Number(pack.price) ||
            s.currency !== pack.currency,
        method: s.paidBy ? paidByLabel(s.paidBy) : "Not recorded",
        soldBy: !by
            ? null
            : by.kind === "CUSTOMER"
              ? "Bought on the booking page"
              : `Sold by ${actorName(by) ?? "a teammate"}`,
        receiptHref:
            opts.invoices && s.invoiceId ? invoiceHref(s.invoiceId) : null,
    };
}
