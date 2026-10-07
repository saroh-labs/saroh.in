import type {
    AutopayChecks,
    AutopayMethod,
    AutopayState,
} from "../autopay/api";
import { siteMoney } from "../lib/money";

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
    /**
     * Messages from the business not yet opened (A13): the Messages tab's
     * dot. Absent from an API that predates it: read as none.
     */
    unreadMessages?: number;
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
    /**
     * A pick-up's place (UX-025): the address and hours to collect it
     * from. Null without one; absent from an older API.
     */
    collectFrom?: { address: string; hours: string | null } | null;
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
    /**
     * The zone the plan's dates are days in: a pause ends at the start of a
     * day there. Absent from an API before A8; dates then read in UTC.
     */
    timezone?: string;
}

/** A plan on the account's Plan tab (A8), and what the member may do to it. */
export interface AccountSubscription extends AccountPlan {
    classes: { perMonth: number; left: number; resetsAt: string } | null;
    /** An overdue invoice the member can pay now; null when there is none to pay online. */
    payNow: { total: string; currency: string; dueAt: string | null } | null;
    canPause: boolean;
    canResume: boolean;
    canCancel: boolean;
    /** How its autopay stands (D12); null or absent: none. */
    autopay?: AutopayState | null;
    /**
     * What turning autopay on pays now (D12): the plan's oldest unpaid
     * invoice, paid in the same window by UPI or card. Null: nothing owed.
     */
    autopayPays?: { total: string; currency: string } | null;
    /**
     * An autopay charge is under way (D13): "Autopay charge in progress ·
     * ‹date›", `at` being when their bank is asked. "Pay now" is hidden
     * meanwhile. Null or absent: none.
     */
    autopayCharging?: { at: string } | null;
    /**
     * When autopay next takes money (D13B, DEC-065): "Next autopay charge:
     * ‹date›" — a charge queued for a later day (said instead of "in
     * progress"), or the next renewal's by the business's timing. Null or
     * absent: none to say.
     */
    autopayNextCharge?: { at: string } | null;
}

export interface AccountPack {
    name: string;
    credits: number;
    left: number;
    expiresAt: string;
    live: boolean;
}

/** The Plan tab (A8): each part read on its own. */
export interface AccountPlanTab {
    subscriptions: Block<AccountSubscription[]>;
    packs: Block<AccountPack[]>;
    /** The weeks a pause may last; empty when the business has pausing off. */
    pauseWeeks: number[];
    /**
     * Every way the business's provider can take autopay (D12); empty or
     * absent: autopay isn't offered.
     */
    autopayMethods?: AutopayMethod[];
    /**
     * The check each method takes to switch autopay on when nothing is
     * owed (DEC-064: UPI and card ₹1, refunded); told before they pick.
     */
    autopayChecks?: AutopayChecks;
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
    /**
     * A GST-registered business's exempt paper (D15): it is named a bill of
     * supply, as the business's own copy is. Absent from an older API.
     */
    billOfSupply?: boolean;
}

export interface AccountNote {
    ref: string;
    text: string;
    sentAt: string;
    state: "SENT" | "ON_RECORD";
}

/** One message in the customer's thread with the business (A13). */
export interface AccountMessage {
    ref: string;
    from: "me" | "business";
    text: string;
    sentAt: string;
}

export interface AccountThread {
    /** Oldest first. */
    messages: AccountMessage[];
    /** Older messages exist beyond these. */
    earlier: boolean;
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
    return (
        siteMoney(Number(amount), currency, "en-IN") ?? `${currency} ${amount}`
    );
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

/** "5 Oct 2026", as the day falls in `timeZone` (UTC when not given). */
export function accountDate(iso: string | null, timeZone = "UTC"): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const format = (zone: string) =>
        new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: zone,
        }).format(d);
    try {
        return format(timeZone);
    } catch {
        return format("UTC");
    }
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
    const day = (iso: string) => accountDate(iso, plan.timezone);
    if (plan.status === "PAUSED") {
        return plan.pausedUntil
            ? `Paused until ${day(plan.pausedUntil)} — nothing is charged till then`
            : "Paused — nothing is charged until you resume";
    }
    if (plan.endsAt) return `Ends ${day(plan.endsAt)}`;
    if (plan.renewsAt) return `Next payment ${day(plan.renewsAt)}`;
    return "Active";
}

/** "5 of 8 classes left this month", or null when the plan has no number. */
export function planClassesLine(sub: AccountSubscription): string | null {
    const c = sub.classes;
    if (!c) return null;
    if (sub.status === "PAUSED")
        return `${c.perMonth} classes a month · paused`;
    return `${c.left} of ${c.perMonth} ${c.perMonth === 1 ? "class" : "classes"} left this month`;
}

/** "3 of 5 left · use by 1 Dec 2026". */
export function packLine(pack: AccountPack): string {
    return `${pack.left} of ${pack.credits} left · use by ${accountDate(pack.expiresAt)}`;
}

/**
 * When a pause of `weeks` chosen today would end: the same day `weeks`
 * weeks on, in the plan's zone, as the API counts it (D8).
 */
export function pauseEndsOn(
    weeks: number,
    timeZone: string | undefined,
    now: Date = new Date(),
): string {
    return accountDate(
        new Date(now.getTime() + weeks * 7 * 86_400_000).toISOString(),
        timeZone,
    );
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

/**
 * Under a message: who it is from and when — "You · 10:05", "Kavi Dental ·
 * Yesterday", "Kavi Dental · 3 Oct" — in the visitor's own time. `now` is
 * passed in so the words don't change between the server and the browser.
 */
export function messageMeta(
    message: AccountMessage,
    businessName: string,
    now: Date,
    timeZone?: string,
): string {
    const who = message.from === "me" ? "You" : businessName;
    const at = new Date(message.sentAt);
    if (Number.isNaN(at.getTime())) return who;
    const day = (d: Date) =>
        new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone,
        }).format(d);
    const today = day(now);
    const yesterday = day(new Date(now.getTime() - 86_400_000));
    let when: string;
    if (day(at) === today) {
        when = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone,
        }).format(at);
    } else if (day(at) === yesterday) {
        when = "Yesterday";
    } else {
        when = new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            ...(at.getFullYear() !== now.getFullYear()
                ? { year: "numeric" as const }
                : {}),
            timeZone,
        }).format(at);
    }
    return `${who} · ${when}`;
}
