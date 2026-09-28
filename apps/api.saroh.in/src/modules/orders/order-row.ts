import { fromMinor, toMoneyString } from "../../common/money";
import { contactEmailForDisplay } from "../contacts/contact-email";
import {
    isRemovedStoreCustomer,
    REMOVED_CUSTOMER_NAME,
} from "../customers/anonymise-customer";
import type { FulfilmentView, LateThresholds, LateView } from "./fulfilment";
import { fulfilmentView, lateOf } from "./fulfilment";
import type { OrderAttention, OrderAttentionTag } from "./order-attention";
import { attentionTags } from "./order-attention";
import { lineName } from "./order-line";
import type { PaymentStanding } from "./order-list-filters";
import { paymentStandingOf } from "./order-list-filters";
import type { OrderReadDto } from "./order-read";
import { amountDueCents } from "./order-read";
import type { OrderStage } from "./order-stage";
import { orderStanding } from "./order-standing";
import { walkInOf } from "./walk-in";

/**
 * One row of the Orders list (plan B, B1) — built here and only here, so the
 * list and the quick view (B5) say the same thing about an order.
 *
 * What a caller may not see is left out by the API, not sent for a screen to
 * hide (DEC-024): money (`total`, `unpaidAmount`) only with `order:read`, and
 * a customer's phone and email only with `contact:read`.
 *
 * B2a adds how it leaves: the type, its `steps` and `stepIndex`
 * (`fulfilment.ts`). B2b adds whether it is late (`late`,
 * `lateBy`, `lateAfterMinutes`, by the rule in `fulfilment.ts`, the same one
 * the Late filter runs in SQL) and the courier. B15 adds `attention`: the
 * customer's Needs attention this viewer may see (`order-attention.ts`). B5 adds when the order's pay link was made, for the row
 * menu's "New pay link" (never the link: only its hash is kept), and the
 * quick view's projection of the order read (`quickViewOf`).
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
    /**
     * A walk-in (B13): no customer record, only the name they gave, and
     * their phone (only with `contact:read`). Null when `customer` is set.
     */
    walkIn: { name: string; phone: string | null } | null;
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
    /**
     * When the order's pay link was made (B11); null when it has none. Only
     * with `order:read`. Never the link: only its hash is kept.
     */
    payLinkCreatedAt?: Date | null;
    /**
     * The customer's Needs attention this viewer may see (B15), in order:
     * Allergy first. Empty when there is none; null when it couldn't be read
     * (the app then says "Not available", never nothing). A sensitive entry
     * is here only for a viewer who may read sensitive entries.
     */
    attention?: OrderAttentionTag[] | null;
}

/** What `order-list.ts` loads for each row. */
export interface RawOrderRow {
    id: string;
    orderId: string;
    customerId: string | null;
    walkInName?: string | null;
    walkInPhone?: string | null;
    status: string;
    paymentStatus: string;
    stage: string;
    fulfilment: string;
    currency: string;
    total: DecimalLike;
    createdAt: Date;
    courierName: string | null;
    trackingNumber: string | null;
    /** When its pay link was made (B11); absent where it isn't loaded. */
    payLinkCreatedAt?: Date | null;
    store: { id: string; name: string };
    customer: {
        email: string;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
    } | null;
    items: {
        product: { name: string } | null;
        service?: { name: string } | null;
    }[];
    /** A treatment's balance recorded by hand (E9): nothing is due. */
    balanceByHand?: boolean;
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
    /**
     * The thresholds the order's storefront sets (B17); the defaults when
     * absent. The list reads them once per storefront in the page.
     */
    lateThresholds?: LateThresholds;
    /**
     * The customer's Needs attention as this viewer may see it (B15); null
     * when it couldn't be read. Absent, the row carries no `attention`.
     */
    attention?: OrderAttention | null;
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
        const name = lineName(item);
        if (name && !names.includes(name)) names.push(name);
    }
    const customerName = [order.customer?.firstName, order.customer?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    // Their details were removed for a privacy request (C11): the order
    // stays, under "Removed customer", with no email to show.
    const removed = isRemovedStoreCustomer(order.customer);
    const shownEmail = contactEmailForDisplay(order.customer?.email);

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
        customer:
            order.customer && order.customerId
                ? {
                      id: order.customerId,
                      name: removed
                          ? REMOVED_CUSTOMER_NAME
                          : customerName || null,
                      ...(view.contact
                          ? {
                                // Never a placeholder (B13b).
                                ...(removed || !shownEmail
                                    ? {}
                                    : { email: shownEmail }),
                                phone: order.customer.phone,
                            }
                          : {}),
                  }
                : null,
        walkIn: walkInOf(order, view.contact),
        status: order.status,
        paymentStatus: order.paymentStatus,
        stage: order.stage,
        // The type, and its steps with where the order stands on them.
        ...fulfilmentView(order.fulfilment, order.stage as OrderStage),
        // Late by the threshold its storefront sets for its type (B17), on
        // the same clock as the page's Late filter.
        ...lateOf(
            {
                fulfilment: order.fulfilment,
                stage: order.stage,
                status: order.status,
                paymentStatus: order.paymentStatus,
                placedAt: order.createdAt,
            },
            view.now,
            view.lateThresholds,
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
                  payLinkCreatedAt: order.payLinkCreatedAt ?? null,
              }
            : {}),
        itemCount: order.items.length,
        productNames: names.slice(0, 2),
        moreProducts: Math.max(0, names.length - 2),
        courierName: order.courierName,
        trackingNumber: order.trackingNumber,
        ...(view.attention === undefined
            ? {}
            : {
                  attention: view.attention
                      ? attentionTags(view.attention)
                      : null,
              }),
    };
}

/**
 * The order read as the Orders list's quick view asks for it (B5,
 * `GET :orderId?view=quick`). Order Detail's read already leaves out what
 * the caller may not see — the customer's phone and email without
 * `contact:read` (review #19), money without a money read — so opening a row
 * never shows more of the customer than the row did. Kept as the quick
 * view's one seam, and to hold that line should the read ever widen.
 */
export function quickViewOf(
    read: OrderReadDto,
    view: Pick<RowView, "contact">,
): OrderReadDto {
    if (view.contact) return read;
    const walkIn = read.walkIn ? { ...read.walkIn, phone: null } : null;
    if (!read.customer) return { ...read, walkIn };
    const { phone: _phone, email: _email, ...customer } = read.customer;
    return { ...read, customer: { ...customer, phone: null }, walkIn };
}
