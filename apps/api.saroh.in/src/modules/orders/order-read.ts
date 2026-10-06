import { toMoneyString } from "../../common/money";
import { contactEmailForDisplay } from "../contacts/contact-email";
import {
    isRemovedStoreCustomer,
    REMOVED_CUSTOMER_NAME,
} from "../customers/anonymise-customer";
import type { InvoiceTitle } from "../invoices/invoice-title";
import type { FulfilmentView, LateThresholds, LateView } from "./fulfilment";
import { fulfilmentView, lateOf } from "./fulfilment";
import { handPaidCents } from "./hand-payments";
import type { OrderAttention } from "./order-attention";
import type { ChangeOptions } from "./order-change-types";
import type { RawOrderInvoice } from "./order-invoice-title";
import { orderInvoiceTitle } from "./order-invoice-title";
import type { OrderLineKind } from "./order-line";
import { isServiceLine, lineKind, lineName } from "./order-line";
import { refundStanding } from "./order-refunds";
import type { OrderFulfilment, OrderStage } from "./order-stage";
import { canEditItems, nextStages, UNDO_WINDOW_MS } from "./order-stage";
import type { OrderVisitsDto } from "./order-visits";
import { walkInOf } from "./walk-in";

/**
 * The one read of an order that Order Detail renders (ADR-008, U6, U14): the
 * kitchen view — lines, stage, timeline, fulfilment, address, notes — and,
 * ONLY for a role that may read money, the money.
 *
 * Money is left out here, by the API, not sent for the screen to hide
 * (ADR-008, "No money figures without a money read"). A Member at the
 * counter holds `order:stage` and no money read, so `money` is null, lines
 * carry no price, and timeline steps carry no amount.
 *
 * The customer's own phone and email go only to a caller holding
 * `contact:read` (review #19), on this read, the list's rows and the quick
 * view alike: a Member holding `contact:read` sees both. The delivery
 * address's phone is the order's, not the customer's record: whoever works
 * the order sees it, since a local delivery can't go out without it.
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
    /** Null on a service line (E9): it bills `serviceId` instead. */
    productId: string | null;
    /** The service a treatment's line bills (E9, DEC-050); null otherwise. */
    serviceId: string | null;
    /** What the line bills, so the screen doesn't branch on ids. */
    kind: OrderLineKind;
    /** The product's name, or the service's. */
    name: string | null;
    variantTitle: string | null;
    /** The variant's SKU, where the line names a variant. */
    sku: string | null;
    /** The variant's photo, else the product's cover. */
    imageUrl: string | null;
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
    /**
     * Units a refund can still put back on the shelf ("Put N back in
     * stock", #511): what the line sold less what refunds, pending or
     * settled, put back. 0 before it is handed over, and for a product that
     * counts no stock.
     */
    returnable: number;
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
    /**
     * Taken from the customer, across every successful payment and every
     * payment recorded by hand (`hand-payments.ts`).
     */
    paid: string;
    /** Handed back (pending or settled). */
    refunded: string;
    /** Still to collect: an order edited up, or never paid. */
    due: string;
    /**
     * Paid, with no payment taken through a provider: the money moved
     * outside Saroh (cash at the counter, a transfer) and was recorded by
     * hand, so `paid` is what was recorded rather than a provider sum.
     */
    recordedByHand: boolean;
    discountCode: { code: string; rule: string } | null;
    /**
     * Refunds whose provider answer was lost (#508): the money is held, and
     * counted in `refunded`, until the provider says. Each can be tried
     * again — the API looks at the provider before it sends anything.
     */
    refundsBeingConfirmed: { id: string; amount: string }[];
    /**
     * Refunds the provider accepted and hasn't confirmed yet (B9, DEC-067):
     * counted in `refunded` — a cancel is done once the provider takes the
     * refund — and said "Refund on its way" until its webhook confirms it.
     * One the provider then fails leaves this list and `refunded`, and
     * raises a Needs you row (`home-refunds-failed.ts`).
     */
    refundsOnTheWay: { id: string; amount: string }[];
    /**
     * Money a customer paid on an edit's charge that a later edit replaced
     * (#508, U8): not counted in `paid`, owed back to them until a refund
     * for it is on record.
     */
    owedBack: { id: string; amount: string }[];
}

