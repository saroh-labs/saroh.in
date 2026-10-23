import { personName } from "../home/home-model";
import { leftToPayCents } from "../invoices/invoice-state";
import type { InsightsPeriod } from "./period";
import { daysBetween } from "./period";
import type { BookedRow, SoldRow } from "./sells";
import { soldByProduct } from "./sells";
import { todayIn } from "./takings";

/**
 * Insights' suggestions (DEC-171, #1087, `GET analytics/suggestions`): what
 * to try next, one at a time on the overview, from exactly three rules.
 * Pure: the rules over what `suggestions.service.ts` reads. No words: the
 * card (U11) says them from these facts, as the rest of Insights does.
 *
 * - **A class nearly always full** (`CLASS_FULL`): a class (capacity above
 *   one) whose places were 90% taken or more over its last 4 weeks, across
 *   at least 4 sessions. Places and sessions are What sells' own
 *   (`bookedSql`): a session is a class time anyone booked, and a place is
 *   a confirmed booking. "Add a class time".
 * - **A bill more than 3 weeks late** (`LATE_BILL`): an unpaid bill (owed
 *   by age's bills, `OWED_VIEW_WHERE`) with something left to pay
 *   (`leftToPayCents`, DEC-173) whose due date is more than 21 days ago by
 *   the business's calendar. "Send reminder", or open the bill.
 * - **Something selling less** (`SELLING_LESS`): a product whose units in
 *   the period are down by a third or more on the period before, having
 *   sold at least 10 then (What sells' `bestSellersSql`). Never for a
 *   business younger than the two periods (`thin`). "Open the product".
 *
 * The money rules (late bill, selling less) are only for `payment:read`
 * (A12; the late bill also needs `invoice:read`, as owed does). A business
 * with no sale yet gets the first-sale suggestion first (`FIRST_SALE`,
 * "Copy shop link"), which cannot be put off.
 *
 * Ranked in the board's order (class, bill, selling less), each rule's
 * strongest first and at most {@link PER_RULE} of each, so twenty late
 * bills never bury the other two rules. One key per subject
 * (`class-full:<serviceId>`, `late-bill:<invoiceId>`,
 * `selling-less:<productId>`): Not now hides that key for that person for
 * {@link NOT_NOW_DAYS} days, and a hidden one makes room for the next.
 */

/** "Not now" hides a suggestion for this many days; it is back on day 8. */
export const NOT_NOW_DAYS = 7;

/** A class is nearly always full at this share of its places, or more. */
export const CLASS_FULL_PERCENT = 90;
/** ... across at least this many sessions ... */
export const CLASS_FULL_MIN_SESSIONS = 4;
/** ... over its last 4 weeks, whatever the page's period. */
export const CLASS_FULL_PERIOD: InsightsPeriod = "4w";

/** A bill is late enough to suggest at more than this many days past due. */
export const LATE_BILL_DAYS = 21;

/** Selling less: at least this many sold in the period before ... */
export const SELLING_LESS_MIN_BEFORE = 10;
/** ... and down by this share (a third) or more. */
export const SELLING_LESS_DROP = 1 / 3;

/** At most this many suggestions from one rule. */
export const PER_RULE = 3;

export const SUGGESTION_RULES = [
    "FIRST_SALE",
    "CLASS_FULL",
    "LATE_BILL",
    "SELLING_LESS",
] as const;
export type SuggestionRule = (typeof SUGGESTION_RULES)[number];

/** The rules a person can put off, and their keys' prefixes. */
const KEY_PREFIX = {
    CLASS_FULL: "class-full",
    LATE_BILL: "late-bill",
    SELLING_LESS: "selling-less",
} as const;

/**
 * A key Not now takes: a rule's prefix and its subject's id. Ids are
 * cuids; anything else is refused before it reaches the table.
 */
export const SUGGESTION_KEY_PATTERN =
    /^(class-full|late-bill|selling-less):[A-Za-z0-9_-]{1,64}$/;

export function suggestionKey(
    rule: keyof typeof KEY_PREFIX,
    subjectId: string,
): string {
    return `${KEY_PREFIX[rule]}:${subjectId}`;
}

export function isSuggestionKey(value: unknown): value is string {
    return typeof value === "string" && SUGGESTION_KEY_PATTERN.test(value);
}

export interface FirstSaleSuggestion {
    key: "first-sale";
    rule: "FIRST_SALE";
    /** Never put off: it goes once the first sale is paid. */
    dismissible: false;
    /** The app copies the live shop (or site) link from its web address. */
    action: { kind: "COPY_SHOP_LINK" };
}

