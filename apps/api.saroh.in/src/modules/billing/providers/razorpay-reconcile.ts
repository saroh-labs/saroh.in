import type {
    ProviderDisputeEvent,
    ProviderPaidCharge,
    ProviderRefundEvent,
} from "./billing-provider.port";

/**
 * Razorpay's side of DEC-166 (owner, 17 Oct 2026: "store the data so that
 * we can match them in razorpay"), kept apart from the adapter: what it
 * took on a subscription or an order, for the daily reconcile, and the
 * refund and dispute webhooks, read into Saroh's words. The adapter hands
 * its own authenticated GET in, so nothing here holds a key.
 */

/** One authenticated GET at Razorpay, as the adapter makes it. */
export type RazorpayGet = (what: string, path: string) => Promise<Response>;

/** How many invoices of one subscription are read: years of monthly charges. */
const INVOICES_PAGE = 100;

/** A Razorpay unix timestamp (seconds) as a date, or null. */
function unixDate(seconds: unknown): Date | null {
    return typeof seconds === "number" && Number.isFinite(seconds)
        ? new Date(seconds * 1000)
        : null;
}

const paise = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * What Razorpay took: a subscription's paid invoices
 * (`GET /invoices?subscription_id=`, each paid one with its `payment_id`,
 * `amount_paid` and `paid_at`; the path the confirm step already reads,
 * checked in test mode 17 Oct 2026), or an order's captured payments
 * (`GET /orders/:id/payments`).
 */
export async function razorpayPaidCharges(
    get: RazorpayGet,
    ref: string,
    oneTime: boolean,
): Promise<ProviderPaidCharge[]> {
    const id = encodeURIComponent(ref);
    if (oneTime) {
        const res = await get(
            "order payments lookup",
            `/orders/${id}/payments`,
        );
        const json = (await res.json()) as {
            items?: {
                id?: string;
                status?: string;
                amount?: number;
                created_at?: number;
            }[];
        };
        return (json.items ?? []).flatMap((p) =>
            p.status === "captured" && p.id
                ? [
                      {
                          providerPaymentId: p.id,
                          amountPaise: paise(p.amount),
                          paidAt: unixDate(p.created_at),
                      },
                  ]
                : [],
        );
    }
    const res = await get(
        "subscription invoices lookup",
        `/invoices?subscription_id=${id}&count=${INVOICES_PAGE}`,
    );
    const json = (await res.json()) as {
        items?: {
            status?: string;
            payment_id?: string | null;
            amount_paid?: number;
            amount?: number;
            paid_at?: number;
        }[];
    };
    return (json.items ?? []).flatMap((i) =>
        i.status === "paid" && i.payment_id
            ? [
                  {
                      providerPaymentId: i.payment_id,
                      amountPaise: paise(i.amount_paid) ?? paise(i.amount),
                      paidAt: unixDate(i.paid_at),
                  },
              ]
            : [],
    );
}

const REFUND_STATUS: Partial<Record<string, ProviderRefundEvent["status"]>> = {
    pending: "PENDING",
    created: "PENDING",
    processed: "PROCESSED",
    failed: "FAILED",
};

/** From the event's name when the entity doesn't say. */
const REFUND_EVENT_STATUS: Partial<
    Record<string, ProviderRefundEvent["status"]>
> = {
    "refund.created": "PENDING",
    "refund.processed": "PROCESSED",
    "refund.failed": "FAILED",
};

/**
 * A `refund.*` or `payment.dispute.*` webhook's refund or dispute
 * (https://razorpay.com/docs/webhooks/payments/ — `payload.refund.entity`,
 * `payload.dispute.entity`, each with its `payment_id`). Anything else:
 * nothing.
 */
export function razorpayRefundOrDispute(
    type: string,
    payload: unknown,
): { refund?: ProviderRefundEvent; dispute?: ProviderDisputeEvent } {
    const body = (payload ?? {}) as {
        payload?: {
            refund?: { entity?: Record<string, unknown> };
            dispute?: { entity?: Record<string, unknown> };
        };
    };
    if (type.startsWith("refund.")) {
        const r = body.payload?.refund?.entity;
        const id = typeof r?.id === "string" ? r.id : null;
        const payment = typeof r?.payment_id === "string" ? r.payment_id : null;
        if (!r || !id || !payment) return {};
        const status =
            (typeof r.status === "string" ? REFUND_STATUS[r.status] : null) ??
            REFUND_EVENT_STATUS[type] ??
            "PENDING";
        return {
            refund: {
                providerRefundId: id,
                providerPaymentId: payment,
                amountPaise: paise(r.amount),
                status,
            },
        };
    }
    if (type.startsWith("payment.dispute.")) {
        const d = body.payload?.dispute?.entity;
        const id = typeof d?.id === "string" ? d.id : null;
        const payment = typeof d?.payment_id === "string" ? d.payment_id : null;
        if (!d || !id || !payment) return {};
        const fromType = type.slice("payment.dispute.".length);
        const raw =
            typeof d.status === "string" && d.status ? d.status : fromType;
        return {
            dispute: {
                providerDisputeId: id,
                providerPaymentId: payment,
                amountPaise: paise(d.amount),
                status: (raw === "created" ? "open" : raw).toUpperCase(),
                reason:
                    typeof d.reason_code === "string" ? d.reason_code : null,
            },
        };
    }
    return {};
}
