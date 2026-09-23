import { toMoneyString } from "../../common/money";
import { refundStanding } from "./order-refunds";
import type { OrderFulfilment, OrderStage } from "./order-stage";
import { canEditItems, nextStages, UNDO_WINDOW_MS } from "./order-stage";

/**
 * The one read of an order that Order Detail renders (ADR-008, U6, U14): the
 * kitchen view — lines, stage, timeline, fulfilment, address, notes — and,
 * ONLY for a role that may read money, the money.
 *
 * Money is left out here, by the API, not sent for the screen to hide
 * (ADR-008, "No money figures without a money read"). A Member at the
 * counter holds `order:stage` and no money read, so `money` is null, lines
 * carry no price, and timeline steps carry no amount.
 */

interface DecimalLike {
    toString(): string;
}

export interface OrderEventDto {
    id: string;
    kind: string;
    at: Date;
    actor: { id: string; name: string | null } | null;
    fromStage: string | null;
    toStage: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    /** Set when this step was undone. */
    undoneAt: Date | null;
    /** On an UNDO step: the step it reversed. */
    undoesEventId: string | null;
    /** Money this step moved, minor units — only with a money read. */
    amountCents?: number | null;
}

/** One allergen from the storefront's own list (#483), by id and name. */
export interface AllergenRef {
    id: string;
    name: string;
}

export interface OrderLineDto {
    id: string;
    productId: string;
    name: string | null;
    variantTitle: string | null;
    /**
     * What the product says it contains and may contain, as it says it NOW —
     * the allergy banner checks these ids against the customer's notes
     * (ADR-008, "notes carry structured allergens"). Kitchen data, so every
     * role that reads the order gets it.
     */
    allergens: { contains: AllergenRef[]; mayContain: AllergenRef[] };
    quantity: number;
    /** Units refunded so far (pending or settled). */
    refundedQuantity: number;
    /** Unit price — only with a money read. */
    price?: string;
}

export interface DeliveryAddressDto {
    name: string | null;
    phone: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
}

export interface OrderMoneyDto {
    currency: string;
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    total: string;
    /** Taken from the customer, across every successful payment. */
    paid: string;
    /** Handed back (pending or settled). */
    refunded: string;
    /** Still to collect: an order edited up, or never paid. */
    due: string;
    discountCode: { code: string; rule: string } | null;
}

export interface OrderReadDto {
    id: string;
    orderId: string;
    placedAt: Date;
    updatedAt: Date;
    store: { id: string; name: string };
    status: string;
    paymentStatus: string;
    /** NONE | PARTLY_REFUNDED | REFUNDED — derived from refund sums. */
    refundStanding: "NONE" | "PARTLY_REFUNDED" | "REFUNDED";
    stage: string;
    fulfilment: string;
    customer: {
        id: string;
        name: string | null;
        phone: string | null;
        /** Only with `order:read` — the kitchen needs a name, not an inbox. */
        email?: string;
        /**
         * The contact this store customer is confirmed as (a
         * `CustomerIdentityLink`), where one is — the key to the customer
         * read, whose notes name allergens. Null when unlinked: an email
         * match is never taken as the same person (ADR-008).
         */
        contactId: string | null;
        /** Orders this customer has placed here, this one included. */
        orderCount: number;
        /** When their first order was placed. */
        firstOrderAt: Date | null;
    } | null;
    /** Null when no address was ever given. */
    deliveryAddress: DeliveryAddressDto | null;
    notes: string | null;
    trackingUrl: string | null;
    items: OrderLineDto[];
    events: OrderEventDto[];
    /** What the caller may do next, worked out by the API. */
    next: {
        /** The stages this order can move to now. */
        stages: string[];
        /** The step an Undo would reverse now, and until when. */
        undo: { eventId: string; until: Date } | null;
        /** Items, address and fulfilment can still change. */
        editable: boolean;
    };
    /** Null for a role without a money read. */
    money: OrderMoneyDto | null;
    /**
     * The order's paper (ADR-008): its invoice, then the credit notes and
     * supplementary invoices that correct it. Null for a role without
     * `invoice:read` — invoice ids and numbers go only to it.
     */
    invoices: OrderInvoiceDto[] | null;
}

export interface OrderInvoiceDto {
    id: string;
    number: string | null;
    /** INVOICE | CREDIT_NOTE | SUPPLEMENTARY */
    kind: string;
    status: string;
}

