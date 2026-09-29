import { DateTime } from "luxon";

import { toMoneyString } from "../../common/money";
import { isBillOfSupply } from "../invoices/invoice-title";
import type { OrderStage } from "../orders/dto";
import { goesByCourier } from "../orders/fulfilment";
import { isServiceLine, lineName } from "../orders/order-line";
import type { AccountTab } from "./account-tabs";
import type { TrackState, TrackStep } from "./account-track";
import { orderTrack, REFUND_LINE } from "./account-track";

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

// A6's bookings: their own allow-list file, part of this one.
export * from "./account-bookings-view";
// A11's packs on sale and pack purchases: the same.
export * from "./account-packs-view";

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
    /** Messages from the business they haven't opened yet (A13): the tab's dot. */
    unreadMessages: number;
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
    /** What the customer reads for where it is: its step, or how it ended. */
    status: string;
    /** How it leaves: "Pick-up", "Shipping"… (A7). */
    fulfilment: string;
    items: { name: string; quantity: number }[];
    /** Lines beyond the ones listed. */
    moreItems: number;
}

/** One visit of a treatment bought as an order (E9; A7). */
export interface AccountOrderVisit {
    number: number;
    /** Null for a visit not booked yet. */
    startAt: string | null;
    timezone: string | null;
    state: "done" | "booked" | "missed" | "to-book";
}

export interface AccountOrderLine {
    /** The product's name, or the service's for a treatment (E9). */
    name: string;
    quantity: number;
    kind: "product" | "service";
    /** A treatment's visits, in order; null on a product's line. */
    visits: AccountOrderVisit[] | null;
}

/** One order with its Track (A7). */
export interface AccountOrderDetail {
    ref: string;
    number: string;
    placedAt: string;
    total: string;
    currency: string;
    fulfilment: string;
    state: TrackState;
    status: string;
    lines: AccountOrderLine[];
    /** Its type's steps, each done, now or next, with its line. */
    steps: TrackStep[];
    /** Who took it and its number, once staff record them (DEC-045). */
    courier: {
        name: string | null;
        trackingNumber: string | null;
        /** Only an http(s) link staff typed; anything else is dropped. */
        trackingUrl: string | null;
    } | null;
    /** "Money back in 5–7 days" on a refunded order. */
    refund: string | null;
    /** The paid invoice's ref, for its receipt; null until there is one. */
    receipt: string | null;
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
    /**
     * How its autopay stands (D12): ON (or PAUSED in their UPI app), being
     * set up, or failed; with the method and only the provider's
     * displayable hint. Null: none. Absent from an API older than D12.
     */
    autopay?: AccountAutopay | null;
    /**
     * What turning autopay on pays now (D12): the plan's oldest unpaid
     * invoice, which UPI or card pay in the same window. Null: nothing owed.
     */
    autopayPays?: { total: string; currency: string } | null;
}

/** A plan's autopay as the member sees it (D12). */
export interface AccountAutopay {
    state: "ON" | "PAUSED" | "PENDING" | "FAILED";
    method: "UPI" | "CARD" | "EMANDATE" | null;
    hint: string | null;
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
    /**
     * The ways the business's provider can take autopay (D12), every one
     * it offers; empty when it takes none, and then autopay isn't offered.
     */
    autopayMethods?: ("UPI" | "CARD" | "EMANDATE")[];
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
    /** A registered business's exempt paper (D15), as the pay page says. */
    billOfSupply: boolean;
}

export interface AccountNote {
    ref: string;
    /** What the customer wrote. */
    text: string;
    sentAt: string;
    /** SENT waits for the team; ON_RECORD is on their record. */
    state: "SENT" | "ON_RECORD";
}

/**
 * One message in the customer's thread with the business (A13), as they
 * see it: who it is from — them, or the business, never which staff member
 * — its words and when. Plain text: the site draws it as text, never HTML.
 */
export interface AccountMessage {
    ref: string;
    from: "me" | "business";
    text: string;
    sentAt: string;
}

