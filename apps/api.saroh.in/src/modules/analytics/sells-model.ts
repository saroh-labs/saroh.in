import type { HomeWeekChange } from "../home/home-need-model";
import type { InsightsPeriod } from "./period";

/**
 * The shapes of Insights' What sells (`sells.ts` has the rules): the rows
 * `sells.sql.ts` reads and what `GET analytics/sells?period=` answers.
 */

/** A Prisma Decimal, or anything that prints as one. */
export interface Decimalish {
    toString(): string;
}

/** One row of `bestSellersSql`: a product in one window. */
export interface SoldRow {
    productId: string;
    name: string;
    window: "PERIOD" | "BEFORE";
    sold: number;
    /** In the business's currency only; null when none was. */
    amount: Decimalish | null;
}

export interface BestSeller {
    productId: string;
    name: string;
    sold: number;
    soldBefore: number;
    /** Null without `payment:read`. */
    amountMinor: number | null;
    beforeMinor: number | null;
    /** Units against the period before. */
    change: HomeWeekChange;
    /** Sold now and none in the period before. */
    isNew: boolean;
}

export interface BestSellers {
    rows: BestSeller[];
    /** Products sold in the period: "See all N". */
    total: number;
}

/** One row of `bookedSql`: a service in one window. */
export interface BookedRow {
    serviceId: string;
    name: string;
    capacity: number;
    window: "PERIOD" | "BEFORE";
    bookings: number;
    people: number;
    sessions: number;
}

export interface BookedService {
    serviceId: string;
    name: string;
    kind: "CLASS" | "ONE_TO_ONE";
    /** Places taken (a class) or bookings (one-to-one). */
    bookings: number;
    bookingsBefore: number;
    /** Different people among them. */
    people: number;
    /** Class sessions held; null for one-to-one. */
    sessions: number | null;
    /** Places offered: sessions × capacity; null for one-to-one. */
    seats: number | null;
    /** Whole percent of places taken; null for one-to-one or no session. */
    fullPercent: number | null;
    change: HomeWeekChange;
}

export interface Booked {
    rows: BookedService[];
    /** Services booked in the period: "See all N". */
    total: number;
    /** Bookings in the period, every service. */
    bookings: number;
    /** False: too few bookings yet to say which is booked most. */
    enough: boolean;
}

/** One row of `busiestSql`. */
export interface BusyRow {
    /** ISO weekday: 1 Monday … 7 Sunday. */
    dow: number;
    hour: number;
    kind: "ORDER" | "BOOKING";
    count: number;
}

export interface BusyCell {
    dow: number;
    /** Index into {@link DAY_PARTS}. */
    part: number;
    orders: number;
    bookings: number;
    total: number;
}

export interface Busiest {
    /** 28 cells, Monday first, each day's parts in order. */
    cells: BusyCell[];
    busiest: BusyCell | null;
    quietest: BusyCell | null;
    /** Sales and visits inside the four parts. */
    total: number;
    /** Sales and visits outside them (before 7, after 8). */
    outside: number;
    enough: boolean;
}

/** One row of `bestCustomersSql`. */
export interface CustomerRow {
    contactId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    company: string | null;
    amount: Decimalish | null;
    orders: number;
    deliveries: number;
    bills: number;
    classes: number;
    bookings: number;
    online: boolean;
    inStore: boolean;
    /** Everyone who paid or came in the period. */
    total: number;
    /** Of them, how many had paid or come before it. */
    cameBack: number;
}

export interface BestCustomer {
    /** Null without `contact:read`. */
    contactId: string | null;
    name: string | null;
    company: string | null;
    /** Null without `payment:read`. */
    amountMinor: number | null;
    orders: number;
    deliveries: number;
    bills: number;
    classes: number;
    bookings: number;
    /** Ordered online, in a storefront, or both ("Shop and online"). */
    online: boolean;
    inStore: boolean;
    /** What they bought or booked most in the period. */
    buysMost: string | null;
}

export interface BestCustomers {
    rows: BestCustomer[];
    /** Everyone who paid or came in the period. */
    total: number;
    /** Had paid or come before the period. */
    cameBack: number;
    /** Paid or came for the first time in it. */
    firstTime: number;
}

/** `GET organizations/:organizationId/analytics/sells?period=`. */
export interface SellsRead {
    period: InsightsPeriod;
    zone: string;
    /** The currency amounts are in; null before the business has one. */
    currency: string | null;
    window: {
        days: number;
        from: string;
        to: string;
        beforeFrom: string;
        beforeTo: string;
    };
    startedOn: string;
    ageDays: number;
    /** Younger than the two periods: nothing earlier to compare with yet. */
    thin: boolean;
    /** Amounts are shown (`payment:read`). */
    money: boolean;
    /** Customers' names are shown (`contact:read`). */
    names: boolean;
    bestSellers: BestSellers;
    booked: Booked;
    busiest: Busiest;
    customers: BestCustomers;
}
