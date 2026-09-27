import { fromMinor, toMoneyString } from "../../common/money";
import type { FulfilmentView, LateView } from "./fulfilment";
import { fulfilmentView, lateOf } from "./fulfilment";
import type { PaymentStanding } from "./order-list-filters";
import { paymentStandingOf } from "./order-list-filters";
import { amountDueCents } from "./order-read";
import type { OrderStage } from "./order-stage";
import { orderStanding } from "./order-standing";

/**
 * One row of the Orders list (plan B, B1) — built here and only here, so the
 * list and the quick view (B5) say the same thing about an order.
 *
 * What a caller may not see is left out by the API, not sent for a screen to
 * hide (DEC-024): money (`total`, `unpaidAmount`) only with `order:read`, and
 * a customer's phone and email only with `contact:read`.
 *
 * B2a adds how it leaves: the legacy word and the type, its `steps` and
 * `stepIndex` (`fulfilment.ts`). B2b adds whether it is late (`late`,
 * `lateBy`, `lateAfterMinutes`, by the rule in `fulfilment.ts`, the same one
 * the Late filter runs in SQL) and the courier. B15 adds `attention`, with no
 * stand-in here.
 */

interface DecimalLike {
    toString(): string;
}

export interface OrderRowDto extends FulfilmentView, LateView {
    id: string;
    /** The storefront's own order number, e.g. "1042". */
    orderId: string;
    /** When it was placed (`Order.createdAt`). */
    placedAt: Date;
    /** Whole minutes since it was placed, at the moment of the read. */
    ageMinutes: number;
    store: { id: string; name: string };
    customer: {
        id: string;
        name: string | null;
        /** Only with `contact:read`. */
        email?: string;
        /** Only with `contact:read`. */
        phone?: string | null;
    } | null;
    status: string;
    paymentStatus: string;
    stage: string;
    /** Today's one-word standing, for the screens that still draw it. */
    standing: ReturnType<typeof orderStanding>;
    /** Paid, not paid yet, partly refunded or refunded. */
    payment: PaymentStanding;
    currency: string;
    /** Only with `order:read`. */
    total?: string;
    /** Still to collect ("0.00" when nothing is); only with `order:read`. */
    unpaidAmount?: string;
    /** How many lines the order has. */
    itemCount: number;
    /** The first two products' names, in line order. */
    productNames: string[];
    /** How many more products there are past those two ("+N"). */
    moreProducts: number;
    /** Who took it, typed at the handover to a courier; else null. */
    courierName: string | null;
    trackingNumber: string | null;
}

/** What `order-list.ts` loads for each row. */
export interface RawOrderRow {
    id: string;
    orderId: string;
    customerId: string;
    status: string;
    paymentStatus: string;
    stage: string;
    fulfilment: string;
    currency: string;
    total: DecimalLike;
    createdAt: Date;
    courierName: string | null;
    trackingNumber: string | null;
    store: { id: string; name: string };
    customer: {
        email: string;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
    } | null;
    items: { product: { name: string } | null }[];
    /** SUCCEEDED payments only, with their non-failed refunds. */
    paymentIntents: {
        amountCents: number;
        refunds: { amountCents: number; forEdit: boolean }[];
    }[];
}

export interface RowView {
    /** `order:read`: the order's money. */
    money: boolean;
    /** `contact:read`: the customer's phone and email. */
    contact: boolean;
    now: Date;
}

export function serializeOrderRow(
    order: RawOrderRow,
    view: RowView,
): OrderRowDto {
    const captured = order.paymentIntents.reduce(
        (s, p) => s + p.amountCents,
        0,
    );
    const refunded = order.paymentIntents.reduce(
        (s, p) => s + p.refunds.reduce((r, x) => r + x.amountCents, 0),
        0,
    );
    // Marked paid by hand, with no provider payment behind it: nothing is
    // due, as Order Detail's money card says.
    const byHand =
        (order.paymentStatus === "PAID" ||
            order.paymentStatus === "REFUNDED") &&
        order.paymentIntents.length === 0;
    const names: string[] = [];
    for (const item of order.items) {
        const name = item.product?.name;
        if (name && !names.includes(name)) names.push(name);
    }
    const customerName = [order.customer?.firstName, order.customer?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

    return {
        id: order.id,
        orderId: order.orderId,
        placedAt: order.createdAt,
        ageMinutes: Math.max(
            0,
            Math.floor(
                (view.now.getTime() - order.createdAt.getTime()) / 60_000,
            ),
        ),
        store: order.store,
        customer: order.customer
            ? {
                  id: order.customerId,
                  name: customerName || null,
                  ...(view.contact
                      ? {
                            email: order.customer.email,
                            phone: order.customer.phone,
                        }
                      : {}),
              }
            : null,
        status: order.status,
        paymentStatus: order.paymentStatus,
        stage: order.stage,
        // The legacy word (COLLECT or DELIVERY until B2d), the type, and
        // the type's steps with where the order stands on them.
        ...fulfilmentView(order.fulfilment, order.stage as OrderStage),
        // Late by the type's threshold (the defaults until B17), on the
        // same clock as the page's Late filter.
        ...lateOf(
            {
                fulfilment: order.fulfilment,
                stage: order.stage,
                status: order.status,
                paymentStatus: order.paymentStatus,
                placedAt: order.createdAt,
            },
            view.now,
        ),
        standing: orderStanding(order.status, order.paymentStatus),
        payment: paymentStandingOf(order.paymentStatus, captured, refunded),
        currency: order.currency,
        ...(view.money
            ? {
                  total: toMoneyString(order.total),
                  unpaidAmount: fromMinor(
                      byHand ? 0 : amountDueCents(order, captured),
                  ),
              }
            : {}),
        itemCount: order.items.length,
        productNames: names.slice(0, 2),
        moreProducts: Math.max(0, names.length - 2),
        courierName: order.courierName,
        trackingNumber: order.trackingNumber,
    };
}