export interface AccountThread {
    /** Oldest first: the newest ones (`THREAD_ROWS` in threads.service). */
    messages: AccountMessage[];
    /** Older messages exist beyond these. */
    earlier: boolean;
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
    unreadMessages: number;
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
        unreadMessages: Math.max(0, Math.trunc(input.unreadMessages)),
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

/** How many lines an order row lists by name. */
export const ORDER_ROW_ITEMS = 3;

/**
 * An order row. Its status is the step its own fulfilment type is at
 * ("Preparing", "Ready"), or how it ended ("Collected", "Refunded"), from
 * the same table the Track reads (`account-track.ts`, A7).
 */
export function orderView(row: {
    id: string;
    orderId: string;
    createdAt: Date;
    total: { toString(): string };
    currency: string;
    status: string;
    paymentStatus: string;
    stage: string;
    fulfilment: string;
    items: {
        quantity: number;
        product: { name: string } | null;
        service?: { name: string } | null;
    }[];
    _count: { items: number };
}): AccountOrder {
    const track = orderTrack({
        number: row.orderId,
        placedAt: row.createdAt,
        fulfilment: row.fulfilment,
        stage: row.stage,
        status: row.status,
        paymentStatus: row.paymentStatus,
        courierName: null,
        trackingNumber: null,
    });
    const listed = row.items.slice(0, ORDER_ROW_ITEMS);
    return {
        ref: row.id,
        number: row.orderId,
        placedAt: row.createdAt.toISOString(),
        total: toMoneyString(row.total),
        currency: row.currency,
        open: track.state === "open",
        status: track.status,
        fulfilment: track.fulfilment,
        items: listed.map((i) => ({
            // A treatment's line bills a service, not a product (E9).
            name: lineName(i) ?? "",
            quantity: i.quantity,
        })),
        moreItems: Math.max(0, row._count.items - listed.length),
    };
}

/** A link staff typed, only when it is http(s): never a script or data URL. */
export function webLink(value: string | null): string | null {
    const text = value?.trim();
    if (!text) return null;
    try {
        const url = new URL(text);
        return url.protocol === "https:" || url.protocol === "http:"
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

interface VisitRow {
    visitNumber: number | null;
    startAt: Date;
    timezone: string;
    status: string;
    outcome: string | null;
}

/**
 * A treatment's visits (E9): each booked, done or missed, and those not
 * booked yet. A cancelled visit leaves its number free, so the booking
 * that stands for it now is the one shown.
 */
export function visitsView(
    total: number,
    bookings: readonly VisitRow[],
): AccountOrderVisit[] {
    const live = new Map<number, VisitRow>();
    for (const b of bookings) {
        if (b.visitNumber === null || b.status !== "CONFIRMED") continue;
        live.set(b.visitNumber, b);
    }
    const count = Math.max(total, 0, ...live.keys());
    const visits: AccountOrderVisit[] = [];
    for (let n = 1; n <= count; n++) {
        const b = live.get(n);
        visits.push(
            b
                ? {
                      number: n,
                      startAt: b.startAt.toISOString(),
                      timezone: b.timezone,
                      state:
                          b.outcome === "ATTENDED"
                              ? "done"
                              : b.outcome === "NO_SHOW"
                                ? "missed"
                                : "booked",
                  }
                : {
                      number: n,
                      startAt: null,
                      timezone: null,
                      state: "to-book",
                  },
        );
    }
    return visits;
}

/** One order and its Track (A7). */
export function orderDetailView(row: {
    id: string;
    orderId: string;
    createdAt: Date;
    total: { toString(): string };
    currency: string;
    status: string;
    paymentStatus: string;
    stage: string;
    fulfilment: string;
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    items: {
        quantity: number;
        productId: string | null;
        serviceId: string | null;
        product: { name: string } | null;
        service: { name: string; visits: number } | null;
    }[];
    bookings: VisitRow[];
    /** Its paid invoice, newest first; at most the first is read. */
    invoices: { id: string }[];
}): AccountOrderDetail {
    const track = orderTrack({
        number: row.orderId,
        placedAt: row.createdAt,
        fulfilment: row.fulfilment,
        stage: row.stage,
        status: row.status,
        paymentStatus: row.paymentStatus,
        courierName: row.courierName,
        trackingNumber: row.trackingNumber,
    });
    const courierName = blankToNull(row.courierName);
    const trackingNumber = blankToNull(row.trackingNumber);
    const trackingUrl = webLink(row.trackingUrl);
    const byCourier = goesByCourier(row.fulfilment, row.stage as OrderStage);
    return {
        ref: row.id,
        number: row.orderId,
        placedAt: row.createdAt.toISOString(),
        total: toMoneyString(row.total),
        currency: row.currency,
        fulfilment: track.fulfilment,
        state: track.state,
        status: track.status,
        lines: row.items.map((i): AccountOrderLine => {
            const service = isServiceLine(i);
            return {
                name: lineName(i) ?? "",
                quantity: i.quantity,
                kind: service ? "service" : "product",
                visits:
                    service && i.service
                        ? visitsView(i.service.visits, row.bookings)
                        : null,
            };
        }),
        steps: track.steps,
        courier:
            byCourier && (courierName || trackingNumber || trackingUrl)
                ? { name: courierName, trackingNumber, trackingUrl }
                : null,
        refund: track.state === "refunded" ? REFUND_LINE : null,
        receipt: row.invoices[0]?.id ?? null,
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
    kind: string;
    sellerGstin: string | null;
    lines: { gstRate: { toString(): string } | null }[];
}): AccountReceipt {
    return {
        ref: row.id,
        number: row.number ?? "",
        issuedAt: row.issuedAt?.toISOString() ?? null,
        paidAt: row.paidAt?.toISOString() ?? null,
        total: toMoneyString(row.total),
        currency: row.currency,
        billOfSupply: isBillOfSupply(row),
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

export function messageView(row: {
    id: string;
    author: string;
    body: string;
    createdAt: Date;
}): AccountMessage {
    return {
        ref: row.id,
        from: row.author === "CUSTOMER" ? "me" : "business",
        text: row.body,
        sentAt: row.createdAt.toISOString(),
    };
}
