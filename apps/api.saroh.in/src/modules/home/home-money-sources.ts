import type { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { isPastDue, leftToPayCents } from "../invoices/invoice-state";
import {
    heardWords,
    lastHeardFrom,
    latestPeriodInvoices,
    LIVE_SUBSCRIPTION,
    overdueBillsWhere,
} from "../invoices/overdue-bills";
import type { ChargeUnderWay } from "../payments/charge-under-way";
import {
    AUTOPAY_CHARGE_IN_PROGRESS,
    chargesUnderWay,
} from "../payments/charge-under-way";
import type { HomeAction, HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT, overdueTag, personName } from "./home-model";

/**
 * Home's money sources (round 2, F1): renewals that haven't been paid, and
 * invoices past their due date. Each is read on its own through
 * `HomeService.attempt()`, so one failing is named and the other still shows.
 *
 * The two never list the same invoice. A live subscription's period
 * invoices belong to the failed-renewal row — the subscription is where the
 * merchant retries it — so the overdue-invoice source leaves them out. A
 * cancelled subscription's unpaid invoice is still money owed, and is listed
 * as an invoice.
 */

type Db = typeof prisma;

/** How far back a bill's row says when it was last reminded: a week. */
const HEARD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** What happened to a renewal's charge, from D9's subscription event log. */
export type RenewalEventKind = "RENEWAL_FAILED" | "MANDATE_LIMIT_LOW";

export interface RenewalSignal {
    subscriptionId: string;
    kind: RenewalEventKind;
    at: Date;
    /** The event's `data.reason`, when it gave one (a RENEWAL_FAILED's). */
    reason?: string;
}

/**
 * Reads the RENEWAL_FAILED and MANDATE_LIMIT_LOW events of these
 * subscriptions. Only D13 (a mandate charge) writes them, so before autopay
 * there are none and no renewal reads "Payment failed". A parameter, so
 * the unit specs can hand in their own.
 */
export type RenewalSignalReader = (
    db: Db,
    organizationId: string,
    subscriptionIds: readonly string[],
) => Promise<RenewalSignal[]>;

const RENEWAL_EVENT_KINDS: RenewalEventKind[] = [
    "RENEWAL_FAILED",
    "MANDATE_LIMIT_LOW",
];

/**
 * The event read, from D9's subscription log. Only D13 writes these two
 * kinds, so until autopay this finds none. Every event of theirs is read:
 * `renewalTag` keeps the ones since the unpaid invoice was issued.
 */
export const readRenewalSignals: RenewalSignalReader = async (
    db,
    organizationId,
    subscriptionIds,
) => {
    if (subscriptionIds.length === 0) return [];
    const rows = await db.subscriptionEvent.findMany({
        where: {
            organizationId,
            subscriptionId: { in: [...subscriptionIds] },
            kind: { in: RENEWAL_EVENT_KINDS },
        },
        select: {
            subscriptionId: true,
            kind: true,
            createdAt: true,
            data: true,
        },
    });
    return rows.map((r) => {
        const reason = reasonOf(r.data);
        return {
            subscriptionId: r.subscriptionId,
            kind: r.kind as RenewalEventKind,
            at: r.createdAt,
            ...(reason ? { reason } : {}),
        };
    });
};

function reasonOf(data: unknown): string | null {
    if (typeof data !== "object" || data === null) return null;
    const reason = (data as Record<string, unknown>).reason;
    return typeof reason === "string" ? reason : null;
}

const EVENT_TAGS: Record<RenewalEventKind, string> = {
    RENEWAL_FAILED: "Payment failed",
    MANDATE_LIMIT_LOW: "Autopay limit too low",
};

/**
 * Autopay stood aside for a pay-link checkout the customer had open
 * (RENEWAL_FAILED with reason CHECKOUT_OPEN): nothing was declined, so not
 * "Payment failed". Worded as the subscription's history says it.
 */
export const CHECKOUT_OPEN_TAG = "Autopay didn't charge, paying by link";

/** The tag of a renewal above its autopay's limit (D13): it needs a new set-up (D14). */
export const LIMIT_LOW_TAG = EVENT_TAGS.MANDATE_LIMIT_LOW;

/**
 * The tags that say autopay didn't take the renewal: such a renewal is
 * retried before its due date (D13) — by the pay link while the customer's
 * checkout is open, by autopay once it has closed.
 */
export const AUTOPAY_FAILED_TAGS: readonly string[] = [
    ...Object.values(EVENT_TAGS),
    CHECKOUT_OPEN_TAG,
];

/** A renewal event's tag: what happened, in the merchant's words. */
function signalTag(signal: RenewalSignal): string {
    if (signal.kind === "RENEWAL_FAILED" && signal.reason === "CHECKOUT_OPEN") {
        return CHECKOUT_OPEN_TAG;
    }
    return EVENT_TAGS[signal.kind];
}

/**
 * The autopay charges under way on these invoices (D13), by invoice. A
 * parameter, so the unit specs can hand in their own.
 */
export type RenewalChargeReader = (
    db: Db,
    organizationId: string,
    invoiceIds: readonly string[],
) => Promise<Map<string, ChargeUnderWay>>;

/** "Autopay charge in progress · 14 Oct", in the business's zone. */
export function chargingTag(at: Date, zone: string): string {
    const day = DateTime.fromJSDate(at, { zone }).toFormat("d LLL");
    return `${AUTOPAY_CHARGE_IN_PROGRESS} · ${day}`;
}

/** Not cancelled: ACTIVE or PAUSED, and still owed what it billed. */
/**
 * Failed renewals — the one source for them (overview, "Failed renewals on
 * Home"). A live subscription whose latest period invoice is unpaid, and
 * either past due or carrying a RENEWAL_FAILED or MANDATE_LIMIT_LOW event
 * since that invoice was issued. "Latest" is the rule Subscription Detail's
 * failed charge uses: the last ISSUED or PAID invoice by issue date.
 *
 * One row per subscription, oldest due first. The amount is shown only to
 * someone who reads invoices (`showAmount`). While an autopay charge is
 * under way on it (D13) the row says "Autopay charge in progress · ‹date›"
 * and offers no Retry (`home-inline.ts`).
 */
export async function failedRenewals(
    db: Db,
    organizationId: string,
    now: Date,
    showAmount: boolean,
    readSignals: RenewalSignalReader = readRenewalSignals,
    readCharges: RenewalChargeReader = chargesUnderWay,
    zone = "Asia/Kolkata",
): Promise<HomeAction | null> {
    const unpaid = await db.invoice.findMany({
        where: {
            organizationId,
            status: "ISSUED",
            subscriptionId: { not: null },
            subscription: { is: LIVE_SUBSCRIPTION },
        },
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        select: {
            id: true,
            status: true,
            subscriptionId: true,
            total: true,
            paidCents: true,
            currency: true,
            issuedAt: true,
            dueAt: true,
            subscription: {
                select: {
                    plan: { select: { name: true } },
                    contact: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });
    // The where asked for a subscription; this only tells TypeScript so.
    const owed = unpaid.flatMap((i) =>
        i.subscriptionId && i.subscription
            ? [
                  {
                      ...i,
                      subscriptionId: i.subscriptionId,
                      subscription: i.subscription,
                  },
              ]
            : [],
    );
    if (owed.length === 0) return null;

    const latestOf = await latestPeriodInvoices(
        db,
        organizationId,
        owed.map((i) => i.subscriptionId),
    );
    const current = owed.filter((i) => latestOf.get(i.subscriptionId) === i.id);
    if (current.length === 0) return null;

    const [signals, charging] = await Promise.all([
        readSignals(
            db,
            organizationId,
            current.map((i) => i.subscriptionId),
        ),
        readCharges(
            db,
            organizationId,
            current.map((i) => i.id),
        ),
    ]);

    const evidence: HomeEvidence[] = [];
    for (const inv of current) {
        const { subscriptionId } = inv;
        const failed = renewalTag(inv, subscriptionId, signals, now);
        if (!failed) continue;
        const charge = charging.get(inv.id);
        const tag = charge ? chargingTag(charge.at, zone) : failed;
        evidence.push({
            id: subscriptionId,
            title: inv.subscription.plan.name,
            subtitle: personName(inv.subscription.contact),
            at: inv.dueAt?.toISOString() ?? null,
            // What is left to pay on it (DEC-173).
            amountMinor: showAmount ? leftToPayCents(inv) : null,
            currency: showAmount ? inv.currency : null,
            href: `/billing/subscriptions/${subscriptionId}`,
            tag,
            tone: "bad",
        });
    }
    const count = evidence.length;
    if (count === 0) return null;

    return {
        code: "PAYMENTS_FAILED_RENEWALS",
        title:
            count === 1
                ? "Collect a renewal that hasn't been paid"
                : `Collect ${count} renewals that haven't been paid`,
        href:
            count === 1
                ? evidence[0].href
                : "/billing/subscriptions?tab=failed",
        severity: "OVERDUE",
        moduleKey: "PAYMENTS",
        count,
        evidence: evidence.slice(0, EVIDENCE_LIMIT),
        tone: "bad",
    };
}

/**
 * What the renewal row says, or null when there is nothing to act on yet.
 * The latest event since the invoice was issued names what happened;
 * without one, a past-due invoice is "Late · N days" — before autopay no
 * payment was attempted, so nothing can say it failed.
 */
export function renewalTag(
    invoice: { status: string; issuedAt: Date | null; dueAt: Date | null },
    subscriptionId: string,
    signals: readonly RenewalSignal[],
    now: Date,
): string | null {
    const since = invoice.issuedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    let latest: RenewalSignal | null = null;
    for (const s of signals) {
        if (s.subscriptionId !== subscriptionId) continue;
        if (s.at.getTime() < since) continue;
        if (!latest || s.at > latest.at) latest = s;
    }
    if (latest) return signalTag(latest);
    if (isPastDue(invoice, now) && invoice.dueAt)
        return overdueTag(invoice.dueAt, now);
    return null;
}

/**
 * Invoices past their due date that are neither an order's own (the order
 * is the ledger for its money, ADR-008) nor a live subscription's (the
 * failed-renewal row carries those). A draft is never overdue: only an
 * issued invoice has a due date that counts. One row per invoice, oldest
 * due first.
 */
export async function overdueInvoices(
    db: Db,
    organizationId: string,
    now: Date,
    zone = "Asia/Kolkata",
): Promise<HomeAction | null> {
    const where = await overdueBillsWhere(db, organizationId, now);

    const [count, rows] = await Promise.all([
        db.invoice.count({ where }),
        db.invoice.findMany({
            where,
            orderBy: [{ dueAt: "asc" }, { id: "asc" }],
            take: EVIDENCE_LIMIT,
            select: {
                id: true,
                number: true,
                total: true,
                paidCents: true,
                currency: true,
                dueAt: true,
                billToName: true,
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
                // What it was for, on Home's row: "INV-0012 · X-ray · …".
                lines: {
                    orderBy: { position: "asc" },
                    take: 1,
                    select: { description: true },
                },
            },
        }),
    ]);
    if (count === 0) return null;

    // Each bill's last reminder in the past week (U8): "reminded yesterday"
    // on its row, so nobody is chased twice without knowing it.
    const heard = await lastHeardFrom(
        db,
        organizationId,
        rows.map((r) => r.id),
        new Date(now.getTime() - HEARD_WINDOW_MS),
    );

    const evidence: HomeEvidence[] = rows.map((inv) => {
        const first =
            inv.lines.length > 0 ? inv.lines[0].description.trim() : "";
        const last = heard.get(inv.id);
        return {
            id: inv.id,
            title: inv.number ?? "Invoice",
            subtitle: billedTo(inv),
            at: inv.dueAt?.toISOString() ?? null,
            // What is left to pay on it (DEC-173).
            amountMinor: leftToPayCents(inv),
            currency: inv.currency,
            href: `/billing/invoices/${inv.id}`,
            // Always set: the where asked for a due date before now.
            tag: inv.dueAt ? overdueTag(inv.dueAt, now) : undefined,
            tone: "bad",
            ...(first ? { detail: first } : {}),
            ...(last ? { reminded: heardWords(last, now, zone) } : {}),
        };
    });

    return {
        code: "PAYMENTS_OVERDUE_INVOICES",
        title:
            count === 1
                ? "Chase an overdue invoice"
                : `Chase ${count} overdue invoices`,
        href:
            count === 1 && evidence[0]
                ? evidence[0].href
                : "/billing/invoices?view=overdue",
        severity: "OVERDUE",
        moduleKey: "PAYMENTS",
        count,
        evidence,
        tone: "bad",
    };
}

/** Who an invoice is to: its bill-to name, else its contact's name. */
function billedTo(inv: {
    billToName: string | null;
    contact: {
        firstName: string | null;
        lastName: string | null;
        email: string | null;
    } | null;
}): string | null {
    const name = inv.billToName?.trim();
    if (name) return name;
    return inv.contact ? personName(inv.contact) : null;
}

/**
 * Why a payment is owed back, as the webhook recorded it when the money
 * arrived (`rawResponse.invoiceStatus` on the CAPTURED_NEEDS_REFUND attempt)
 * — not the invoice's status now, which may have moved on since.
 */
export type RefundReason =
    | "CANCELLED_BOOKING"
    | "RELEASED_HOLD"
    | "VOID"
    | "PAID"
    | "AMOUNT_MISMATCH"
    | "MORE_THAN_LEFT"
    | "UNKNOWN";

const REFUND_REASONS: readonly RefundReason[] = [
    "CANCELLED_BOOKING",
    "RELEASED_HOLD",
    "VOID",
    "PAID",
    "AMOUNT_MISMATCH",
    "MORE_THAN_LEFT",
];

/**
 * The recorded reason, from an attempt's `rawResponse`. An attempt that
 * recorded none (or MISSING, an invoice gone when the money came) is
 * UNKNOWN, and its words say only that it could not be applied.
 */
export function refundReason(rawResponse: unknown): RefundReason {
    const recorded =
        rawResponse && typeof rawResponse === "object"
            ? (rawResponse as { invoiceStatus?: unknown }).invoiceStatus
            : undefined;
    return REFUND_REASONS.find((r) => r === recorded) ?? "UNKNOWN";
}

/** A refund row's words after the customer's name: what happened. */
export function refundReasonWords(reason: RefundReason): string {
    switch (reason) {
        case "CANCELLED_BOOKING":
            return "Paid online after its booking was cancelled";
        case "RELEASED_HOLD":
            return "Paid online after its booking's hold ran out";
        case "VOID":
            return "Paid online after it was voided";
        case "PAID":
            return "Paid online after it was already paid";
        // PAY-06: the provider took an amount Saroh didn't ask for.
        case "AMOUNT_MISMATCH":
            return "Paid online at a different amount than asked";
        // DEC-173: part was recorded by hand while the checkout was open.
        case "MORE_THAN_LEFT":
            return "Paid online for more than was left to pay";
        case "UNKNOWN":
            return "Paid online when it couldn't take the payment";
    }
}

/** The refund action's title: true to the one reason when there is one. */
export function refundsOwedTitle(
    count: number,
    reason: RefundReason | undefined,
): string {
    if (count !== 1) return `Refund ${count} payments customers are owed`;
    switch (reason) {
        case "CANCELLED_BOOKING":
            return "Refund a payment taken after its booking was cancelled";
        case "RELEASED_HOLD":
            return "Refund a payment taken after its booking's hold ran out";
        case "VOID":
        case "PAID":
            return "Refund a payment taken on a settled invoice";
        default:
            return "Refund a payment a customer is owed";
    }
}