export interface OrderReadDto extends FulfilmentView, LateView {
    id: string;
    orderId: string;
    placedAt: Date;
    /** Placed by the customer at the site's checkout (G13). */
    placedOnline: boolean;
    /**
     * Placed at the site's checkout to be paid when it is collected or
     * delivered ("Pay when you collect", "Pay on delivery"): staff take the
     * money at the handover and mark it paid.
     */
    payOnHandover: boolean;
    /**
     * Days a pay-on-handover order has waited, unpaid and not handed over,
     * from the third on in the business's zone (R34, `uncollected.ts`);
     * null otherwise. Set by Order Detail's read only.
     */
    uncollectedDays?: number | null;
    updatedAt: Date;
    store: { id: string; name: string };
    status: string;
    paymentStatus: string;
    /** NONE | PARTLY_REFUNDED | REFUNDED — derived from refund sums. */
    refundStanding: "NONE" | "PARTLY_REFUNDED" | "REFUNDED";
    stage: string;
    customer: {
        id: string;
        name: string | null;
        /** Their own phone: null without `contact:read` (review #19). */
        phone: string | null;
        /** Only with `contact:read` (review #19). */
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
    /**
     * A walk-in (B13): someone served at the counter with no customer
     * record, so `customer` is null. Their phone, like a customer's own,
     * only with `contact:read`. Null on every order with a customer.
     */
    walkIn: { name: string; phone: string | null } | null;
    /** Null when no address was ever given. */
    deliveryAddress: DeliveryAddressDto | null;
    notes: string | null;
    trackingUrl: string | null;
    /**
     * Who took it and its number, typed at the handover to a courier or
     * added after it (DEC-045); null until then.
     */
    courierName: string | null;
    trackingNumber: string | null;
    /**
     * When the order's pay link was made (B11); null when it has none. Never
     * the link — only its hash is kept. Only with `order:read`.
     */
    payLinkCreatedAt?: Date | null;
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
    } & Partial<ChangeOptions>;
    /** Null for a role without a money read. */
    money: OrderMoneyDto | null;
    /**
     * The order's paper (ADR-008): its invoice, then the credit notes and
     * supplementary invoices that correct it. Null for a role without
     * `invoice:read` — invoice ids and numbers go only to it.
     */
    invoices: OrderInvoiceDto[] | null;
    /**
     * The customer's Needs attention this caller may see (B15): sensitive
     * entries only to a caller who may read them, the rest to whoever reads
     * the order, the kitchen included. Null when it couldn't be read, so
     * the screen says so rather than showing nothing.
     */
    attention?: OrderAttention | null;
    /**
     * A treatment's visits (B14, E9): the Visits card and what the header
     * offers next. Absent on an order that isn't one; null when they
     * couldn't be read, so the card says so.
     */
    visits?: OrderVisitsDto | null;
}

export interface OrderInvoiceDto {
    id: string;
    number: string | null;
    /** INVOICE | CREDIT_NOTE | SUPPLEMENTARY */
    kind: string;
    status: string;
    /**
     * What the paper is called (D15, `invoice-title.ts`): a registered
     * business's paper whose every line is exempt is a "Bill of supply".
     */
    title: InvoiceTitle;
}

