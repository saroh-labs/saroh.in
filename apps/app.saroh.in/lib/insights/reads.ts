import type { CompareChange } from "./compare-words";
import type { InsightsPeriod, PeriodWindow } from "./period";

/**
 * Insights' reads as the API sends them (DEC-171), types only, so the pure
 * words and the screens can import them anywhere:
 *
 * - `GET organizations/:id/analytics/money?period=` (#1079,
 *   `apps/api.saroh.in/src/modules/analytics/money.ts`), `payment:read`;
 * - `GET organizations/:id/analytics/sells?period=` (#1080,
 *   `sells-model.ts`), counts with `analytics:read`, amounts only with
 *   `payment:read`, names only with `contact:read`.
 *
 * Only the fields a screen reads are listed; the API sends more. Amounts
 * are minor units (paise).
 */

/**
 * One weekly bar: a rolling run of days ending on today's weekday, wholly
 * inside the period, the one before, or earlier, so the period's bars add
 * up to its money in (`moneyBuckets`, #1093).
 */
export interface MoneyWeekRead {
    /** Its first day, `2026-10-13`. */
    start: string;
    /** Its last day, `2026-10-19`. */
    end: string;
    takingsMinor: number;
    orders: number;
    payments: number;
    /** PERIOD (drawn dark), BEFORE (light) or neither (faint). */
    in: "PERIOD" | "BEFORE" | null;
    /** 7; a 3-month window's oldest bar holds the days left over. */
    days?: number;
}

/** Where money came from: a location, the website's checkout, or invoices. */
export type MoneyPlaceKind = "LOCATION" | "ONLINE" | "INVOICES";

/** A place money came from in the period, with its change. */
export interface MoneyPlaceRead {
    /** `location:<storeId>`, `online` or `invoices`. */
    key: string;
    kind: MoneyPlaceKind;
    /** The location's name; null for online and invoices. */
    name: string | null;
    amountMinor: number;
    beforeMinor: number;
    change: CompareChange;
}

/** Money in one currency. */
export interface MoneyTotalRead {
    currency: string;
    amountMinor: number;
}

/** One age of what is owed. */
export interface OwedBucketRead {
    count: number;
    /** Per currency; null without `payment:read`. */
    totals: MoneyTotalRead[] | null;
    /** The bills list it opens. */
    href: string;
}

export type OwedAge = "notDue" | "late1to30" | "lateOver30";

/** Who owes the business now, by how late (DEC-171). */
export interface OwedRead {
    totals: MoneyTotalRead[] | null;
    bills: number;
    overdue: number;
    byAge: Record<OwedAge, OwedBucketRead>;
    href: string;
}

export interface MoneyDayRead {
    date: string;
    amountMinor: number;
    payments: number;
}

export interface MoneyRead {
    period: InsightsPeriod;
    zone: string;
    currency: string | null;
    otherCurrencies: string[];
    window: PeriodWindow;
    startedOn: string;
    ageDays: number;
    /** Younger than the two periods: nothing earlier to compare with yet. */
    thin: boolean;
    /** False: the business has never taken money (`IBNoSalesD`). */
    hasSales: boolean;
    firstSaleOn: string | null;
    moneyIn: {
        amountMinor: number;
        beforeMinor: number;
        change: CompareChange;
        payments: number;
        paymentsBefore: number;
        orders: number;
        ordersBefore: number;
        bills: number;
        billsBefore: number;
    };
    /** What an order usually comes to; absent from an older API. */
    usualOrder?: {
        amountMinor: number | null;
        beforeMinor: number | null;
        orders: number;
        ordersBefore: number;
    };
    bestWeek: { start: string; end: string; takingsMinor: number } | null;
    /** The weekly bars, oldest first (twelve; about 26 for 3 months). */
    weeks: MoneyWeekRead[];
    /** Each day of the period, oldest first; absent from an older API. */
    days?: MoneyDayRead[];
    /** Where the period's money came from, largest first. */
    places?: MoneyPlaceRead[];
    /** Who owes by how late; null without `invoice:read` or never billed. */
    owed?: OwedRead | null;
}

export interface BestSellerRead {
    productId: string;
    name: string;
    sold: number;
    soldBefore: number;
    /** Null without `payment:read`. */
    amountMinor: number | null;
    /** Units against the period before; THIN in the first weeks. */
    change?: CompareChange;
    isNew: boolean;
}

export interface BookedServiceRead {
    serviceId: string;
    name: string;
    kind: "CLASS" | "ONE_TO_ONE";
    /** Places taken (a class) or bookings (one-to-one). */
    bookings: number;
    /** Different people among them. */
    people: number;
    sessions: number | null;
    /** Whole percent of places taken; null for one-to-one or no session. */
    fullPercent: number | null;
}

/** One part of one weekday (`busiest.cells`). */
export interface BusyCellRead {
    /** ISO weekday: 1 Monday … 7 Sunday. */
    dow: number;
    /** 0: 7 to 10, 1: 10 to 1, 2: 1 to 4, 3: 4 to 8. */
    part: number;
    orders: number;
    bookings: number;
    total: number;
}

