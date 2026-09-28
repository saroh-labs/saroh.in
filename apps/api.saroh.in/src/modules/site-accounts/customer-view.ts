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
    plan: { name: string };
}): AccountPlan {
    const paused = row.status === "PAUSED";
    return {
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