export interface RawOrderRead {
    id: string;
    orderId: string;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    paymentStatus: string;
    stage: string;
    fulfilment: string;
    currency: string;
    subtotal: DecimalLike;
    tax: DecimalLike;
    shipping: DecimalLike;
    discount: DecimalLike;
    total: DecimalLike;
    notes: string | null;
    trackingUrl: string | null;
    deliveryName: string | null;
    deliveryPhone: string | null;
    deliveryLine1: string | null;
    deliveryLine2: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    deliveryPostalCode: string | null;
    store: { id: string; name: string };
    invoices?: OrderInvoiceDto[];
    customer: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        phone: string | null;
        identityLinks?: { contactId: string }[];
        orders?: { createdAt: Date }[];
        _count?: { orders: number };
    } | null;
    items: {
        id: string;
        productId: string;
        quantity: number;
        price: DecimalLike;
        product: {
            name: string;
            allergens?: {
                kind: string;
                allergen: { id: string; name: string };
            }[];
        } | null;
        variant: { title: string } | null;
        refundLines: { quantity: number; amountCents: number }[];
    }[];
    events: {
        id: string;
        kind: string;
        actorUserId: string | null;
        fromStage: string | null;
        toStage: string | null;
        fromStatus: string | null;
        toStatus: string | null;
        note: string | null;
        amountCents: number | null;
        undoneAt: Date | null;
        undoesEventId: string | null;
        createdAt: Date;
    }[];
    /** SUCCEEDED payments only, with their non-failed refunds. */
    paymentIntents: {
        amountCents: number;
        refunds: { amountCents: number; forEdit: boolean }[];
    }[];
    discountRedemption?: {
        code: string;
        kind: string;
        percentBps: number | null;
        ruleAmount: DecimalLike | null;
        currency: string;
    } | null;
}

export interface ReadOptions {
    /** The caller holds a money read (`payment:read`). */
    money: boolean;
    /** The caller holds `order:read` (customer email). */
    fullRead: boolean;
    /** The caller holds `invoice:read` (the order's paper). */
    invoiceRead?: boolean;
    /** Names for the people on the timeline. */
    actors: ReadonlyMap<string, string | null>;
    now: Date;
}

const cents = (v: DecimalLike) => Math.round(Number(v.toString()) * 100);
const money = (c: number) => (c / 100).toFixed(2);

function ruleOf(r: NonNullable<RawOrderRead["discountRedemption"]>): string {
    if (r.kind === "PERCENTAGE" && r.percentBps !== null) {
        return `${(r.percentBps / 100).toFixed(2).replace(/\.?0+$/, "")}% off`;
    }
    return r.ruleAmount
        ? `${toMoneyString(r.ruleAmount)} ${r.currency} off`
        : "Amount off";
}

/** A product's allergen rows, split by kind and in the list's own order. */
export function allergensOf(
    rows: { kind: string; allergen: { id: string; name: string } }[],
): OrderLineDto["allergens"] {
    const pick = (kind: string) =>
        rows
            .filter((r) => r.kind === kind)
            .map((r) => ({ id: r.allergen.id, name: r.allergen.name }));
    return { contains: pick("CONTAINS"), mayContain: pick("MAY_CONTAIN") };
}

/** The step an Undo would reverse now, if any. */
export function undoableStep(
    events: RawOrderRead["events"],
    now: Date,
): { eventId: string; until: Date } | null {
    if (events.length === 0) return null;
    const latest = events[events.length - 1];
    if (latest.kind !== "STAGE" || latest.undoneAt) return null;
    const until = new Date(latest.createdAt.getTime() + UNDO_WINDOW_MS);
    return until.getTime() >= now.getTime()
        ? { eventId: latest.id, until }
        : null;
}

