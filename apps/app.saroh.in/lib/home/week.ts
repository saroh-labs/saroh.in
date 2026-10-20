import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import {
    ABOUT_SAME_PERCENT,
    countChangeLine,
    daysLabel,
    moneyChangeLine,
    moneyFell,
} from "@/lib/insights/compare-words";

import type { HomeGoing, HomeGoingOwed, HomeMoneyTotal } from "./service";

/**
 * Home's "How it's going" (DEC-171, Home plan U6), in words, as the Home A
 * boards write them: "Sales · ₹48,250 · Up 12% on the 7 days before".
 * It replaced "This week", which set a week that had just started against
 * a whole one, so every Monday read "0 bookings · 19 fewer than last week".
 *
 * The API decides the figures and the change, the last 7 days against the
 * 7 before (`home-going.ts`), and sends each only to someone who may read
 * it; the words are U4's (`lib/insights/compare-words.ts`). Pure, so it is
 * tested without a page.
 */

/** How a card's line reads: good news, bad news, or neither. */
export type GoingTone = "up" | "bad" | "plain";

export interface GoingCard {
    key: string;
    label: string;
    value: string;
    sub: string;
    tone: GoingTone;
    href: string;
}

/**
 * "The last 7 days, 13 to 19 Oct, compared with the 7 days before": which
 * days the figures are, said once above them.
 */
export function goingIntro(going: Pick<HomeGoing, "from" | "to">): string {
    const days = daysLabel(going.from, going.to);
    return days
        ? `The last 7 days, ${days}, compared with the 7 days before`
        : "The last 7 days, compared with the 7 days before";
}

function moneyWords(totals: readonly HomeMoneyTotal[]): string {
    return totals
        .map((t) => formatMoney(t.amountMinor, t.currency))
        .join(" + ");
}

/** "16 bills · 10 overdue", "1 bill", or "All bills paid". */
export function owedLine(
    owed: Pick<HomeGoingOwed, "bills" | "overdue">,
): string {
    if (owed.bills === 0) return "All bills paid";
    const bills = count(owed.bills, "bill", "bills");
    return owed.overdue > 0 ? `${bills} · ${owed.overdue} overdue` : bills;
}

/** The owed card's figure: the money, or the bills without it, or "Nothing". */
function owedValue(owed: HomeGoingOwed): string {
    if (owed.bills === 0) return "Nothing";
    const totals = (owed.totals ?? []).filter((t) => t.amountMinor > 0);
    return totals.length > 0
        ? moneyWords(totals)
        : count(owed.bills, "bill", "bills");
}

/**
 * The cards in the boards' order: sales, bookings, orders, owed. Sales are
 * one card per currency that moved; a role without `payment:read` gets no
 * sales and an owed card in bills, never an amount (DEC-098).
 */
export function goingCards(going: HomeGoing | null): GoingCard[] {
    if (!going) return [];
    const cards: GoingCard[] = [];
    for (const s of going.sales ?? []) {
        // A currency that moved only in the 7 days before still says so.
        const m = {
            nowMinor: s.amountMinor,
            beforeMinor: s.beforeMinor,
            currency: s.currency,
            change: s.change,
        };
        const fell = moneyFell(m);
        const rose =
            s.amountMinor > 0 &&
            s.beforeMinor > 0 &&
            s.change.kind === "UP" &&
            s.change.percent > ABOUT_SAME_PERCENT;
        cards.push({
            key: `sales:${s.currency}`,
            label: "Sales",
            value:
                s.amountMinor > 0
                    ? formatMoney(s.amountMinor, s.currency)
                    : "Nothing",
            sub: moneyChangeLine(m),
            tone: fell ? "bad" : rose ? "up" : "plain",
            href: s.href,
        });
    }
    if (going.bookings) {
        const { count: n, before } = going.bookings;
        cards.push({
            key: "bookings",
            label: "Bookings",
            value: n > 0 ? String(n) : "None",
            sub: countChangeLine(n, before),
            tone: before > 0 && n > before ? "up" : "plain",
            href: going.bookings.href,
        });
    }
    if (going.orders) {
        const { count: n, before } = going.orders;
        cards.push({
            key: "orders",
            label: "Orders",
            value: n > 0 ? String(n) : "None",
            sub: countChangeLine(n, before),
            tone: before > 0 && n > before ? "up" : "plain",
            href: going.orders.href,
        });
    }
    if (going.owed) {
        const { owed } = going;
        cards.push({
            key: "owed",
            label: "Owed to you",
            value: owedValue(owed),
            sub: owedLine(owed),
            tone: owed.overdue > 0 ? "bad" : "plain",
            href: owed.href,
        });
    }
    return cards;
}

/**
 * Whether Home draws How it's going: never for a business with nothing
 * sold, booked or paid yet (it has "Finish setup" instead), nor when there
 * is no card to show.
 */
export function showsGoing(going: HomeGoing | null, fresh: boolean): boolean {
    return !fresh && goingCards(going).length > 0;
}

/** Where "See how the month went" goes: Insights on its 4 weeks (A10). */
export const MONTH_HREF = "/analytics?period=4w";