export interface RawOrderRead {
    id: string;
    orderId: string;
    createdAt: Date;
    placedOnline?: boolean;
    payOnHandover?: boolean;
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
    /** Taken outside Saroh and recorded on it (`hand-payments.ts`). */
    paidByHand?: DecimalLike | null;
    notes: string | null;
    trackingUrl: string | null;
    courierName: string | null;
    trackingNumber: string | null;
    payLinkCreatedAt?: Date | null;
    walkInName?: string | null;
    walkInPhone?: string | null;
    deliveryName: string | null;
    deliveryPhone: string | null;
    deliveryLine1: string | null;
    deliveryLine2: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    deliveryPostalCode: string | null;
    store: { id: string; name: string };
    invoices?: RawOrderInvoice[];
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
        productId: string | null;
        serviceId?: string | null;
        service?: { name: string } | null;
        quantity: number;
        price: DecimalLike;
        product: {
            name: string;
            image?: string | null;
            allergens?: {
                kind: string;
                allergen: { id: string; name: string };
            }[];
        } | null;
        variant: {
            title: string;
            sku?: string;
            image?: string | null;
            photo?: { url: string } | null;
        } | null;
        refundLines: {
            quantity: number;
            amountCents: number;
            putBackQuantity?: number;
        }[];
        /** What the line took off its shelf when fulfilled (#511). */
        soldQuantity?: number;
        stockLevelId?: string | null;
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
    /**
     * Paid, with part of it recorded by hand: a treatment's balance taken at
     * the clinic after its deposit online (E9, `treatment-ledger.ts`).
     */
    balanceByHand?: boolean;
    /** SUCCEEDED payments only, with their non-failed refunds. */
    paymentIntents: {
        amountCents: number;
        refunds: {
            id: string;
            amountCents: number;
            forEdit: boolean;
            status: string;
            providerRefundId: string | null;
        }[];
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
    /** The caller holds a money read (`order:read` or `payment:read`). */
    money: boolean;
    /** The caller holds `order:read` (the pay link's date). */
    fullRead: boolean;
    /**
     * The caller holds `contact:read`: the customer's own phone and email
     * (review #19). Never the delivery phone, which the order needs.
     */
    contact: boolean;
    /**
     * The customer's Needs attention as the caller may see it (B15); null
     * when it couldn't be read. Absent, the read carries none.
     */
    attention?: OrderAttention | null;
    /** The caller holds `invoice:read` (the order's paper). */
    invoiceRead?: boolean;
    /** Names for the people on the timeline. */
    actors: ReadonlyMap<string, string | null>;
    now: Date;
    /** The thresholds the order's storefront sets (B17); defaults if absent. */
    lateThresholds?: LateThresholds;
    /** Payments on superseded edit charges not yet handed back. */
    owedBack?: { id: string; amountCents: number }[];
    /**
     * What each line can put back on the shelf (`returnableUnits`, #511):
     * counts returns recorded by hand and products that stopped counting.
     * Without it, sold less what refunds put back.
     */
    returnable?: ReadonlyMap<string, number>;
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
    // Recorded by hand: marked paid with no provider payment behind it.
    const byHand =
        (order.paymentStatus === "PAID" ||
            order.paymentStatus === "REFUNDED") &&
        order.paymentIntents.length === 0;
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
    // Their details were removed for a privacy request (C11).
    const removed = isRemovedStoreCustomer(order.customer);
    const shownEmail = contactEmailForDisplay(order.customer?.email);
    const name = removed
        ? REMOVED_CUSTOMER_NAME
        : order.customer
          ? [order.customer.firstName, order.customer.lastName]
                .filter(Boolean)
                .join(" ")
                .trim()
          : "";

    return {
        id: order.id,
        orderId: order.orderId,
        placedAt: order.createdAt,
        placedOnline: order.placedOnline ?? false,
        payOnHandover: order.payOnHandover ?? false,
        updatedAt: order.updatedAt,
        // Only who it is: the settings row the late rule read stays here.
        store: { id: order.store.id, name: order.store.name },
        status: order.status,
        paymentStatus: order.paymentStatus,
        refundStanding: refundStanding(
            order.paymentStatus,
            capturedCents,
            refundedCents,
        ),
        stage: order.stage,
        // The type, its steps and where it stands (fulfilment.ts); the
        // app draws these and keeps no copy.
        ...fulfilmentView(order.fulfilment, stage),
        // Late by the threshold its storefront sets for its type (B17): the
        // rule the Orders list's Late filter runs, so the two never disagree.
        ...lateOf(
            {
                fulfilment: order.fulfilment,
                stage: order.stage,
                status: order.status,
                paymentStatus: order.paymentStatus,
                placedAt: order.createdAt,
            },
            opts.now,
            opts.lateThresholds,
        ),
        customer: order.customer
            ? {
                  id: order.customer.id,
                  name: name || null,
                  phone: opts.contact ? order.customer.phone : null,
                  // Never a placeholder: a walk-in kept by their phone
                  // (B13b) has no email to show.
                  ...(opts.contact && !removed && shownEmail
                      ? { email: shownEmail }
                      : {}),
                  contactId:
                      order.customer.identityLinks?.[0]?.contactId ?? null,
                  orderCount: order.customer._count?.orders ?? 1,
                  firstOrderAt: order.customer.orders?.[0]?.createdAt ?? null,
              }
            : null,
        walkIn: walkInOf(
            { ...order, customerId: order.customer?.id ?? null },
            opts.contact,
        ),
        deliveryAddress: hasAddress ? address : null,
        notes: order.notes,
        trackingUrl: order.trackingUrl,
        courierName: order.courierName,
        trackingNumber: order.trackingNumber,
        ...(opts.fullRead
            ? { payLinkCreatedAt: order.payLinkCreatedAt ?? null }
            : {}),
        items: order.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            serviceId: i.serviceId ?? null,
            kind: lineKind(i),
            name: lineName(i),
            variantTitle: i.variant?.title ?? null,
            sku: i.variant?.sku ?? null,
            imageUrl:
                i.variant?.photo?.url ??
                i.variant?.image ??
                i.product?.image ??
                null,
            allergens: allergensOf(i.product?.allergens ?? []),
            quantity: i.quantity,
            refundedQuantity: i.refundLines.reduce((s, r) => s + r.quantity, 0),
            returnable:
                opts.returnable?.get(i.id) ??
                (i.stockLevelId
                    ? Math.max(
                          0,
                          (i.soldQuantity ?? 0) -
                              i.refundLines.reduce(
                                  (s, r) => s + (r.putBackQuantity ?? 0),
                                  0,
                              ),
                      )
                    : 0),
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
                payOnHandover: order.payOnHandover ?? false,
            }),
            undo: undoableStep(order.events, opts.now),
            // A treatment's order changes through its visits (E9).
            editable:
                canEditItems({
                    stage,
                    status: order.status,
                    paymentStatus: order.paymentStatus,
                }) && !order.items.some(isServiceLine),
        },
        // Only who each document is: a read may load more of them.
        invoices: opts.invoiceRead
            ? (order.invoices ?? []).map((i) => ({
                  id: i.id,
                  number: i.number,
                  kind: i.kind,
                  status: i.status,
                  title: orderInvoiceTitle(i, opts.now),
              }))
            : null,
        money: opts.money
            ? {
                  currency: order.currency,
                  subtotal: toMoneyString(order.subtotal),
                  tax: toMoneyString(order.tax),
                  shipping: toMoneyString(order.shipping),
                  discount: toMoneyString(order.discount),
                  total: toMoneyString(order.total),
                  paid: order.balanceByHand
                      ? toMoneyString(order.total)
                      : money(capturedCents + handPaidCents(order)),
                  refunded: money(refundedCents),
                  due: money(amountDueCents(order, capturedCents)),
                  recordedByHand: byHand,
                  refundsBeingConfirmed: order.paymentIntents.flatMap((p) =>
                      p.refunds.flatMap((r) =>
                          r.status === "PENDING" && !r.providerRefundId
                              ? [{ id: r.id, amount: money(r.amountCents) }]
                              : [],
                      ),
                  ),
                  refundsOnTheWay: order.paymentIntents.flatMap((p) =>
                      p.refunds.flatMap((r) =>
                          r.status === "PENDING" && r.providerRefundId
                              ? [{ id: r.id, amount: money(r.amountCents) }]
                              : [],
                      ),
                  ),
                  owedBack: (opts.owedBack ?? []).map((p) => ({
                      id: p.id,
                      amount: money(p.amountCents),
                  })),
                  discountCode: order.discountRedemption
                      ? {
                            code: order.discountRedemption.code,
                            rule: ruleOf(order.discountRedemption),
                        }
                      : null,
              }
            : null,
        ...(opts.attention === undefined ? {} : { attention: opts.attention }),
    };
}

/**
 * What is still to collect on an order: its total less what was taken —
 * online or recorded by hand (`hand-payments.ts`) — where money handed back
 * because the order was edited DOWN counts as never taken (the total
 * already dropped by it). A line refund does not make money due — the
 * customer is not asked to pay again for what was refunded.
 */
export function amountDueCents(
    order: {
        total: DecimalLike;
        paymentStatus: string;
        status: string;
        paidByHand?: DecimalLike | null;
        paymentIntents: {
            amountCents: number;
            refunds: { amountCents: number; forEdit?: boolean }[];
        }[];
        /** A treatment's balance recorded by hand (E9): nothing is due. */
        balanceByHand?: boolean;
    },
    capturedCents?: number,
): number {
    if (
        order.status === "CANCELLED" ||
        order.paymentStatus === "REFUNDED" ||
        order.balanceByHand
    ) {
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
    return Math.max(
        0,
        cents(order.total) - (captured - editRefunds) - handPaidCents(order),
    );
}
