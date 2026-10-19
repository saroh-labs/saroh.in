import type { HomeNeed, HomeWeekChange } from "./home-need-model";

/**
 * The shapes Home A ("Today first", DEC-171) reads beside today's fields:
 * the tiles, Needs you grouped by kind, and How it's going (the last 7 days
 * against the 7 before). Kept apart from `home-model.ts` so that file stays
 * readable; `home-model.ts` re-exports them.
 *
 * Money follows DEC-098: every amount here is sent only to someone who holds
 * `payment:read`; without it the counts still come and the amounts are null
 * or absent. The words are the client's (U4), as they are for the rest of
 * Home: these are numbers, dates and links.
 */

/** An amount in one currency, in minor units. */
export interface HomeMoneyTotal {
    currency: string;
    amountMinor: number;
}

/** What comes next on the day, for "Next at 11:30, Sourdough basics". */
export interface HomeTileNext {
    /** ISO instant it starts. */
    startAt: string;
    /** The business's date it falls on, `2026-10-21`. */
    date: string;
    /** "11:30", in the business's zone. */
    time: string;
    /** "Sourdough basics", "Cleaning · Farah Khan". */
    what: string;
}

/** Bookings today: how many, and the next one (today's, else the next day's). */
export interface HomeTileBookings {
    /** One-to-one bookings and classes starting today. */
    count: number;
    /**
     * The next booking or class from now: today's when one is left, else
     * the first one after today ("Nothing booked today · Next: Wed 10:00").
     */
    next: HomeTileNext | null;
    /** Today's bookings and classes after `next`: "then 4 more today". */
    laterToday: number;
    href: string;
}

/** To pack or hand over: open orders that need attention soon (DEC-163). */
export interface HomeTileToPack {
    /** Late, or due by tomorrow: Needs you's orders group. */
    count: number;
    /** Of them, due today and not late yet. */
    dueToday: number;
    /** Of them, late now. */
    late: number;
    /** Open orders due later: "and 1 order on its way". */
    inProgress: number;
    href: string;
}

/** Money in today in one currency, against the same weekday last week. */
export interface HomeMoneyToday {
    currency: string;
    /** Paid today so far, less refunds, in minor units. */
    amountMinor: number;
    /** The same weekday last week, to the same time of day. */
    lastWeekMinor: number;
    change: HomeWeekChange;
}

/** Money in today (`payment:read` only). */
export interface HomeTileMoneyIn {
    /** One per currency taken today; empty when nothing came in. */
    totals: HomeMoneyToday[];
    /** How many payments came in today, every currency. */
    payments: number;
    href: string;
}

/** Came: "3 of 6", and who is next. One-to-one bookings only. */
export interface HomeTileCame {
    /** Marked Came today. */
    came: number;
    /** Today's bookings that have started by now. */
    due: number;
    /** Today's one-to-one bookings. */
    total: number;
    /** The next booking nobody has marked yet: "Kavya is next, at 12:00". */
    next: { time: string; person: string | null; startAt: string } | null;
    href: string;
}

/**
 * Home's tiles (desktop) and figures (phone, A1). Each is present only when
 * its module is on, the viewer reads it, and its read worked; absent, never
 * zero, otherwise. The phone picks three of these.
 */
export interface HomeTiles {
    bookingsToday?: HomeTileBookings;
    toPack?: HomeTileToPack;
    moneyIn?: HomeTileMoneyIn;
    came?: HomeTileCame;
}

/**
 * The kinds Needs you is grouped by, in the board's order (A2): pack or hand
 * over, unpaid bills, bookings awaiting payment, enquiries, payments failed
 * and refunds, reviews, stock, and the rest (setting up and fixing).
 */
export const HOME_NEED_KINDS = [
    "ORDERS",
    "BILLS",
    "AWAITING_PAYMENT",
    "ENQUIRIES",
    "PAYMENTS",
    "REVIEWS",
    "STOCK",
    "SETUP",
] as const;

