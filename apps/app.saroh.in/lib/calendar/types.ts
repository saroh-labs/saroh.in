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
    /**
     * `payment:read` only (E19): the money this item moved or still asks for
     * on its day, in minor units of `currency`. `failed` is a renewal charge
     * unpaid past its due date, kept apart from `due`.
     */
    in?: number;
    out?: number;
    due?: number;
    failed?: number;
    /** What `out` is made of, when there is any. */
    outWhy?: ("refund" | "fee")[];
}

/** A day's or a month's money in one currency, in minor units (E19). */
export interface MoneyCell {
    currency: string;
    in: number;
    out: number;
    /** In less out. */
    net: number;
    due: number;
    /** Renewal charges unpaid past their due date, apart from `due`. */
    failed: number;
}

/** What one amount of money was (E19, the API's `money.ts`). */
export type MoneyKind =
    | "order_paid"
    | "invoice_paid"
    | "refund"
    | "fee"
    | "invoice_due"
    | "renewal_due"
    | "booking_due"
    | "renewal_failed";

/**
 * One amount of money on one day, in minor units of `currency`, each rupee
 * once (E19). The month's entries add up to its cells, and the day's to its
 * own: the strip, the cells and the export are all built from them (E23).
 */
export interface MoneyEntry {
    date: string;
    kind: MoneyKind;
    /** The layer it belongs to, for a breakdown by kind. */
    layer: LayerKey;
    title: string;
    subtitle: string | null;
    currency: string;
    in: number;
    out: number;
    due: number;
    failed: number;
    link: CalendarLink;
    /** The calendar item it sits on that day, or null when it has none. */
    itemId: string | null;
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
    /** `payment:read` only (E19): the day's in, out, due, per currency. */
    money?: MoneyCell[];
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
    /**
     * `payment:read` only (E19): the month's money per currency and every
     * entry adding up to it. `total` null, and no entries, when a source it
     * adds up could not be read.
     */
    money?: { total: MoneyCell[] | null; entries: MoneyEntry[] };
    /** The team, for someone who reads bookings (E20). */
    staff?: { id: string; name: string; title: string | null }[];
    /**
     * The team's working hours on each day read (E27), whose only for
     * `booking:read`. Absent from an older API, null when unread: the hour
     * grid then shades nothing.
     */
    hours?: WorkingHours[] | null;
}

/** A stretch someone works on one day (E27, the API's `working-hours.ts`). */
export interface WorkingHours {
    /** "YYYY-MM-DD" in the business's zone. */
    date: string;
    /** Minutes from local midnight; the end is exclusive. */
    startMinute: number;
    endMinute: number;
    /** `booking:read` only. */
    staffId?: string;
}
