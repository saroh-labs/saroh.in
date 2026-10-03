import type { prisma } from "@saroh/database";

import { providerName } from "../payments/mandate-rules";
import type { HomeAction, HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT, personName } from "./home-model";

type Db = Pick<typeof prisma, "paymentRefund">;

/**
 * Order refunds the provider failed (B9, DEC-067): a cancel or a refund is
 * done once the provider accepts it, and the order reads "Refund on its
 * way" until the provider's webhook confirms it. A refund the provider then
 * fails (`REFUND_FAILED`, the webhook marks the row FAILED) leaves the
 * customer's money with the business — DEC-026: an unsure or failed answer
 * holds the money — so it becomes a Needs you row until someone refunds the
 * order again: a later refund of the same order that hasn't failed clears
 * it, and one that fails too raises it again.
 *
 * The caller has checked `order:read` (the row says an amount). A staff
 * member's Home reads only their storefronts' orders (F11, `storeIds`).
 */
export async function failedOrderRefunds(
    db: Db,
    organizationId: string,
    storeIds?: readonly string[] | null,
): Promise<HomeAction | null> {
    const failed = await db.paymentRefund.findMany({
        where: {
            organizationId,
            status: "FAILED",
            paymentIntent: {
                orderId: { not: null },
                ...(storeIds
                    ? { order: { storeId: { in: [...storeIds] } } }
                    : {}),
            },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
            id: true,
            amountCents: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
            paymentIntent: {
                select: {
                    provider: true,
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
    });
    if (failed.length === 0) return null;

    // Refunded again since, and that one hasn't failed: it's in hand.
    const orderIds = [
        ...new Set(
            failed.flatMap((r) =>
                r.paymentIntent.order ? [r.paymentIntent.order.id] : [],
            ),
        ),
    ];
    const later = await db.paymentRefund.findMany({
        where: {
            organizationId,
            status: { not: "FAILED" },
            paymentIntent: { orderId: { in: orderIds } },
        },
        select: {
            createdAt: true,
            paymentIntent: { select: { orderId: true } },
        },
    });
    const open = failed.filter((r) => {
        const order = r.paymentIntent.order;
        if (!order) return false;
        return !later.some(
            (l) =>
                l.paymentIntent.orderId === order.id &&
                l.createdAt.getTime() > r.createdAt.getTime(),
        );
    });
    if (open.length === 0) return null;

    const evidence: HomeEvidence[] = open.slice(0, EVIDENCE_LIMIT).map((r) => {
        const order = r.paymentIntent.order;
        const provider = providerName(r.paymentIntent.provider);
        const walkIn = order?.walkInName?.trim() ?? "";
        const who =
            (order?.customer ? personName(order.customer) : null) ??
            (walkIn.length > 0 ? walkIn : null);
        return {
            id: r.id,
            title: `#${order?.orderId ?? ""}`,
            subtitle: who,
            at: r.updatedAt.toISOString(),
            amountMinor: r.amountCents,
            currency: r.currency,
            // Order Detail, with the refund panel open (B5's arrival).
            href: `/commerce/orders/${order?.id ?? ""}?panel=refund`,
            tag: "Refund failed",
            tone: "bad",
            detail: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} couldn't send it back. The money is still with you.`,
        };
    });

    return {
        code: "COMMERCE_REFUNDS_FAILED",
        title:
            open.length === 1
                ? "A refund didn't go through"
                : `${open.length} refunds didn't go through`,
        href: open.length === 1 ? evidence[0].href : "/commerce/orders",
        severity: "ATTENTION",
        moduleKey: "COMMERCE",
        count: open.length,
        evidence,
        tone: "bad",
    };
}
