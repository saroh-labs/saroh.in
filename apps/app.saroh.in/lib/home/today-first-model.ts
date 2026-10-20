import type { HomeNeed, HomeWeekChange } from "./need-model";

/**
 * The shapes Home A ("Today first", DEC-171) reads beside Home's older
 * fields: the tiles, Needs you grouped by kind, and How it's going (the
 * last 7 days against the 7 before). They mirror the API's
 * `home-today-first-model.ts`; `service.ts` re-exports them.
 *
 * Money follows DEC-098: every amount is sent only to someone who holds
 * `payment:read`; without it the counts still come and the amounts are
 * null or absent. Type-only, so safe in server and client components.
 */

/** An amount in one currency, in minor units. */
export interface HomeMoneyTotal {
    currency: string;
    amountMinor: number;
}

/** What comes next on the day (Home A's tiles): "Next at 11:30 am". */
export interface HomeTileNext {
    startAt: string;
    /** The business's date it falls on, `2026-10-21`. */
    date: string;
    /** "11:30", in the business's zone. */
    time: string;
    what: string;
}

/** Bookings today: how many, and the next (today's, else the next day's). */
export interface HomeTileBookings {
    count: number;
    next: HomeTileNext | null;
    /** Today's bookings and classes after `next`. */
    laterToday: number;
    href: string;
}

/** To pack or hand over: open orders that need attention soon (DEC-163). */
export interface HomeTileToPack {
    count: number;
    dueToday: number;
    late: number;
    /** Open orders due later: "and 1 order on its way". */
    inProgress: number;
    href: string;
}

/** Money in today in one currency, against the same weekday last week. */
export interface HomeMoneyToday {
    currency: string;
    amountMinor: number;
    lastWeekMinor: number;
    change: HomeWeekChange;
}

/** Money in today (`payment:read` only). */
export interface HomeTileMoneyIn {
    /** One per currency taken today; empty when nothing came in. */
    totals: HomeMoneyToday[];
    payments: number;
    href: string;
}

/** Came: "3 of 6", and who is next. One-to-one bookings only. */
export interface HomeTileCame {
    came: number;
    /** Today's bookings that have started by now. */
    due: number;
    total: number;
    next: { time: string; person: string | null; startAt: string } | null;
    href: string;
}

/**
 * Home A's tiles (DEC-171). Each is present only when its module is on,
 * the viewer reads it and its read worked: absent, never zero, otherwise.
 */
export interface HomeTiles {
    bookingsToday?: HomeTileBookings;
    toPack?: HomeTileToPack;
    moneyIn?: HomeTileMoneyIn;
    came?: HomeTileCame;
}

/** The kinds Needs you is grouped by, in the board's order (A2). */
export type HomeNeedKind =
    | "ORDERS"
    | "BILLS"
    | "AWAITING_PAYMENT"
    | "ENQUIRIES"
    | "PAYMENTS"
    | "REVIEWS"
    | "STOCK"
    | "SETUP";

/** A group's oldest thing: "Oldest placed 23 Sep · Aditya Shetty, ₹1,020". */
export interface HomeNeedOldest {
    id: string;
    title: string;
    who: string | null;
    at: string | null;
    amountMinor: number | null;
    currency: string | null;
}

/**
 * One group of Needs you (DEC-171): one kind of thing to do, how many,
 * how many are late, the money it stands for, its oldest and its first
 * rows. The header's total is the sum of every group's `count`.
 */
export interface HomeNeedGroup {
    kind: HomeNeedKind;
    count: number;
    late: number;
    /** Null for a group that isn't money, and without `payment:read`. */
    totals: HomeMoneyTotal[] | null;
    oldest: HomeNeedOldest | null;
    rows: HomeNeed[];
    /** `count` past the rows sent. */
    more: number;
    /** Bills only: every unpaid bill, overdue or not. */
    all?: number;
    /**
     * Bills only, for someone who may send a reminder: Remind all's bills
     * (the 100 oldest overdue) and the quiet days it asks for (DEC-171,
     * U8). Absent, the group offers no Remind all.
     */
    remind?: { invoiceIds: string[]; quietDays: number };
    href: string;
    codes: string[];
}

/** One age of what is owed. */
export interface HomeOwedBucket {
    count: number;
    totals: HomeMoneyTotal[] | null;
    href: string;
}

/** Owed to the business now, and by how late (DEC-171). */
export interface HomeGoingOwed {
    /** Null without `payment:read`. */
    totals: HomeMoneyTotal[] | null;
    bills: number;
    overdue: number;
    byAge: {
        notDue: HomeOwedBucket;
        late1to30: HomeOwedBucket;
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
 * How it's going (DEC-171): the last 7 days against the 7 days before.
 * Each figure only for whoever holds its read; see `lib/home/week.ts`.
 */
export interface HomeGoing {
    zone: string;
    from: string;
    to: string;
    beforeFrom: string;
    beforeTo: string;
    sales?: HomeGoingSales[];
    bookings?: { count: number; before: number; href: string };
    orders?: { count: number; before: number; href: string };
    owed?: HomeGoingOwed;
}

/**
 * "Cheques not in the bank" (DEC-173, Home plan U18): cheques received and
 * waiting to clear, how many and what they add up to per currency. Sent
 * on `week.chequesWaiting`, only to someone who holds `payment:read`, and
 * null while none waits. Home shows it; marking a cheque in the bank or
 * bounced stays on the invoice.
 */
export interface HomeChequesWaiting {
    count: number;
    totals: HomeMoneyTotal[];
    /** `/billing/invoices?view=cheques`. */
    href: string;
}
