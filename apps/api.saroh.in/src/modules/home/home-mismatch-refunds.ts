import type { prisma } from "@saroh/database";
import { Prisma } from "@saroh/database";

import { CAPTURED_NEEDS_REFUND } from "../invoices/invoice-state";
import { AMOUNT_MISMATCH } from "../payments/capture-mismatch";

import {
    MISMATCH_ATTEMPT_WHERE,
    owedOf,
    refundedAttempts,
} from "../payments/mismatch-refund";
import type { HomeEvidence } from "./home-model";
import { personName } from "./home-model";
import { refundReasonWords } from "./home-money-sources";

type Db = Pick<typeof prisma, "paymentAttempt" | "paymentRefund">;

/**
 * The most mismatches read at once. They are rare — the provider enforces
 * the amount it was asked for (PAY-06) — so this only bounds a read gone
 * wrong.
 */
const READ_LIMIT = 200;

/**
 * Invoice payments captured but not applied — the invoice was already paid
 * or void when the money arrived — and not yet refunded. A capture taken at
 * the wrong amount is left out: {@link mismatchesOwed} lists it on its own
 * row, never twice. Spelled with explicit null branches: in SQL, NOT of a
 * JSON path a row lacks is null, not true, and would drop an attempt that
 * recorded no reason (no response, or one without `invoiceStatus`).
 */
export function invoiceRefundsOwedWhere(organizationId: string) {
    return {
        organizationId,
        invoiceId: { not: null },
        status: "SUCCEEDED",
        attempts: {
            some: {
                status: CAPTURED_NEEDS_REFUND,
                OR: [
                    { rawResponse: { equals: Prisma.AnyNull } },
                    {
                        rawResponse: {
                            path: ["invoiceStatus"],
                            equals: Prisma.AnyNull,
                        },
                    },
                    {
                        NOT: {
                            rawResponse: {
                                path: ["invoiceStatus"],
                                equals: AMOUNT_MISMATCH,
                            },
                        },
                    },
                ],
            },
        },
        refunds: { none: { status: { in: ["PENDING", "SUCCEEDED"] } } },
    } satisfies Prisma.PaymentIntentWhereInput;
}

/** A mismatch owed back, as Home's refunds-owed row shows it. */
export interface MismatchOwedRow extends HomeEvidence {
    /** When the money came, for ordering beside the other refunds owed. */
    sortAt: Date;
}

/**
 * Captures taken at a different amount than asked (PAY-06) that no refund
 * on its way or done has handed back yet, oldest first — whatever their
 * intent's status: an order or invoice a mismatch failed to pay is FAILED,
 * and the money is still the customer's. One row per captured payment, at
 * what it captured (what is owed back), with the order or invoice it was
 * taken for. The row's id is the attempt's: "Refund" acts on it
 * (`home-inline.ts`).
 */
export async function mismatchesOwed(
    db: Db,
    organizationId: string,
): Promise<{ count: number; rows: MismatchOwedRow[] }> {
    const [attempts, refunded] = await Promise.all([
        db.paymentAttempt.findMany({
            where: { organizationId, ...MISMATCH_ATTEMPT_WHERE },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: READ_LIMIT,
            select: {
                id: true,
                createdAt: true,
                rawResponse: true,
                paymentIntent: {
                    select: {
                        currency: true,
                        amountCents: true,
                        invoice: {
                            select: {
                                id: true,
                                number: true,
                                billToName: true,
                            },
                        },
                        order: {
                            select: {
                                id: true,
                                orderId: true,
                                walkInName: true,
                                customer: {
                                    select: {
                                        firstName: true,
                                        lastName: true,
                                        email: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }),
        refundedAttempts(db, organizationId),
    ]);
    const words = refundReasonWords("AMOUNT_MISMATCH");
    const rows: MismatchOwedRow[] = [];
    for (const a of attempts) {
        if (refunded.has(a.id)) continue;
        const intent = a.paymentIntent;
        const owed = owedOf(a.rawResponse, intent.currency);
        const paper = paperOf(intent);
        rows.push({
            id: a.id,
            title: paper.title,
            subtitle: paper.who ? `${paper.who} · ${words}` : words,
            at: a.createdAt.toISOString(),
            // What was captured is what goes back; a mismatch that recorded
            // no amount shows none rather than the intent's.
            amountMinor: owed?.amountCents ?? null,
            currency: owed?.currency ?? null,
            href: paper.href,
            sortAt: a.createdAt,
        });
    }
    return { count: rows.length, rows };
}

/** The order or invoice a mismatch was taken for, and who paid it. */
function paperOf(intent: {
    invoice: {
        id: string;
        number: string | null;
        billToName: string | null;
    } | null;
    order: {
        id: string;
        orderId: string;
        walkInName: string | null;
        customer: {
            firstName: string | null;
            lastName: string | null;
            email: string | null;
        } | null;
    } | null;
}): { title: string; who: string | null; href: string } {
    const { order, invoice } = intent;
    if (order) {
        const walkIn = order.walkInName?.trim() ?? "";
        return {
            title: `#${order.orderId}`,
            who:
                (order.customer ? personName(order.customer) : null) ??
                (walkIn.length > 0 ? walkIn : null),
            href: `/commerce/orders/${order.id}`,
        };
    }
    if (invoice) {
        const name = invoice.billToName?.trim() ?? "";
        return {
            title: invoice.number ?? "Invoice",
            who: name.length > 0 ? name : null,
            href: `/billing/invoices/${invoice.id}`,
        };
    }
    // The ₹1 check that sets up autopay (DEC-064): on no order or invoice.
    return {
        title: "Autopay check",
        who: null,
        href: "/billing/subscriptions",
    };
}
