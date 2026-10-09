import type { Prisma, prisma } from "@saroh/database";

import {
    invoiceRefundsOwedWhere,
    mismatchAttemptsOwed,
    paperOf,
} from "../home/home-mismatch-refunds";
import { personName } from "../home/home-model";
import { openFailedOrderRefunds } from "../home/home-refunds-failed";
import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import { OWED_BACK_WHERE } from "./intent-state";
import { owedOf } from "./mismatch-refund";
import { SEND_REFUND_TYPE } from "./send-refund-type";

type Db = Pick<
    typeof prisma,
    "paymentRefund" | "paymentIntent" | "paymentAttempt" | "job"
>;

/**
 * Where a refund to a customer stands while it is not yet theirs (#921):
 *
 * - `OWED` — Saroh holds money the customer is owed and no refund has been
 *   asked for (Home's "Payments to refund", and a payment on a replaced
 *   edit charge).
 * - `FAILED` — a refund the provider refused; nothing else has taken over.
 * - `SENDING` — Saroh is sending it, or lost the provider's answer
 *   (DEC-026: the money is held until the provider says).
 * - `CONFIRMING` — the provider took it and hasn't confirmed it went back
 *   (B9: "Refund on its way").
 */
export type OutstandingRefundStage =
    "OWED" | "FAILED" | "SENDING" | "CONFIRMING";

export interface OutstandingRefund {
    /** Unique across the list: what it is and its row's id. */
    key: string;
    stage: OutstandingRefundStage;
    amountCents: number | null;
    currency: string | null;
    /** The customer, in words, or null when the paper names nobody. */
    customer: string | null;
    /** The order or invoice it is for; null for a send whose refund is gone. */
    paper: { label: string; href: string } | null;
    /** RAZORPAY | CASHFREE, or null when unknown. */
    provider: string | null;
    /**
     * What to look it up by at the provider: its refund id once the provider
     * gave one, else Saroh's own reference for the refund (the row id the
     * provider was sent, DEC-026), else the payment's id.
     */
    providerRef: string | null;
    since: Date;
}

/** The most rows any one source reads: it bounds a read gone wrong. */
const SOURCE_LIMIT = 200;

const INTENT_SELECT = {
    id: true,
    provider: true,
    currency: true,
    amountCents: true,
    invoice: { select: { id: true, number: true, billToName: true } },
    order: {
        select: {
            id: true,
            orderId: true,
            walkInName: true,
            customer: {
                select: { firstName: true, lastName: true, email: true },
            },
        },
    },
} satisfies Prisma.PaymentIntentSelect;

/**
 * Every refund a business still owes its customers, oldest first (#921,
 * owner 9 Oct): the deletion sweep finishes no business while one is left,
 * the clean-up deletes no payment keys, the workspace lists them during the
 * deletion window, and the console shows them as "Deletion waiting on
 * refunds".
 *
 * The sources are the ones the workspace already shows, read by the same
 * definitions, so the lists can't disagree:
 *
 * 1. refunds on their way — a `PaymentRefund` still PENDING, with or without
 *    the provider's id (Order Detail's "being confirmed" and "on its way");
 * 2. refunds the provider refused that no later refund took over (Home's
 *    "Refunds", `openFailedOrderRefunds`);
 * 3. invoice payments captured after the invoice was settled (Home's
 *    "Payments to refund", `invoiceRefundsOwedWhere`);
 * 4. captures taken at the wrong amount, AMOUNT_MISMATCH (Home's same row,
 *    `mismatchAttemptsOwed`);
 * 5. payments on a replaced edit charge (Order Detail's "owed back",
 *    `OWED_BACK_WHERE`);
 * 6. a `payments.send-refund` job still waiting or running whose refund
 *    isn't already listed.
 *
 * A refund made in the provider's own dashboard settles these through its
 * webhook, as any refund does. Reads only; pass a transaction client to
 * read inside one.
 */
