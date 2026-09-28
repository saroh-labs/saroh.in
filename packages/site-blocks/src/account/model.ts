/**
 * The customer account area's data, as the site's server hands it to the
 * pages (ADR-011; round-2 plan A, A5). The same shapes the API's allow-list
 * (`site-accounts/customer-view.ts`) sends; the site's server checks every
 * answer against them before a page sees it (`saroh.app/lib/account-shape`).
 * Plain data and pure words only: nothing here calls anything.
 */

export type AccountTabKey =
    "home" | "bookings" | "orders" | "plan" | "messages" | "me";

export interface AccountTab {
    key: AccountTabKey;
    label: string;
}

export interface AccountView {
    name: string | null;
    email: string;
    phone: string | null;
    businessName: string;
    tabs: AccountTab[];
    offers: { appointments: boolean; orders: boolean; plans: boolean };
    bookingsLabel: "Bookings" | "Appointments";
    healthNotes: boolean;
}

/** A read that failed says so; it never reads as "none". */
export type Block<T> = { ok: true; value: T } | { ok: false };

export interface AccountBooking {
    ref: string;
    service: string;
    startAt: string;
    endAt: string;
    timezone: string;
    staff: string | null;
    online: boolean | null;
}

export interface AccountOrder {
    ref: string;
    number: string;
    placedAt: string;
    total: string;
    currency: string;
    open: boolean;
    status: string;
    /** How it leaves: "Pick-up", "Shipping"… (A7). */
    fulfilment: string;
    items: { name: string; quantity: number }[];
    moreItems: number;
}

/** One visit of a treatment bought as an order (A7). */
export interface AccountOrderVisit {
    number: number;
    startAt: string | null;
    timezone: string | null;
    state: "done" | "booked" | "missed" | "to-book";
}

export interface AccountOrderLine {
    name: string;
    quantity: number;
    kind: "product" | "service";
    visits: AccountOrderVisit[] | null;
}

/** A step of an order's Track, as the API words it (A7). */
export interface AccountTrackStep {
    label: string;
    state: "done" | "now" | "next";
    line: string;
    /** The first step carries when the order was placed. */
    at: string | null;
}

/** One order and its Track (A7). */
export interface AccountOrderDetail {
    ref: string;
    number: string;
    placedAt: string;
    total: string;
    currency: string;
    fulfilment: string;
    state: "open" | "done" | "refunded" | "cancelled";
    status: string;
    lines: AccountOrderLine[];
    steps: AccountTrackStep[];
    courier: {
        name: string | null;
        trackingNumber: string | null;
        trackingUrl: string | null;
    } | null;
    refund: string | null;
    receipt: string | null;
}

export interface AccountPlan {
    ref: string;
    name: string;
    price: string;
    currency: string;
    interval: string;
    status: "ACTIVE" | "PAUSED";
    renewsAt: string | null;
    pausedUntil: string | null;
    endsAt: string | null;
}

export interface AccountClasses {
    membership: {
        plan: string;
        perMonth: number;
        left: number;
        resetsAt: string;
        paused: boolean;
    } | null;
    packs: { name: string; credits: number; left: number; expiresAt: string }[];
}

export interface AccountHome {
    nextBooking: Block<AccountBooking | null> | null;
    classes: Block<AccountClasses | null>;
    orders: Block<AccountOrder[]> | null;
    plan: Block<AccountPlan | null>;
}

export interface AccountReceipt {
    ref: string;
    number: string;
    issuedAt: string | null;
    paidAt: string | null;
    total: string;
    currency: string;
}

export interface AccountNote {
    ref: string;
    text: string;
    sentAt: string;
    state: "SENT" | "ON_RECORD";
}

// ---- Words ------------------------------------------------------------------

/** "Farah" from "Farah Khan"; null without a name. */
export function firstName(name: string | null): string | null {
    const first = name?.trim().split(/\s+/)[0];
    return first === undefined || first === "" ? null : first;
}