/** When it is busiest: paid orders and attended bookings by day and time. */
export interface BusiestRead {
    /** 28 cells, Monday first, each day's parts in order. */
    cells: BusyCellRead[];
    busiest: BusyCellRead | null;
    quietest: BusyCellRead | null;
    /** Sales and visits inside the four parts. */
    total: number;
    /** Sales and visits outside them (before 7, after 8). */
    outside: number;
    /** False before two weeks of history or too few to say. */
    enough: boolean;
}

export interface BestCustomerRead {
    /** Null without `contact:read`. */
    contactId: string | null;
    name: string | null;
    company: string | null;
    /** Null without `payment:read`. */
    amountMinor: number | null;
    orders: number;
    /** Of the orders, how many were delivered. */
    deliveries: number;
    bills: number;
    classes: number;
    bookings: number;
    online: boolean;
    inStore: boolean;
    /** What they bought or booked most in the period. */
    buysMost: string | null;
}

/** The best customers: by money with `payment:read`, else by how often. */
export interface BestCustomersRead {
    rows: BestCustomerRead[];
    /** Everyone who paid or came in the period. */
    total: number;
    /** Had paid or come before the period. */
    cameBack: number;
    /** Paid or came for the first time in it. */
    firstTime: number;
}

export interface SellsRead {
    period: InsightsPeriod;
    zone: string;
    currency: string | null;
    window: PeriodWindow;
    ageDays: number;
    thin: boolean;
    /** Amounts are shown (`payment:read`). */
    money: boolean;
    /** Customers' names are shown (`contact:read`); absent from an older API. */
    names?: boolean;
    bestSellers: { rows: BestSellerRead[]; total: number };
    booked: {
        rows: BookedServiceRead[];
        total: number;
        bookings: number;
        /** False: too few bookings yet to say which is booked most. */
        enough: boolean;
    };
    /** Absent from an older API. */
    busiest?: BusiestRead;
    /** Absent from an older API. */
    customers?: BestCustomersRead;
}

/**
 * `GET organizations/:id/analytics/suggestions?period=` (#1087,
 * `apps/api.saroh.in/src/modules/analytics/suggestions.ts`): facts only,
 * ranked; the card (`suggestion-words.ts`) says them. Money rules only for
 * `payment:read` (`money`).
 */
export interface FirstSaleSuggestion {
    key: "first-sale";
    rule: "FIRST_SALE";
    dismissible: false;
    action: { kind: "COPY_SHOP_LINK" };
}

export interface ClassFullSuggestion {
    key: string;
    rule: "CLASS_FULL";
    dismissible: true;
    service: { id: string; name: string };
    days: number;
    sessions: number;
    seats: number;
    booked: number;
    fullPercent: number;
    action: { kind: "ADD_CLASS_TIME"; href: string };
}

export interface LateBillSuggestion {
    key: string;
    rule: "LATE_BILL";
    dismissible: true;
    invoice: { id: string; number: string | null };
    billedTo: string | null;
    leftToPayMinor: number;
    currency: string;
    dueOn: string;
    daysLate: number;
    action:
        | { kind: "REMIND"; invoiceId: string; href: string }
        | { kind: "OPEN_BILL"; href: string };
}

export interface SellingLessSuggestion {
    key: string;
    rule: "SELLING_LESS";
    dismissible: true;
    product: { id: string; name: string };
    sold: number;
    soldBefore: number;
    fewerPercent: number;
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
    /** False without `payment:read`: the money rules were not looked at. */
    money: boolean;
    hasSales: boolean;
    suggestions: Suggestion[];
}

/** Where a visit came from: one of five groups (U15, #1099). */
export type VisitSource =
    "instagram" | "google" | "whatsapp" | "direct" | "other";

/** Visited, looked, started and paid: each at most the one before. */
export interface VisitPathRead {
    visits: number;
    looked: number;
    started: number;
    paid: number;
}

/** One source's visits and how many of them paid. */
export interface SourceRowRead {
    source: VisitSource;
    visits: number;
    paid: number;
}

/** One of the merchant's own links (`?ref=`). */
export interface RefRowRead {
    ref: string;
    visits: number;
    paid: number;
}

/**
 * `GET organizations/:id/analytics/sources?period=&siteId=` (#1101,
 * `apps/api.saroh.in/src/modules/analytics/sources.ts`), `analytics:read`:
 * the path from visit to paid and where visits came from. Counts only.
 * Paid is the business's even when a website is chosen.
 */
export interface SourcesRead {
    period: InsightsPeriod;
    window: { days: number; from: string; to: string };
    siteId: string | null;
    /** The first day a source was counted; null: nothing counted yet. */
    countedFrom: string | null;
    /** Counting began after the period's first day. */
    countedPart: boolean;
    path: VisitPathRead;
    /** Most visits first, Other sites last; small sources folded in it. */
    sources: SourceRowRead[];
    /** Sources with too few visits, counted in Other sites. */
    folded: VisitSource[];
    refs: RefRowRead[];
    moreRefs: number;
}
