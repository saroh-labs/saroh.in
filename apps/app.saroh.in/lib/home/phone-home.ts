import { formatClock, formatDay } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";

import { phoneGroupName } from "./group-words";
import { formatList } from "./needs";
import type {
    HomeNeedGroup,
    HomeNeedKind,
    HomeTiles,
    HomeToday,
    HomeUnavailable,
} from "./service";

/**
 * The simplified phone Home (DEC-171, plan U17, boards `HPHome`,
 * `HPStates`), in words: its three figures, its Next line, the order and
 * the cap of its Needs you lines, and the one line that says what couldn't
 * be checked. Pure, so it is tested without a page.
 */

// ---------------------------------------------------------------- figures

export type PhoneFigureKey = "moneyIn" | "bookings" | "toPack" | "came";

export interface PhoneFigure {
    key: PhoneFigureKey;
    /** "in today", "bookings", "to pack", "came": under the figure. */
    label: string;
    /** "₹8,240", "6", "3 of 6"; null draws the dash. */
    value: string | null;
    /** What the dash means, to a screen reader. */
    absent?: "Not known" | "None";
    href: string;
}

const FIGURE_LABEL: Record<PhoneFigureKey, string> = {
    moneyIn: "in today",
    bookings: "bookings",
    toPack: "to pack",
    came: "came",
};

/** Which unavailable part each figure is read from (`home.service.ts`). */
const FIGURE_FAILED_BY: Record<PhoneFigureKey, readonly string[]> = {
    moneyIn: ["Money in today"],
    bookings: ["Today", "Schedule"],
    toPack: ["Open orders"],
    came: ["Today"],
};

/** Where a figure whose read failed opens: its screen, unfiltered. */
const FIGURE_FAILED_HREF: Record<PhoneFigureKey, string> = {
    moneyIn: "/billing/invoices",
    bookings: "/calendar",
    toPack: "/commerce/orders",
    came: "/bookings",
};

function failedPart(
    key: PhoneFigureKey,
    unavailable: readonly HomeUnavailable[],
): boolean {
    return unavailable.some((u) => FIGURE_FAILED_BY[key].includes(u.label));
}

function figure(
    key: PhoneFigureKey,
    tiles: HomeTiles,
    unavailable: readonly HomeUnavailable[],
): PhoneFigure | null {
    const label = FIGURE_LABEL[key];
    switch (key) {
        case "moneyIn": {
            const m = tiles.moneyIn;
            if (!m) break;
            const totals = m.totals.filter((t) => t.amountMinor !== 0);
            return {
                key,
                label,
                value:
                    totals.length > 0
                        ? totals
                              .map((t) =>
                                  formatMoney(t.amountMinor, t.currency),
                              )
                              .join(" + ")
                        : "Nothing",
                href: m.href,
            };
        }
        case "bookings": {
            const b = tiles.bookingsToday;
            if (!b) break;
            return { key, label, value: String(b.count), href: b.href };
        }
        case "toPack": {
            const p = tiles.toPack;
            if (!p) break;
            return { key, label, value: String(p.count), href: p.href };
        }
        case "came": {
            const c = tiles.came;
            if (c) {
                return {
                    key,
                    label,
                    value: `${c.came} of ${c.total}`,
                    href: c.href,
                };
            }
            // Bookings are read and nobody is booked one to one today:
            // no one to mark, said with the dash, as the desk's tile.
            if (tiles.bookingsToday) {
                return {
                    key,
                    label,
                    value: null,
                    absent: "None",
                    href: "/bookings",
                };
            }
            break;
        }
    }
    if (failedPart(key, unavailable)) {
        return {
            key,
            label,
            value: null,
            absent: "Not known",
            href: FIGURE_FAILED_HREF[key],
        };
    }
    return null;
}

/**
 * The phone's figures (A1): Money in today, Bookings and To pack for
 * someone who reads money; Bookings, Came and To pack for anyone else.
 * A figure whose module is off isn't drawn; one whose read failed is a
 * dash, never 0. Money is only ever sent with `payment:read` (DEC-098),
 * so its tile being there (or having failed) is the test.
 */
export function phoneFigures({
    tiles,
    unavailable,
}: {
    tiles: HomeTiles | null;
    unavailable: readonly HomeUnavailable[];
}): PhoneFigure[] {
    if (!tiles) return [];
    const money =
        tiles.moneyIn !== undefined || failedPart("moneyIn", unavailable);
    const keys: PhoneFigureKey[] = money
        ? ["moneyIn", "bookings", "toPack"]
        : ["bookings", "came", "toPack"];
    return keys
        .map((key) => figure(key, tiles, unavailable))
        .filter((f): f is PhoneFigure => f !== null);
}

// ---------------------------------------------------------------- next

export interface PhoneNext {
    /** "Next: 11:30 am Sourdough basics", "Nothing booked today". */
    title: string;
    /** "8 booked · then 4 more today", "Next: Wed 21 Oct, 10:00 am …". */
    sub: string | null;
}

