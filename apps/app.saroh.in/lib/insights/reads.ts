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

export interface MoneyWeekRead {
    /** Monday, `2026-09-14`. */
    start: string;
    /** Sunday. */
    end: string;
    takingsMinor: number;
    orders: number;
    payments: number;
    /** PERIOD (drawn dark), BEFORE (light) or neither (faint). */
    in: "PERIOD" | "BEFORE" | null;
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
    bestWeek: { start: string; end: string; takingsMinor: number } | null;
    /** Twelve whole weeks, oldest first. */
    weeks: MoneyWeekRead[];
    /** Each day of the period, oldest first; absent from an older API. */
    days?: MoneyDayRead[];
}

export interface BestSellerRead {
    productId: string;
    name: string;
    sold: number;
    soldBefore: number;
    /** Null without `payment:read`. */
    amountMinor: number | null;
    isNew: boolean;
}

export interface BookedServiceRead {
    serviceId: string;
    name: string;
    kind: "CLASS" | "ONE_TO_ONE";
    bookings: number;
    people: number;
    sessions: number | null;
    /** Whole percent of places taken; null for one-to-one or no session. */
    fullPercent: number | null;
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
    bestSellers: { rows: BestSellerRead[]; total: number };
    booked: {
        rows: BookedServiceRead[];
        total: number;
        bookings: number;
        /** False: too few bookings yet to say which is booked most. */
        enough: boolean;
    };
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
