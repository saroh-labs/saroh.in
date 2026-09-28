import { DateTime } from "luxon";

import { toMoneyString } from "../../common/money";
import { lineName } from "../orders/order-line";
import type { AccountTab } from "./account-tabs";

/**
 * What a signed-in customer may see of their own record (ADR-011 "What the
 * customer sees is an allow-list"; round-2 plan A, A5). The only way
 * customer data leaves the account routes: every answer is built here from
 * named fields, never by spreading a row.
 *
 * Never in any of these: staff notes, a Needs attention entry the team
 * wrote (or its wording), another person on the same booking, the booker
 * fields a staff member typed, payment references, and internal ids beyond
 * a row's own opaque `ref`. `customer-view.spec.ts` feeds every serializer a
 * row carrying those and checks none comes out.
 */

/** A read that failed says so; it never reads as "none" (A5). */
export type Block<T> = { ok: true; value: T } | { ok: false };

export interface AccountView {
    /** The contact's name, or null until the customer gives one. */
    name: string | null;
    /** The verified sign-in email: the account's, never a placeholder. */
    email: string;
    /** A contact detail, not a way to sign in (default 75). */
    phone: string | null;
    businessName: string;
    tabs: AccountTab[];
    /** What the business offers, for which Home cards to draw. */
    offers: { appointments: boolean; orders: boolean; plans: boolean };
    bookingsLabel: "Bookings" | "Appointments";
    /** Whether "Add a health note" shows (once staff can act on it, C12). */
    healthNotes: boolean;
}

export interface AccountBooking {
    ref: string;
    service: string;
    startAt: string;
    endAt: string;
    timezone: string;
    /** Who it is with, by the name the business shows. */
    staff: string | null;
    /** Video call rather than in person; null when the service says neither. */
    online: boolean | null;
}

export interface AccountOrder {
    ref: string;
    number: string;
    placedAt: string;
    total: string;
    currency: string;
    /** Still on its way, rather than done, refunded or cancelled. */
    open: boolean;
    /** What the customer reads for where it is. */
    status: string;
    items: { name: string; quantity: number }[];
    /** Lines beyond the ones listed. */
    moreItems: number;
}

export interface AccountPlan {
    ref: string;
    name: string;
    price: string;
    currency: string;
    interval: string;
    status: "ACTIVE" | "PAUSED";
    /** The next renewal; null while paused or ending. */
    renewsAt: string | null;
    pausedUntil: string | null;
    /** Set to end at the close of this period. */
    endsAt: string | null;
    /** The zone its dates are days in (a pause ends at the start of a day there). */
    timezone: string;
}

/**
 * A plan on the account's Plan tab (A8): the plan as Home shows it, its
 * classes this month, a "Pay now" when an invoice is overdue, and what the
 * member may do to it from here.
 */
export interface AccountSubscription extends AccountPlan {
    /** This month's classes (D10), or null when it includes no number. */
    classes: { perMonth: number; left: number; resetsAt: string } | null;
    /**
     * An overdue invoice the member can pay online now, through a link made
     * when they press it. Null when nothing is overdue, Payments can't take
     * it online, or an autopay charge is already under way (D13).
     */
    payNow: { total: string; currency: string; dueAt: string | null } | null;
    /** Active, and the business lets members pause (the pause sheet's weeks are the tab's). */
    canPause: boolean;
    canResume: boolean;
    /** Not ended, and not already set to end. */
    canCancel: boolean;
}

export interface AccountPack {
    name: string;
    credits: number;
    left: number;
    expiresAt: string;
    /** Classes left to use; a used-up pack stays listed until it expires. */
    live: boolean;
}

/** The account's Plan tab (A8): each part read on its own, as Home's are. */
export interface AccountPlanTab {
    subscriptions: Block<AccountSubscription[]>;
    packs: Block<AccountPack[]>;
    /** The weeks a pause may last (2, 4, 8); empty when members can't pause. */
    pauseWeeks: number[];
}

