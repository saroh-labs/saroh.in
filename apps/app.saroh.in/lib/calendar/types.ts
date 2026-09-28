/**
 * The Business Calendar's month as the API sends it (U4,
 * `apps/api.saroh.in/src/modules/calendar/month.ts`). Types only, so client
 * components and tests can import them.
 */

export type LayerKey =
    | "orders"
    | "collections"
    | "subscriptions"
    | "invoices"
    | "bookings"
    | "classes"
    /** Paid invoices, for a business with no orders (E20: the clinic). */
    | "payments";

export type LinkType =
    "order" | "subscription" | "invoice" | "booking" | "service";

export interface CalendarLink {
    type: LinkType;
    id: string;
}

/** Kept per currency; amounts in different currencies are never added. */
export interface MoneyTotal {
    currency: string;
    /** Major units, as a decimal string. */
    amount: string;
}

export interface CalendarItem {
    id: string;
    /** What happened within its layer — `renewal`, `overdue`, `paid`, `full`… */
    kind: string;
    title: string;
    subtitle: string | null;
    /** The instant; null for a date-only item (a collection). */
    at: string | null;
    /** Money only — absent for a viewer who may not read it. */
    amount?: string;
    currency?: string;
    link: CalendarLink;
    /** Bookings and classes (E20): who it is with; null when nobody. */
    staffId?: string | null;
    /** Bookings and classes (E20): how long it takes. */
    durationMinutes?: number;
    /** What is wrong with it or became of it (E20). */
    flags?: ("late" | "no_show" | "cancelled" | "failed")[];
}

/** A closure or someone's time off, over the days read (E20). */
export interface DayOff {
    kind: "closure" | "time_off";
    startAt: string;
    /** Exclusive. */
    endAt: string;
    allDay: boolean;
    /** The days read it touches, "YYYY-MM-DD" in the business's zone. */
    dates: string[];
    /** Time off, for someone who reads bookings: whose. */
    staffId?: string;
    name?: string;
    reason?: string | null;
}

export interface LayerDay {
    /** The true count; `items` stops at 50. */
    count: number;
    kinds: Record<string, number>;
    items: CalendarItem[];
}

export interface CalendarDay {
    /** "YYYY-MM-DD" in the business's zone. */
    date: string;
    layers: Partial<Record<LayerKey, LayerDay>>;
    toActOn: number;
    /** Money only. */
    takings?: MoneyTotal[];
}

export interface CalendarUnavailable {
    source: LayerKey | "takings" | "money" | "days_off";
    label: string;
}

export interface CalendarMonth {
    month: string;
    timezone: string;
    timezoneSource: "business" | "service" | "fallback";
    from: string;
    to: string;
    /** The layers this viewer gets, in the API's order. */
    layers: LayerKey[];
    /** The month's count per layer; null when the layer could not be read. */
    totals: Partial<Record<LayerKey, number | null>>;
    days: CalendarDay[];
    toActOn: {
        kind: "renewal_failed" | "invoice_overdue";
        date: string;
        title: string;
        subtitle: string | null;
        amount?: string;
        currency?: string;
        link: CalendarLink;
    }[];
    /** Money roles only; `total` null when a source it adds up failed. */
    takings?: { lead: LayerKey | null; total: MoneyTotal[] | null };
    unavailable: CalendarUnavailable[];
    /**
     * The day the business joined Saroh, in its zone ("YYYY-MM-DD") — the
     * calendar's back edge (E21). Absent from an older API, null when it
     * could not be read: no back edge then.
     */
    joinedAt?: string | null;
    /** Closures and time off (E20); null when they could not be read. */
    daysOff?: DayOff[] | null;
    /** Whether the business has a team (E20); null when unread. */
    hasStaff?: boolean | null;
    /** The team, for someone who reads bookings (E20). */
    staff?: { id: string; name: string; title: string | null }[];
}
