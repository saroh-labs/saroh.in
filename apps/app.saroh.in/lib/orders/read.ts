import type {
    AttentionKind,
    AttentionSource,
} from "@/lib/customer-workspace/attention";
import type { NoticeReach } from "@/lib/messages/notice-reach";

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
    | "DELIVERED"
    // Local delivery's handover and Digital's done step (DEC-045); the API
    // writes them from the switch release (B2c) on.
    | "OUT_FOR_DELIVERY"
    | "SENT";

/** The six ways an order leaves (DEC-045). */
export type FulfilmentType =
    | "PICKUP"
    | "LOCAL_DELIVERY"
    | "SHIPPING"
    | "DIGITAL"
    | "APPOINTMENT_IN_PERSON"
    | "APPOINTMENT_ONLINE";

/**
 * A step of the order's type as the API words it ("Out for delivery"), and
 * the stage it stands for. The app draws these and keeps no copy of the
 * table (`orders/fulfilment.ts` in the API).
 */
export interface FulfilmentStep {
    stage: KitchenStage;
    label: string;
}

/** How an order leaves, as every order read and row answers it. */
export interface FulfilmentFields {
    fulfilmentType: FulfilmentType;
    /** "Pick-up", "Local delivery"… */
    fulfilmentLabel: string;
    steps: FulfilmentStep[];
    /** Where on `steps` the order stands. */
    stepIndex: number;
    /** What the printed ticket is called; null when nothing is printed. */
    ticketName: string | null;
    /**
     * Whether it is late, worked out by the API from when it was placed and
     * its type's threshold (DEC-045; the storefront's own from B17). The
     * app keeps no threshold of its own. Absent from an API before B2b.
     */
    late?: boolean;
    /** Whole minutes past the threshold; null when not late. */
    lateBy?: number | null;
    /** The threshold, in minutes; null for a type that is never late. */
    lateAfterMinutes?: number | null;
    /** Who took it and their number (B2b); null until given. */
    courierName?: string | null;
    trackingNumber?: string | null;
}

export type RefundStanding = "NONE" | "PARTLY_REFUNDED" | "REFUNDED";

export interface AllergenRef {
    id: string;
    name: string;
}

export interface OrderReadLine {
    id: string;
    /** Null on a treatment's line (E9, DEC-050): it bills a service. */
    productId: string | null;
    /** The service a treatment's line bills; absent from an API before E9. */
    serviceId?: string | null;
    /** What the line bills; absent from an API before E9 (a product). */
    kind?: "product" | "service";
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
     * Refunds the provider accepted and hasn't confirmed yet (B9, DEC-067):
     * counted in `refunded`, and said "Refund on its way" until its webhook
     * confirms it. Absent from an API before it.
     */
    refundsOnTheWay?: { id: string; amount: string }[];
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
    /**
     * What the paper is called (D15): "Tax invoice", "Bill of supply",
     * "Receipt"… Absent from an API before it; the money card then works
     * it out as it used to.
     */
    title?: string;
}

/** How one visit of a treatment stands (B14): Attended, Booked, Missed, Not booked. */
export type VisitState = "ATTENDED" | "BOOKED" | "MISSED" | "TO_BOOK";

export interface OrderVisit {
    number: number;
    /** Its booking; null while it is still to book. */
    bookingId: string | null;
    startAt: string | null;
    endAt: string | null;
    staffName: string | null;
    where: "IN_PERSON" | "ONLINE";
    state: VisitState;
    attendedAt: string | null;
    attendedBy: { id: string; name: string | null } | null;
}

/** A treatment's visits (B14, E9), as the API reads them for the Visits card. */
export interface OrderVisits {
    total: number;
    attended: number;
    booked: number;
    service: {
        id: string;
        name: string;
        durationMinutes: number;
        timezone: string;
        priceCents: number | null;
    };
    visits: OrderVisit[];
    next: {
        /** Can be marked attended now: booked and started. */
        attend: number | null;
        /** Booked, not started yet. */
        upcoming: { number: number; startAt: string } | null;
        /** To book next, when no booked visit waits. */
        book: number | null;
    };
    done: boolean;
    /** Cancelled or refunded: nothing more is booked or marked. */
    closed: boolean;
}