/** What a pause, resume or cancel answers: what happened, and the tab now. */
export interface AccountPlanChange {
    message: string;
    tab: AccountPlanTab;
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
    /** Null when the business takes no bookings. */
    nextBooking: Block<AccountBooking | null> | null;
    classes: Block<AccountClasses | null>;
    /** Null when the business doesn't sell. */
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
    /** What the customer wrote. */
    text: string;
    sentAt: string;
    /** SENT waits for the team; ON_RECORD is on their record. */
    state: "SENT" | "ON_RECORD";
}

// ---- Serializers ------------------------------------------------------------

interface Named {
    firstName: string | null;
    lastName: string | null;
}

export function personName(p: Named): string | null {
    const name = [p.firstName, p.lastName]
        .map((part) => part?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    return name || null;
}

function blankToNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

export function accountView(input: {
    account: { email: string };
    contact: Named & { phone: string | null };
    businessName: string;
    tabs: AccountTab[];
    offers: { appointments: boolean; orders: boolean; plans: boolean };
    bookingsLabel: "Bookings" | "Appointments";
    healthNotes: boolean;
}): AccountView {
    return {
        name: personName(input.contact),
        email: input.account.email,
        phone: blankToNull(input.contact.phone),
        businessName: input.businessName,
        tabs: input.tabs.map((t) => ({ key: t.key, label: t.label })),
        offers: {
            appointments: input.offers.appointments,
            orders: input.offers.orders,
            plans: input.offers.plans,
        },
        bookingsLabel: input.bookingsLabel,
        healthNotes: input.healthNotes,
    };
}

export function bookingView(row: {
    id: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    locationType: string | null;
    service: { name: string };
    staff: { name: string } | null;
}): AccountBooking {
    return {
        ref: row.id,
        service: row.service.name,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        timezone: row.timezone,
        staff: row.staff?.name ?? null,
        online:
            row.locationType === "ONLINE"
                ? true
                : row.locationType === "IN_PERSON"
                  ? false
                  : null,
    };
}

const STAGE_WORDS: Record<string, string> = {
    NEW: "Received",
    PREPARING: "Being prepared",
    READY: "Ready",
    COLLECTED: "Collected",
    HANDED_TO_COURIER: "With the courier",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    SENT: "Sent",
};
const FINISHED_STAGES = new Set(["COLLECTED", "DELIVERED", "SENT"]);

/** How many lines an order row lists by name. */
export const ORDER_ROW_ITEMS = 3;

export function orderView(row: {
    id: string;
    orderId: string;
    createdAt: Date;
    total: { toString(): string };
    currency: string;
    status: string;
    paymentStatus: string;
    stage: string;
    items: {
        quantity: number;
        product: { name: string } | null;
        service?: { name: string } | null;
    }[];
    _count: { items: number };
}): AccountOrder {
    const refunded = row.paymentStatus === "REFUNDED";
    const cancelled = row.status === "CANCELLED";
    const listed = row.items.slice(0, ORDER_ROW_ITEMS);
    return {
        ref: row.id,
        number: row.orderId,
        placedAt: row.createdAt.toISOString(),
        total: toMoneyString(row.total),
        currency: row.currency,
        open: !refunded && !cancelled && !FINISHED_STAGES.has(row.stage),
        status: refunded
            ? "Refunded"
            : cancelled
              ? "Cancelled"
              : (STAGE_WORDS[row.stage] ?? "Received"),
        items: listed.map((i) => ({
            // A treatment's line bills a service, not a product (E9).
            name: lineName(i) ?? "",
            quantity: i.quantity,
        })),
        moreItems: Math.max(0, row._count.items - listed.length),
    };
}

export function planView(row: {
    id: string;
    status: string;
    price: { toString(): string };
    currency: string;
    interval: string;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
    pausedUntil: Date | null;
    timezone: string;
    plan: { name: string };
}): AccountPlan {
    const paused = row.status === "PAUSED";
    return {
        timezone: row.timezone,
        ref: row.id,
        name: row.plan.name,
        price: toMoneyString(row.price),
        currency: row.currency,
        interval: row.interval,
        status: paused ? "PAUSED" : "ACTIVE",
        renewsAt:
            paused || row.cancelAtPeriodEnd
                ? null
                : row.currentPeriodEnd.toISOString(),
        pausedUntil: paused ? (row.pausedUntil?.toISOString() ?? null) : null,
        endsAt: row.cancelAtPeriodEnd
            ? row.currentPeriodEnd.toISOString()
            : null,
    };
}

export function packView(row: {
    credits: number;
    used: number;
    expiresAt: Date;
    pack: { name: string };
}): AccountClasses["packs"][number] {
    return {
        name: row.pack.name,
        credits: row.credits,
        left: Math.max(0, row.credits - row.used),
        expiresAt: row.expiresAt.toISOString(),
    };
}

export function subscriptionView(input: {
    row: Parameters<typeof planView>[0];
    classes: { perMonth: number; left: number; resetsAt: string } | null;
    payNow: {
        total: { toString(): string };
        currency: string;
        dueAt: Date | null;
    } | null;
    membersCanPause: boolean;
}): AccountSubscription {
    const plan = planView(input.row);
    const { row } = input;
    return {
        ...plan,
        classes: input.classes
            ? {
                  perMonth: input.classes.perMonth,
                  left: input.classes.left,
                  resetsAt: input.classes.resetsAt,
              }
            : null,
        payNow: input.payNow
            ? {
                  total: toMoneyString(input.payNow.total),
                  currency: input.payNow.currency,
                  dueAt: input.payNow.dueAt?.toISOString() ?? null,
              }
            : null,
        canPause: row.status === "ACTIVE" && input.membersCanPause,
        canResume: row.status === "PAUSED",
        canCancel: row.status === "PAUSED" || !row.cancelAtPeriodEnd,
    };
}

export function accountPackView(row: {
    credits: number;
    used: number;
    expiresAt: Date;
    pack: { name: string };
}): AccountPack {
    const view = packView(row);
    return { ...view, live: view.left > 0 };
}

/** "18 Oct 2026", as the day falls in the plan's own zone. */
function planDay(at: Date, timezone: string): string {
    return DateTime.fromJSDate(at, { zone: timezone }).toFormat("d LLL yyyy");
}

/** What the member reads after an action on their plan (A8). */
export const planMessages = {
    paused(until: Date | null, timezone: string): string {
        return until
            ? `Paused until ${planDay(until, timezone)}. Nothing is charged till then.`
            : "Paused. Nothing is charged until you resume.";
    },
    resumed(restarted: boolean, renewsAt: Date, timezone: string): string {
        return restarted
            ? `Resumed. Your plan starts again today and renews on ${planDay(renewsAt, timezone)}.`
            : `Resumed. Your next payment is on ${planDay(renewsAt, timezone)}.`;
    },
    cancelled(
        outcome: "scheduled" | "already" | "now",
        endsAt: Date,
        timezone: string,
    ): string {
        if (outcome === "now") {
            return "Cancelled. Nothing more is charged.";
        }
        if (outcome === "already") {
            return `Your plan is already set to end on ${planDay(endsAt, timezone)}. Nothing more is charged.`;
        }
        return `Cancelled. You keep it until ${planDay(endsAt, timezone)}, and nothing more is charged.`;
    },
};

export function receiptView(row: {
    id: string;
    number: string | null;
    issuedAt: Date | null;
    paidAt: Date | null;
    total: { toString(): string };
    currency: string;
}): AccountReceipt {
    return {
        ref: row.id,
        number: row.number ?? "",
        issuedAt: row.issuedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        total: toMoneyString(row.total),
        currency: row.currency,
    };
}

export function noteView(row: {
    id: string;
    label: string;
    detail: string | null;
    status: string;
    createdAt: Date;
}): AccountNote {
    return {
        ref: row.id,
        text: row.detail ?? row.label,
        sentAt: row.createdAt.toISOString(),
        state: row.status === "ACTIVE" ? "ON_RECORD" : "SENT",
    };
}