export interface ClassFullSuggestion {
    key: string;
    rule: "CLASS_FULL";
    dismissible: true;
    service: { id: string; name: string };
    /** The 4 weeks looked at. */
    days: number;
    sessions: number;
    /** Places offered: sessions × capacity. */
    seats: number;
    /** Places taken. */
    booked: number;
    /** Whole percent taken, rounded down: never "90%" for 89.6. */
    fullPercent: number;
    action: { kind: "ADD_CLASS_TIME"; href: string };
}

export interface LateBillSuggestion {
    key: string;
    rule: "LATE_BILL";
    dismissible: true;
    invoice: { id: string; number: string | null };
    /** The bill-to name, else the contact's name; null when neither. */
    billedTo: string | null;
    /** What is left to pay, in minor units (DEC-173). */
    leftToPayMinor: number;
    currency: string;
    /** The due date, by the business's calendar. */
    dueOn: string;
    /** Whole days past due, by the business's calendar: more than 21. */
    daysLate: number;
    /** REMIND with `invoice:write`; otherwise the bill opens. */
    action:
        | { kind: "REMIND"; invoiceId: string; href: string }
        | { kind: "OPEN_BILL"; href: string };
}

export interface SellingLessSuggestion {
    key: string;
    rule: "SELLING_LESS";
    dismissible: true;
    product: { id: string; name: string };
    /** Units in the period, and in the period before. */
    sold: number;
    soldBefore: number;
    /** How many fewer, as a whole percent of before: 33 or more. */
    fewerPercent: number;
    /** Its place among best sellers in the period before (1 = best). */
    rankBefore: number;
    action: { kind: "OPEN_PRODUCT"; href: string };
}

export type Suggestion =
    | FirstSaleSuggestion
    | ClassFullSuggestion
    | LateBillSuggestion
    | SellingLessSuggestion;

export interface SuggestionsRead {
    period: InsightsPeriod;
    zone: string;
    /** The period selling less compares: `from`–`to` against the one before. */
    window: {
        days: number;
        from: string;
        to: string;
        beforeFrom: string;
        beforeTo: string;
    };
    /** False without `payment:read`: the money rules were not looked at. */
    money: boolean;
    hasSales: boolean;
    /** Ranked; the card shows "1 of N" over these. */
    suggestions: Suggestion[];
}

/** First sale: only while nothing has ever been paid. */
export function firstSale(hasSales: boolean): FirstSaleSuggestion[] {
    return hasSales
        ? []
        : [
              {
                  key: "first-sale",
                  rule: "FIRST_SALE",
                  dismissible: false,
                  action: { kind: "COPY_SHOP_LINK" },
              },
          ];
}

/**
 * Classes nearly always full, fullest first (then most sessions, then by
 * name). `rows` are `bookedSql` over the last 4 weeks alone; `archived`
 * services are left out.
 */
export function classesFull(
    rows: readonly BookedRow[],
    opts: { days: number; archived: ReadonlySet<string> },
): ClassFullSuggestion[] {
    const out: ClassFullSuggestion[] = [];
    for (const row of rows) {
        if (row.window !== "PERIOD") continue;
        if (row.capacity <= 1 || opts.archived.has(row.serviceId)) continue;
        const sessions = Number(row.sessions);
        const booked = Number(row.bookings);
        if (sessions < CLASS_FULL_MIN_SESSIONS) continue;
        const seats = sessions * row.capacity;
        // In whole numbers, so 89.99% is never rounded up into the rule.
        if (booked * 100 < seats * CLASS_FULL_PERCENT) continue;
        out.push({
            key: suggestionKey("CLASS_FULL", row.serviceId),
            rule: "CLASS_FULL",
            dismissible: true,
            service: { id: row.serviceId, name: row.name },
            days: opts.days,
            sessions,
            seats,
            booked,
            fullPercent: Math.min(100, Math.floor((booked * 100) / seats)),
            action: {
                kind: "ADD_CLASS_TIME",
                href: `/services/${row.serviceId}`,
            },
        });
    }
    return out.sort(
        (a, b) =>
            b.fullPercent - a.fullPercent ||
            b.sessions - a.sessions ||
            a.service.name.localeCompare(b.service.name) ||
            a.service.id.localeCompare(b.service.id),
    );
}

/** One unpaid bill, as the service reads it. */
export interface UnpaidBill {
    id: string;
    number: string | null;
    currency: string;
    dueAt: Date | null;
    total: { toString(): string };
    paidCents: number;
    billToName: string | null;
    contact: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null;
}

/**
 * Bills more than {@link LATE_BILL_DAYS} days late with something left to
 * pay, the latest first (then the most owed). Days are counted on the
 * business's calendar: a bill due on 28 Sep is 21 days late on 19 Oct.
 */
