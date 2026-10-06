import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { fromMinor, toMinor, toMoneyString } from "../../common/money";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import { onHandoverLabel } from "./checkout-readiness";
import type { FulfilmentType } from "./fulfilment";
import { FULFILMENT_RULES, shipsToAddress, typeOf } from "./fulfilment";

/**
 * The order confirmation on a merchant's site (round-2 P4), under
 * `public/sites/:siteId/checkout/orders/:orderId/confirmation`: what the
 * customer who just paid reads at `/shop/order/<ref>` on the business's own
 * domain, after the bag sheet's "Order placed".
 *
 * - **Theirs alone.** Behind the customer session for this very site, and
 *   only an order this account placed online (`customerAccountId`, set by
 *   the site's checkout). Another customer's, another business's, a desk
 *   order and a made-up id are the same 404.
 * - **Only once placed.** An order still being paid, closed unpaid, or
 *   refused and refunded is not an order yet (B1): 404, and the bag sheet
 *   keeps telling that story. A placed order that was refunded later still
 *   reads, as its Track does. An order placed to be paid on handover is
 *   placed from the start, and reads until it is cancelled, saying it is
 *   still to be paid.
 * - **Only what the customer gave or is owed.** Items, amounts, how it
 *   leaves and where: the storefront's pick-up address, or the delivery
 *   address they typed. Never staff notes, stock or payment ids.
 *
 * No receipt email is sent when a site order is placed, so this says
 * nothing about one; the page never claims an email that didn't go.
 */

export interface ConfirmationLine {
    name: string;
    /** "Large", or null for a product with no options. */
    variant: string | null;
    quantity: number;
    /** The line's amount, "500.00". */
    amount: string;
}

export interface CheckoutConfirmation {
    orderNumber: string;
    /** ISO time it was placed (paid), else when it was made. */
    placedAt: string;
    currency: string;
    lines: ConfirmationLine[];
    subtotal: string;
    /** Delivery or shipping, "60.00"; null when it adds nothing. */
    delivery: string | null;
    /** Taken off at checkout, "50.00"; null when nothing was. */
    discount: string | null;
    total: string;
    fulfilment: {
        type: FulfilmentType;
        /** "Pick-up", "Local delivery", "Shipping". */
        label: string;
        /** Pick-up: where to collect it. */
        pickup: { name: string; address: string | null } | null;
        /** Delivery and shipping: where it goes, as they typed it. */
        deliverTo: {
            name: string | null;
            lines: string[];
        } | null;
    };
    /** Refunded after it was placed: said, never hidden. */
    refunded: boolean;
    /**
     * Placed to be paid on handover and not paid yet: "Pay when you
     * collect" or "Pay on delivery". Null once paid, and for an order
     * paid online.
     */
    toPay: string | null;
}

/** What the read selects, and all {@link confirmationView} needs. */
export interface ConfirmationRow {
    orderId: string;
    createdAt: Date;
    paidAt: Date | null;
    currency: string;
    subtotal: { toString(): string };
    shipping: { toString(): string };
    discount: { toString(): string };
    total: { toString(): string };
    paymentStatus: string;
    payOnHandover?: boolean;
    fulfilment: string;
    deliveryName: string | null;
    deliveryLine1: string | null;
    deliveryLine2: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    deliveryPostalCode: string | null;
    store: { name: string; settings: { address: string | null } | null };
    items: {
        quantity: number;
        price: { toString(): string };
        product: { name: string } | null;
        service: { name: string } | null;
        variant: { title: string } | null;
    }[];
}

const clean = (value: string | null | undefined): string | null => {
    const t = value?.trim();
    if (!t) return null;
    return t;
};

/** A money amount, or null when it is zero. */
function unlessZero(value: { toString(): string }): string | null {
    return toMinor(value) === 0 ? null : toMoneyString(value);
}

/** The confirmation, from the row. Pure. */
export function confirmationView(row: ConfirmationRow): CheckoutConfirmation {
    const type = typeOf(row.fulfilment);
    const goes = shipsToAddress(type);
    const cityLine = [clean(row.deliveryCity), clean(row.deliveryState)]
        .filter(Boolean)
        .join(", ");
    const cityAndPin = [cityLine || null, clean(row.deliveryPostalCode)]
        .filter(Boolean)
        .join(" ");
    const addressLines = [
        clean(row.deliveryLine1),
        clean(row.deliveryLine2),
        cityAndPin || null,
    ].filter((l): l is string => l !== null);

    return {
        orderNumber: row.orderId,
        placedAt: (row.paidAt ?? row.createdAt).toISOString(),
        currency: row.currency,
        lines: row.items.map((item) => ({
            name: item.product?.name ?? item.service?.name ?? "Item",
            variant: clean(item.variant?.title),
            quantity: item.quantity,
            amount: fromMinor(toMinor(item.price) * item.quantity),
        })),
        subtotal: toMoneyString(row.subtotal),
        delivery: unlessZero(row.shipping),
        discount: unlessZero(row.discount),
        total: toMoneyString(row.total),
        fulfilment: {
            type,
            label: FULFILMENT_RULES[type].label,
            pickup:
                type === "PICKUP"
                    ? {
                          name: row.store.name,
                          address: clean(row.store.settings?.address),
                      }
                    : null,
            deliverTo:
                goes && addressLines.length > 0
                    ? { name: clean(row.deliveryName), lines: addressLines }
                    : null,
        },
        refunded: row.paymentStatus === "REFUNDED",
        toPay:
            row.payOnHandover && row.paymentStatus === "UNPAID"
                ? (onHandoverLabel(type) ?? "Pay when it reaches you")
                : null,
    };
}

/** Placed: paid, or paid and refunded since (never a refused checkout). */
const PLACED = ["PAID", "REFUNDED"];

@Injectable()
export class CheckoutConfirmationService {
    /** The confirmation of an order this customer placed on this site. */
    async confirmation(
        siteId: string,
        customer: CustomerContext,
        orderId: string,
    ): Promise<CheckoutConfirmation> {
        // A session for another site is no session here; the same 404 as
        // any other miss, so it says nothing about the order.
        if (customer.siteId !== siteId) throw new NotFoundException();
        const row = await runInOrgContext(customer.organizationId, () =>
            prisma.order.findFirst({
                where: {
                    id: orderId,
                    organizationId: customer.organizationId,
                    customerAccountId: customer.accountId,
                    placedOnline: true,
                    OR: [
                        { paymentStatus: { in: PLACED } },
                        {
                            payOnHandover: true,
                            paymentStatus: "UNPAID",
                            status: { not: "CANCELLED" },
                        },
                    ],
                },
                select: {
                    orderId: true,
                    createdAt: true,
                    paidAt: true,
                    currency: true,
                    subtotal: true,
                    shipping: true,
                    discount: true,
                    total: true,
                    paymentStatus: true,
                    payOnHandover: true,
                    fulfilment: true,
                    deliveryName: true,
                    deliveryLine1: true,
                    deliveryLine2: true,
                    deliveryCity: true,
                    deliveryState: true,
                    deliveryPostalCode: true,
                    store: {
                        select: {
                            name: true,
                            settings: { select: { address: true } },
                        },
                    },
                    items: {
                        orderBy: { id: "asc" },
                        select: {
                            quantity: true,
                            price: true,
                            product: { select: { name: true } },
                            service: { select: { name: true } },
                            variant: { select: { title: true } },
                        },
                    },
                },
            }),
        );
        if (!row) throw new NotFoundException("Nothing to show here");
        return confirmationView(row);
    }
}