/** "FK" for the header's avatar; the email's first letter without a name. */
export function initials(name: string | null, email: string): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    const letters = words
        .slice(0, 2)
        .map((w) => w.charAt(0))
        .join("");
    return (letters || email.charAt(0) || "?").toUpperCase();
}

/** "₹450" — whole rupees drop the paise; anything else keeps them. */
export function accountMoney(amount: string, currency: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return `${currency} ${amount}`;
    const whole = Number.isInteger(value);
    try {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency,
            minimumFractionDigits: whole ? 0 : 2,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency} ${amount}`;
    }
}

/** "Mon 5 Oct, 10:00", in the zone the booking was made in. */
export function bookingWhen(iso: string, timeZone: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    try {
        const day = new Intl.DateTimeFormat("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone,
        }).format(d);
        const time = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone,
        }).format(d);
        return `${day}, ${time}`;
    } catch {
        return d.toISOString().slice(0, 16).replace("T", " ");
    }
}

/** "5 Oct 2026". */
export function accountDate(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(d);
}

const EVERY: Record<string, string> = {
    WEEK: "week",
    MONTH: "month",
    QUARTER: "quarter",
    YEAR: "year",
};

/** "₹2,500 / month". */
export function planPrice(plan: AccountPlan): string {
    const every = EVERY[plan.interval] ?? plan.interval.toLowerCase();
    return `${accountMoney(plan.price, plan.currency)} / ${every}`;
}

/** The line under a plan: when it renews, pauses or ends. */
export function planLine(plan: AccountPlan): string {
    if (plan.status === "PAUSED") {
        return plan.pausedUntil
            ? `Paused until ${accountDate(plan.pausedUntil)} — nothing is charged till then`
            : "Paused — nothing is charged until you resume";
    }
    if (plan.endsAt) return `Ends ${accountDate(plan.endsAt)}`;
    if (plan.renewsAt) return `Next payment ${accountDate(plan.renewsAt)}`;
    return "Active";
}

/** "Unlimited: 6 left this month · 10 classes: 4 left, use by 1 Dec 2026". */
export function classesLine(classes: AccountClasses): string {
    const parts: string[] = [];
    const m = classes.membership;
    if (m) {
        parts.push(
            m.paused
                ? `${m.plan}: paused`
                : `${m.plan}: ${m.left} left this month`,
        );
    }
    for (const p of classes.packs) {
        parts.push(
            `${p.name}: ${p.left} left, use by ${accountDate(p.expiresAt)}`,
        );
    }
    return parts.join(" · ");
}

/** "20 Sep 2026 · ₹450", and how it leaves while it's on its way. */
export function orderLine(order: AccountOrder): string {
    const parts = [
        accountDate(order.placedAt),
        accountMoney(order.total, order.currency),
    ];
    if (order.open && order.fulfilment) parts.push(order.fulfilment);
    return parts.filter(Boolean).join(" · ");
}

/** The mark in front of a step: ✓ done, ● now, ○ next (the design's). */
export function stepMark(state: AccountTrackStep["state"]): string {
    return state === "done" ? "✓" : state === "now" ? "●" : "○";
}

const VISIT_STATE: Record<AccountOrderVisit["state"], string> = {
    done: "Done",
    booked: "Booked",
    missed: "Missed",
    "to-book": "To book",
};

/** "Visit 2 · Mon 5 Oct, 10:00" and its word. */
export function visitLine(visit: AccountOrderVisit): {
    title: string;
    state: string;
} {
    const when =
        visit.startAt && visit.timezone
            ? ` · ${bookingWhen(visit.startAt, visit.timezone)}`
            : "";
    return {
        title: `Visit ${visit.number}${when}`,
        state: VISIT_STATE[visit.state],
    };
}

/** "#1019 · 2 × Sourdough, 1 × Rye and 2 more". */
export function orderTitle(order: AccountOrder): string {
    const lines = order.items
        .map((i) => `${i.quantity} × ${i.name}`)
        .join(", ");
    const more = order.moreItems > 0 ? ` and ${order.moreItems} more` : "";
    return `#${order.number}${lines ? ` · ${lines}${more}` : ""}`;
}