export function lateBills(
    bills: readonly UnpaidBill[],
    clock: { now: Date; zone: string },
    canRemind: boolean,
): LateBillSuggestion[] {
    const today = todayIn(clock.now, clock.zone);
    const out: LateBillSuggestion[] = [];
    for (const bill of bills) {
        if (bill.dueAt === null || bill.dueAt >= clock.now) continue;
        const left = leftToPayCents(bill);
        if (left <= 0) continue;
        const dueOn = todayIn(bill.dueAt, clock.zone);
        const daysLate = daysBetween(dueOn, today);
        if (daysLate <= LATE_BILL_DAYS) continue;
        const href = `/billing/invoices/${bill.id}`;
        out.push({
            key: suggestionKey("LATE_BILL", bill.id),
            rule: "LATE_BILL",
            dismissible: true,
            invoice: { id: bill.id, number: bill.number },
            billedTo: billedTo(bill),
            leftToPayMinor: left,
            currency: bill.currency,
            dueOn,
            daysLate,
            action: canRemind
                ? { kind: "REMIND", invoiceId: bill.id, href }
                : { kind: "OPEN_BILL", href },
        });
    }
    return out.sort(
        (a, b) =>
            b.daysLate - a.daysLate ||
            b.leftToPayMinor - a.leftToPayMinor ||
            a.invoice.id.localeCompare(b.invoice.id),
    );
}

function billedTo(bill: UnpaidBill): string | null {
    const name = bill.billToName?.trim();
    if (name) return name;
    return bill.contact ? personName(bill.contact) : null;
}

/**
 * Products selling less: down by a third or more on the period before,
 * having sold at least {@link SELLING_LESS_MIN_BEFORE} then. The biggest
 * fall first (then the most sold before). Nothing for a `thin` business,
 * whose period before is not whole; `archived` products are left out.
 */
export function sellingLess(
    rows: readonly SoldRow[],
    opts: { thin: boolean; archived: ReadonlySet<string> },
): SellingLessSuggestion[] {
    if (opts.thin) return [];
    const pairs = [...soldByProduct(rows)].map(([productId, p]) => ({
        productId,
        name: p.name,
        sold: Math.max(0, Number(p.now?.sold ?? 0)),
        soldBefore: Math.max(0, Number(p.was?.sold ?? 0)),
    }));
    const rankBefore = new Map(
        pairs
            .filter((p) => p.soldBefore > 0)
            .sort(
                (a, b) =>
                    b.soldBefore - a.soldBefore ||
                    a.name.localeCompare(b.name) ||
                    a.productId.localeCompare(b.productId),
            )
            .map((p, i) => [p.productId, i + 1]),
    );
    const out: SellingLessSuggestion[] = [];
    for (const p of pairs) {
        if (opts.archived.has(p.productId)) continue;
        if (p.soldBefore < SELLING_LESS_MIN_BEFORE) continue;
        // sold ≤ before × (1 − ⅓), in whole numbers.
        if (p.sold * 3 > p.soldBefore * 2) continue;
        out.push({
            key: suggestionKey("SELLING_LESS", p.productId),
            rule: "SELLING_LESS",
            dismissible: true,
            product: { id: p.productId, name: p.name },
            sold: p.sold,
            soldBefore: p.soldBefore,
            fewerPercent: Math.floor(
                ((p.soldBefore - p.sold) * 100) / p.soldBefore,
            ),
            rankBefore: rankBefore.get(p.productId) ?? 0,
            action: {
                kind: "OPEN_PRODUCT",
                href: `/commerce/products/${p.productId}`,
            },
        });
    }
    return out.sort(
        (a, b) =>
            b.fewerPercent - a.fewerPercent ||
            b.soldBefore - a.soldBefore ||
            a.product.name.localeCompare(b.product.name) ||
            a.product.id.localeCompare(b.product.id),
    );
}

/**
 * One list, in the board's order: first sale, classes, bills, selling
 * less. A key `hidden` (put off and not back yet) is left out before each
 * rule keeps its first {@link PER_RULE}, so hiding one shows the next.
 */
export function rankSuggestions(
    parts: {
        firstSale: readonly FirstSaleSuggestion[];
        classFull: readonly ClassFullSuggestion[];
        lateBill: readonly LateBillSuggestion[];
        sellingLess: readonly SellingLessSuggestion[];
    },
    hidden: ReadonlySet<string>,
): Suggestion[] {
    const keep = <T extends Suggestion>(list: readonly T[]): T[] =>
        list.filter((s) => !hidden.has(s.key)).slice(0, PER_RULE);
    return [
        ...parts.firstSale,
        ...keep(parts.classFull),
        ...keep(parts.lateBill),
        ...keep(parts.sellingLess),
    ];
}

/** When Not now said at `now` ends: 7 whole days on. */
export function notNowUntil(now: Date): Date {
    return new Date(now.getTime() + NOT_NOW_DAYS * 24 * 60 * 60 * 1000);
}