/** "Wed 21 Oct, 10:00 am" for another day; the clock alone for today. */
function nextWhen(date: string, time: string, today: string | null): string {
    const clock = formatClock(time);
    if (today && date === today) return clock;
    const day = formatDay(date, {
        weekday: "short",
        year: "never",
        relative: true,
        ...(today ? { today } : {}),
    });
    return `${day}, ${clock}`;
}

/**
 * The Next line (`HPHome`): what comes next today and how much is after
 * it, or that nothing is booked and when the next booking is. It opens the
 * day sheet. Null when neither bookings nor the day can be read: there is
 * no day to open.
 */
export function phoneNext({
    tiles,
    today,
    now,
}: {
    tiles: HomeTiles | null;
    today: HomeToday | null;
    now: Date;
}): PhoneNext | null {
    const date = today?.date ?? null;
    const b = tiles?.bookingsToday;
    if (b) {
        const next = b.next;
        if (next && date && next.date === date) {
            // Who it is for, as the day's row says it: "8 booked".
            const row = today?.items.find((i) => i.startAt === next.startAt);
            const after =
                b.laterToday > 0
                    ? `then ${b.laterToday} more today`
                    : "nothing after it today";
            return {
                title: `Next: ${formatClock(next.time)} ${next.what}`,
                sub: [row?.who, after].filter(Boolean).join(" · "),
            };
        }
        const later = next
            ? `Next: ${nextWhen(next.date, next.time, date)} ${next.what}`
            : null;
        return {
            title: b.count > 0 ? "Nothing more today" : "Nothing booked today",
            sub: later,
        };
    }
    if (!today) return null;
    // Pick-ups only (no bookings read): the next thing on the day.
    const t = now.getTime();
    const upcoming = today.items.filter((i) => Date.parse(i.startAt) >= t);
    const first = upcoming.at(0);
    const rest = upcoming.slice(1);
    if (!first) {
        return {
            title:
                today.items.length > 0
                    ? "Nothing more today"
                    : "Nothing on today",
            sub: null,
        };
    }
    return {
        title: `Next: ${formatClock(first.time)} ${first.what}`,
        sub:
            [
                first.who,
                rest.length > 0 ? `then ${rest.length} more today` : null,
            ]
                .filter(Boolean)
                .join(" · ") || null,
    };
}

// ---------------------------------------------------------------- needs

/** The order the boards draw the groups in, after late and money (A2). */
export const BOARD_ORDER: readonly HomeNeedKind[] = [
    "ORDERS",
    "BILLS",
    "AWAITING_PAYMENT",
    "ENQUIRIES",
    "PAYMENTS",
    "REVIEWS",
    "STOCK",
    "SETUP",
];

/** Groups that are money: a bill, a booking waiting on payment, a refund. */
const MONEY: ReadonlySet<HomeNeedKind> = new Set<HomeNeedKind>([
    "BILLS",
    "AWAITING_PAYMENT",
    "PAYMENTS",
]);

/** Late in the red sense: orders late, bills overdue. */
function isLate(group: HomeNeedGroup): boolean {
    return (
        group.late > 0 && (group.kind === "ORDERS" || group.kind === "BILLS")
    );
}

/** How many group lines a phone shows before "Show N more" (A2). */
export const PHONE_LINES = 5;

export interface PhoneLines {
    shown: HomeNeedGroup[];
    folded: HomeNeedGroup[];
    /** "Show 2 more · review, low stock", or "" with nothing folded. */
    more: string;
}

/**
 * The phone's Needs you lines (A2): anything late first, then money, then
 * the rest in the board's order; at most five, then "Show N more" naming
 * what is folded.
 */
export function phoneLines(
    groups: readonly HomeNeedGroup[],
    cap: number = PHONE_LINES,
): PhoneLines {
    const rank = (g: HomeNeedGroup) =>
        isLate(g) ? 0 : MONEY.has(g.kind) ? 1 : 2;
    const at = (g: HomeNeedGroup) => {
        const i = BOARD_ORDER.indexOf(g.kind);
        return i === -1 ? BOARD_ORDER.length : i;
    };
    const ordered = [...groups].sort(
        (a, b) => rank(a) - rank(b) || at(a) - at(b),
    );
    const shown = ordered.slice(0, cap);
    const folded = ordered.slice(cap);
    return {
        shown,
        folded,
        more:
            folded.length > 0
                ? `Show ${folded.length} more · ${folded.map(phoneGroupName).join(", ")}`
                : "",
    };
}

/**
 * The one line naming what couldn't be checked (`HPStates`): "Couldn't
 * check overdue invoices just now". One message, however many parts.
 */
export function couldntCheckLine(
    unavailable: readonly HomeUnavailable[],
): string | null {
    if (unavailable.length === 0) return null;
    const things = formatList(
        unavailable.map((u) => {
            const l = u.label;
            // "The last 24 hours" reads as it is; the rest lower-cased.
            return l.charAt(0).toLowerCase() + l.slice(1);
        }),
    );
    return `Couldn't check ${things} just now`;
}

/** The day sheet's title: "Today, Mon 19 Oct". */
export function daySheetTitle(date: string | null): string {
    if (!date) return "Today";
    return `Today, ${formatDay(date, { weekday: "short", year: "never" })}`;
}