export interface OrderRead extends FulfilmentFields {
    id: string;
    /** The storefront's own number, e.g. "1063". */
    orderId: string;
    placedAt: string;
    /**
     * Placed by the customer at the site's checkout (G13). Optional: an API
     * from before it sends none.
     */
    placedOnline?: boolean;
    /**
     * Placed on the website to be paid when it is collected or delivered
     * ("Pay when you collect", "Pay on delivery"): it is made and brought
     * first, and handed over once marked paid. Absent from an older API.
     */
    payOnHandover?: boolean;
    /**
     * Days a pay-on-handover order has waited, unpaid and not handed over,
     * from the third on in the business's zone (R34); null otherwise.
     * Absent from an older API.
     */
    uncollectedDays?: number | null;
    updatedAt: string;
    store: { id: string; name: string };
    status: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
    paymentStatus: "UNPAID" | "PAID" | "FAILED" | "REFUNDED";
    refundStanding: RefundStanding;
    stage: KitchenStage;
    customer: {
        id: string;
        name: string | null;
        /** Their own phone: null without `contact:read` (review #19). */
        phone: string | null;
        /** Only with `contact:read` (review #19); a Member holding it sees it. */
        email?: string;
        /** The contact this customer is confirmed as, if linked. */
        contactId: string | null;
        orderCount: number;
        firstOrderAt: string | null;
    } | null;
    /**
     * A walk-in (B13): no customer record, only the name they gave and their
     * phone (with `contact:read`). Optional: an API before B13 sends none.
     */
    walkIn?: { name: string; phone: string | null } | null;
    deliveryAddress: DeliveryAddress | null;
    notes: string | null;
    trackingUrl: string | null;
    /**
     * When the order's pay link was made (B11); null when it has none.
     * Never the link: only its hash is kept, so it is shown once, to whoever
     * makes it. Only with `order:read`; absent from an API before B11.
     */
    payLinkCreatedAt?: string | null;
    items: OrderReadLine[];
    events: OrderReadEvent[];
    next: {
        stages: KitchenStage[];
        undo: { eventId: string; until: string } | null;
        editable: boolean;
        /**
         * "Change how it's fulfilled…" (B9): the ways it can take now, its
         * own among them, and why it can't change when it can't. Absent
         * from an API before B9.
         */
        fulfilment?: {
            options: { type: FulfilmentType; label: string }[];
            refusal: string | null;
        };
        /** "Cancel order…" (B9): why not, and whether one waits on its refund. */
        cancel?: { refusal: string | null; pending: boolean };
        /** A note in the customer's messages would reach them (A13). */
        tell?: boolean;
    };
    money: OrderReadMoney | null;
    /** Null for a role without `invoice:read`. */
    invoices: OrderReadInvoice[] | null;
    /**
     * The customer's Needs attention this viewer may see (B15). Null when
     * the API couldn't read it; absent from an API before B15.
     */
    attention?: OrderAttention | null;
    /**
     * How its Ready and handover reach the customer (A14): emailed, in
     * their account, or nothing. Null when the API couldn't read it;
     * absent from an API before A14.
     */
    customerNotice?: NoticeReach | null;
    /**
     * A treatment's visits (B14). Absent on an order that isn't one (and
     * from an API before B14); null when the API couldn't read them.
     */
    visits?: OrderVisits | null;
}

/** One Needs attention entry, as the order read carries it (B15). */
export interface OrderAttentionEntry {
    id: string;
    kind: AttentionKind;
    label: string;
    detail: string | null;
    sensitive: boolean;
    allergen: AllergenRef | null;
    /** Every allergen of the entry's name in the business, to match lines. */
    matchAllergens: AllergenRef[];
    source: AttentionSource;
}

export interface OrderAttention {
    entries: OrderAttentionEntry[];
    /** Entries on the person this viewer may not see. */
    hiddenSensitiveCount: number;
}

/**
 * One of the customer's allergies as the allergy check reads it: a Needs
 * attention Allergy entry's words and the allergens it matches
 * (`allergyNotesOf`). Notes carry text only since Z2a.
 */
export interface AllergyNote {
    body: string;
    allergens: AllergenRef[];
}
