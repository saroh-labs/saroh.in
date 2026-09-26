/**
 * The one read of an order that Order Detail renders (ADR-008, U6, U14):
 * `GET /organizations/:org/orders/:id`. Types only, so the client screen and
 * the pure rules in `lifecycle.ts` can share them.
 *
 * Money is left out by the API — not sent for the screen to hide — for a role
 * without a money read: `money` is null, lines carry no `price`, and timeline
 * steps carry no amount. A Member at the counter reads this with
 * `order:stage` alone.
 */

export type KitchenStage =
    | "NEW"
    | "PREPARING"
    | "READY"
    | "COLLECTED"
    | "HANDED_TO_COURIER"
    | "DELIVERED";

export type Fulfilment = "COLLECT" | "DELIVERY";

export type RefundStanding = "NONE" | "PARTLY_REFUNDED" | "REFUNDED";

export interface AllergenRef {
    id: string;
    name: string;
}

export interface OrderReadLine {
    id: string;
    productId: string;
    name: string | null;
    variantTitle: string | null;
    sku: string | null;
    imageUrl: string | null;
    /** As the product says it now, by allergen id. */
    allergens: { contains: AllergenRef[]; mayContain: AllergenRef[] };
    quantity: number;
    /** Units refunded so far (pending or settled). */
    refundedQuantity: number;
    /**
     * Units a refund can still put back on the shelf: sold less what was put
     * back. 0 before it is handed over, and for an untracked product.
     */
    returnable?: number;
    /** Unit price — only with a money read. */
    price?: string;
}

export interface OrderReadEvent {
    id: string;
    /** STAGE | UNDO | EDIT | REFUND | STATUS */
    kind: string;
    at: string;
    actor: { id: string; name: string | null } | null;
    fromStage: string | null;
    toStage: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    note: string | null;
    undoneAt: string | null;
    undoesEventId: string | null;
    /** Only with a money read. */
    amountCents?: number | null;
}

export interface DeliveryAddress {
    name: string | null;
    phone: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
}

export interface OrderReadMoney {
    currency: string;
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    total: string;
    paid: string;
    refunded: string;
    due: string;
    /** Paid outside a provider — cash, a transfer — and recorded by hand. */
    recordedByHand: boolean;
    discountCode: { code: string; rule: string } | null;
    /**
     * Refunds the provider hasn't answered for yet: the money is held (and
     * counted in `refunded`) until it does. Each can be tried again — the
     * API asks the provider first, so nothing is sent twice.
     */
    refundsBeingConfirmed: { id: string; amount: string }[];
    /**
     * Paid on an edit's charge that a later edit replaced: not counted in
     * `paid`, and owed back to the customer until a refund for it is on
     * record. Absent from an API older than #508.
     */
    owedBack?: { id: string; amount: string }[];
}

export interface OrderReadInvoice {
    id: string;
    number: string | null;
    /** INVOICE | CREDIT_NOTE | SUPPLEMENTARY */
    kind: string;
    status: string;
}

export interface OrderRead {
    id: string;
    /** The storefront's own number, e.g. "1063". */
    orderId: string;
    placedAt: string;
    updatedAt: string;
    store: { id: string; name: string };
    status: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
    paymentStatus: "UNPAID" | "PAID" | "FAILED" | "REFUNDED";
    refundStanding: RefundStanding;
    stage: KitchenStage;
    fulfilment: Fulfilment;
    customer: {
        id: string;
        name: string | null;
        phone: string | null;
        /** Only with `order:read`. */
        email?: string;
        /** The contact this customer is confirmed as, if linked. */
        contactId: string | null;
        orderCount: number;
        firstOrderAt: string | null;
    } | null;
    deliveryAddress: DeliveryAddress | null;
    notes: string | null;
    trackingUrl: string | null;
    items: OrderReadLine[];
    events: OrderReadEvent[];
    next: {
        stages: KitchenStage[];
        undo: { eventId: string; until: string } | null;
        editable: boolean;
    };
    money: OrderReadMoney | null;
    /** Null for a role without `invoice:read`. */
    invoices: OrderReadInvoice[] | null;
}

/** A customer note that names allergens, from the contact's detail read. */
export interface AllergyNote {
    body: string;
    allergens: AllergenRef[];
}