export type HomeNeedKind = (typeof HOME_NEED_KINDS)[number];

/** The group's oldest thing: "Oldest placed 23 Sep · Aditya Shetty, ₹1,020". */
export interface HomeNeedOldest {
    id: string;
    /** The thing: an order's number, an invoice's number, a product. */
    title: string;
    /** Who it concerns, when known. */
    who: string | null;
    /** The instant it is measured from: placed, due, asked. */
    at: string | null;
    amountMinor: number | null;
    currency: string | null;
}

/**
 * One group of Needs you (DEC-171): one kind of thing to do, how many, how
 * many are late, the money it stands for, its oldest, and its first rows
 * with their inline actions. The header total is the sum of every group's
 * `count`, so the header, the group and its link never disagree.
 */
export interface HomeNeedGroup {
    kind: HomeNeedKind;
    /** How many things it holds; "N more" rows count what they stand for. */
    count: number;
    /** Of them, late (or blocking): "3 late", "10 overdue". */
    late: number;
    /**
     * The money the group stands for, per currency: the unpaid bills'
     * total, the bookings' price. Null for a group that isn't money, and
     * for a viewer without `payment:read`.
     */
    totals: HomeMoneyTotal[] | null;
    oldest: HomeNeedOldest | null;
    /** Its first rows, in order, each with its `href` and `inline`. */
    rows: HomeNeed[];
    /** `count` past the rows sent: "3 more orders". */
    more: number;
    /**
     * Bills only: every unpaid bill, overdue or not ("₹32,970 unpaid on 16
     * bills", "6 not due yet"), when the owed read worked.
     */
    all?: number;
    /** The list it opens: Orders, the overdue bills, Bookings, … */
    href: string;
    /** The sources in it, e.g. `COMMERCE_OPEN_ORDERS`. */
    codes: string[];
}

/** One age of what is owed: how many bills, and their total. */
export interface HomeOwedBucket {
    count: number;
    /** Null without `payment:read`. */
    totals: HomeMoneyTotal[] | null;
    href: string;
}

/** Owed to the business now, and by how late (DEC-171). */
export interface HomeGoingOwed {
    /** Every unpaid bill's total; null without `payment:read`. */
    totals: HomeMoneyTotal[] | null;
    bills: number;
    overdue: number;
    byAge: {
        /** Not due yet, or with no due date. */
        notDue: HomeOwedBucket;
        /** 1 to 30 days past due. */
        late1to30: HomeOwedBucket;
        /** More than 30 days past due. */
        lateOver30: HomeOwedBucket;
    };
    href: string;
}

/** Sales in one currency, the last 7 days against the 7 before. */
export interface HomeGoingSales {
    currency: string;
    amountMinor: number;
    beforeMinor: number;
    change: HomeWeekChange;
    href: string;
}

/**
 * How it's going (DEC-171): the last 7 days against the 7 days before, by
 * the business's calendar — never a week that just started against a whole
 * one. Each figure only for whoever holds its read (as This week's), the
 * amounts only with `payment:read`.
 */
export interface HomeGoing {
    zone: string;
    /** The first and last day of the last 7 days, today included. */
    from: string;
    to: string;
    /** The 7 days before them. */
    beforeFrom: string;
    beforeTo: string;
    /** One per currency that moved in either window. */
    sales?: HomeGoingSales[];
    bookings?: { count: number; before: number; href: string };
    orders?: { count: number; before: number; href: string };
    owed?: HomeGoingOwed;
}

/**
 * "Cheques not in the bank" (DEC-173): the invoices rebuild fills it from
 * `home/home-cheques.ts` (invoices plan U4; Home plan U18 draws it). Until
 * then it is always null. Amounts in minor units, as every Home total.
 */
export interface HomeChequesWaiting {
    count: number;
    totals: HomeMoneyTotal[];
    /** `/billing/invoices?view=cheques`. */
    href: string;
}