export async function refundsOutstanding(
    db: Db,
    organizationId: string,
): Promise<{ count: number; rows: OutstandingRefund[] }> {
    const [onTheWay, failed, invoiceOwed, mismatches, owedBack, sends] =
        await Promise.all([
            db.paymentRefund.findMany({
                where: { organizationId, status: "PENDING" },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: SOURCE_LIMIT,
                select: {
                    id: true,
                    amountCents: true,
                    currency: true,
                    providerRefundId: true,
                    createdAt: true,
                    paymentIntent: { select: INTENT_SELECT },
                },
            }),
            openFailedOrderRefunds(db, organizationId),
            db.paymentIntent.findMany({
                where: invoiceRefundsOwedWhere(organizationId),
                orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
                take: SOURCE_LIMIT,
                select: {
                    ...INTENT_SELECT,
                    updatedAt: true,
                    attempts: {
                        where: { status: CAPTURED_NEEDS_REFUND },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { providerRef: true },
                    },
                },
            }),
            mismatchAttemptsOwed(db, organizationId),
            db.paymentIntent.findMany({
                where: { organizationId, ...OWED_BACK_WHERE },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: SOURCE_LIMIT,
                select: {
                    ...INTENT_SELECT,
                    createdAt: true,
                    attempts: {
                        where: { status: CAPTURED_NEEDS_REFUND },
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: { providerRef: true },
                    },
                },
            }),
            db.job.findMany({
                where: {
                    organizationId,
                    type: SEND_REFUND_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: SOURCE_LIMIT,
                select: { id: true, payload: true, createdAt: true },
            }),
        ]);

    const rows: OutstandingRefund[] = [];

    for (const r of onTheWay) {
        rows.push({
            key: `refund:${r.id}`,
            stage: r.providerRefundId ? "CONFIRMING" : "SENDING",
            amountCents: r.amountCents,
            currency: r.currency,
            ...who(r.paymentIntent),
            provider: r.paymentIntent.provider,
            providerRef: r.providerRefundId ?? r.id,
            since: r.createdAt,
        });
    }

    for (const r of failed) {
        const order = r.paymentIntent.order;
        rows.push({
            key: `refund:${r.id}`,
            stage: "FAILED",
            amountCents: r.amountCents,
            currency: r.currency,
            customer: customerOfOrder(order),
            paper: order
                ? {
                      label: `#${order.orderId}`,
                      href: `/commerce/orders/${order.id}`,
                  }
                : null,
            provider: r.paymentIntent.provider,
            providerRef: r.providerRefundId ?? r.id,
            since: r.updatedAt,
        });
    }

    for (const i of invoiceOwed) {
        rows.push({
            key: `intent:${i.id}`,
            stage: "OWED",
            amountCents: i.amountCents,
            currency: i.currency,
            ...who(i),
            provider: i.provider,
            providerRef: i.attempts[0]?.providerRef ?? null,
            since: i.updatedAt,
        });
    }

    const mismatchIntents = new Set<string>();
    for (const a of mismatches) {
        mismatchIntents.add(a.paymentIntent.id);
        const owed = owedOf(a.rawResponse, a.paymentIntent.currency);
        rows.push({
            key: `attempt:${a.id}`,
            stage: "OWED",
            amountCents: owed?.amountCents ?? null,
            currency: owed?.currency ?? null,
            ...who(a.paymentIntent),
            provider: a.provider,
            providerRef: a.providerRef,
            since: a.createdAt,
        });
    }

    for (const i of owedBack) {
        // A replaced charge captured at the wrong amount is listed once.
        if (mismatchIntents.has(i.id)) continue;
        rows.push({
            key: `intent:${i.id}`,
            stage: "OWED",
            amountCents: i.amountCents,
            currency: i.currency,
            ...who(i),
            provider: i.provider,
            providerRef: i.attempts[0]?.providerRef ?? null,
            since: i.createdAt,
        });
    }

    // A send whose refund isn't already on the list (settled, or gone).
    const listed = new Set(rows.map((r) => r.key));
    const unlisted = sends.flatMap((job) => {
        const refundId = refundIdOf(job.payload);
        return refundId && !listed.has(`refund:${refundId}`)
            ? [{ job, refundId }]
            : [];
    });
    if (unlisted.length > 0) {
        const refunds = await db.paymentRefund.findMany({
            where: {
                organizationId,
                id: { in: unlisted.map((u) => u.refundId) },
            },
            select: {
                id: true,
                amountCents: true,
                currency: true,
                providerRefundId: true,
                paymentIntent: { select: INTENT_SELECT },
            },
        });
        const byId = new Map(refunds.map((r) => [r.id, r]));
        for (const { job, refundId } of unlisted) {
            const refund = byId.get(refundId);
            rows.push({
                key: `job:${job.id}`,
                stage: "SENDING",
                amountCents: refund?.amountCents ?? null,
                currency: refund?.currency ?? null,
                ...(refund
                    ? who(refund.paymentIntent)
                    : { customer: null, paper: null }),
                provider: refund?.paymentIntent.provider ?? null,
                providerRef: refund?.providerRefundId ?? refundId,
                since: job.createdAt,
            });
        }
    }

    rows.sort(
        (a, b) =>
            a.since.getTime() - b.since.getTime() || a.key.localeCompare(b.key),
    );
    return { count: rows.length, rows };
}

/** The customer and the paper of a payment, as Home words them. */
function who(
    intent: Parameters<typeof paperOf>[0],
): Pick<OutstandingRefund, "customer" | "paper"> {
    const paper = paperOf(intent);
    return {
        customer: paper.who,
        paper: { label: paper.title, href: paper.href },
    };
}

function customerOfOrder(
    order: {
        walkInName: string | null;
        customer: {
            firstName: string | null;
            lastName: string | null;
            email: string | null;
        } | null;
    } | null,
): string | null {
    if (!order) return null;
    const walkIn = order.walkInName?.trim() ?? "";
    return (
        (order.customer ? personName(order.customer) : null) ??
        (walkIn.length > 0 ? walkIn : null)
    );
}

function refundIdOf(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const id = (payload as { refundId?: unknown }).refundId;
    return typeof id === "string" && id.length > 0 ? id : null;
}