export function serializeOrderRead(
    order: RawOrderRead,
    opts: ReadOptions,
): OrderReadDto {
    const capturedCents = order.paymentIntents.reduce(
        (s, p) => s + p.amountCents,
        0,
    );
    const refundedCents = order.paymentIntents.reduce(
        (s, p) => s + p.refunds.reduce((r, x) => r + x.amountCents, 0),
        0,
    );
    const stage = order.stage as OrderStage;
    const address: DeliveryAddressDto = {
        name: order.deliveryName,
        phone: order.deliveryPhone,
        line1: order.deliveryLine1,
        line2: order.deliveryLine2,
        city: order.deliveryCity,
        state: order.deliveryState,
        postalCode: order.deliveryPostalCode,
    };
    const hasAddress = Object.values(address).some((v) => v !== null);
    const name = order.customer
        ? [order.customer.firstName, order.customer.lastName]
              .filter(Boolean)
              .join(" ")
              .trim()
        : "";

    return {
        id: order.id,
        orderId: order.orderId,
        placedAt: order.createdAt,
        updatedAt: order.updatedAt,
        store: order.store,
        status: order.status,
        paymentStatus: order.paymentStatus,
        refundStanding: refundStanding(
            order.paymentStatus,
            capturedCents,
            refundedCents,
        ),
        stage: order.stage,
        fulfilment: order.fulfilment,
        customer: order.customer
            ? {
                  id: order.customer.id,
                  name: name || null,
                  phone: order.customer.phone,
                  ...(opts.fullRead ? { email: order.customer.email } : {}),
                  contactId:
                      order.customer.identityLinks?.[0]?.contactId ?? null,
                  orderCount: order.customer._count?.orders ?? 1,
                  firstOrderAt: order.customer.orders?.[0]?.createdAt ?? null,
              }
            : null,
        deliveryAddress: hasAddress ? address : null,
        notes: order.notes,
        trackingUrl: order.trackingUrl,
        items: order.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            name: i.product?.name ?? null,
            variantTitle: i.variant?.title ?? null,
            allergens: allergensOf(i.product?.allergens ?? []),
            quantity: i.quantity,
            refundedQuantity: i.refundLines.reduce((s, r) => s + r.quantity, 0),
            ...(opts.money ? { price: toMoneyString(i.price) } : {}),
        })),
        events: order.events.map((e) => ({
            id: e.id,
            kind: e.kind,
            at: e.createdAt,
            actor: e.actorUserId
                ? {
                      id: e.actorUserId,
                      name: opts.actors.get(e.actorUserId) ?? null,
                  }
                : null,
            fromStage: e.fromStage,
            toStage: e.toStage,
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            note: e.note,
            undoneAt: e.undoneAt,
            undoesEventId: e.undoesEventId,
            ...(opts.money ? { amountCents: e.amountCents } : {}),
        })),
        next: {
            stages: nextStages({
                stage,
                status: order.status,
                paymentStatus: order.paymentStatus,
                fulfilment: order.fulfilment as OrderFulfilment,
            }),
            undo: undoableStep(order.events, opts.now),
            editable: canEditItems({
                stage,
                status: order.status,
                paymentStatus: order.paymentStatus,
            }),
        },
        invoices: opts.invoiceRead ? (order.invoices ?? []) : null,
        money: opts.money
            ? {
                  currency: order.currency,
                  subtotal: toMoneyString(order.subtotal),
                  tax: toMoneyString(order.tax),
                  shipping: toMoneyString(order.shipping),
                  discount: toMoneyString(order.discount),
                  total: toMoneyString(order.total),
                  paid: money(capturedCents),
                  refunded: money(refundedCents),
                  due: money(amountDueCents(order, capturedCents)),
                  discountCode: order.discountRedemption
                      ? {
                            code: order.discountRedemption.code,
                            rule: ruleOf(order.discountRedemption),
                        }
                      : null,
              }
            : null,
    };
}

/**
 * What is still to collect on an order: its total less what was taken, where
 * money handed back because the order was edited DOWN counts as never taken
 * (the total already dropped by it). A line refund does not make money due —
 * the customer is not asked to pay again for what was refunded.
 */
export function amountDueCents(
    order: {
        total: DecimalLike;
        paymentStatus: string;
        status: string;
        paymentIntents: {
            amountCents: number;
            refunds: { amountCents: number; forEdit?: boolean }[];
        }[];
    },
    capturedCents?: number,
): number {
    if (order.status === "CANCELLED" || order.paymentStatus === "REFUNDED") {
        return 0;
    }
    const captured =
        capturedCents ??
        order.paymentIntents.reduce((s, p) => s + p.amountCents, 0);
    const editRefunds = order.paymentIntents.reduce(
        (s, p) =>
            s +
            p.refunds
                .filter((r) => r.forEdit)
                .reduce((t, r) => t + r.amountCents, 0),
        0,
    );
    return Math.max(0, cents(order.total) - (captured - editRefunds));
}
