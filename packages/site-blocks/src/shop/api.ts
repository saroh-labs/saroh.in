import type { PaymentHandoff } from "../booking-flow/api";
import type { BagItem } from "./bag-store";

/**
 * What the bag and checkout ask of the site, and what they get back (round-2
 * G13). The sheet never calls the API itself: the site's server does, with
 * the signed relay and — to start — the customer's session from its
 * host-only cookie. So the app passes its server actions in as a
 * {@link ShopCheckoutApi}, and they answer in these shapes: plain data and
 * the page's own words, never the API's text.
 */

/** The ways an order leaves that a storefront offers. */
export type ShopWay = "PICKUP" | "LOCAL_DELIVERY" | "SHIPPING";

export type QuoteLineState = "ok" | "short" | "sold-out" | "gone";

/** One bag line as the server priced it. */
export interface QuoteLine {
    listingId: string;
    variantId: string | null;
    slug: string | null;
    name: string;
    variantTitle: string | null;
    image: { url: string; alt: string } | null;
    unitPrice: string;
    quantity: number;
    amount: string;
    state: QuoteLineState;
    available: number | null;
}

/** A way the order can leave, with what it adds. */
export interface QuoteWay {
    type: ShopWay;
    label: string;
    /** "60.00", or null when free. */
    fee: string | null;
}

/**
 * How an order is paid: online in the provider's window, or at the
 * handover — "Pay when you collect", "Pay on delivery".
 */
export type ShopPayment = "ONLINE" | "ON_HANDOVER";

/** A way to pay the chosen way of leaving can take, in the shop's words. */
export interface QuotePayment {
    type: ShopPayment;
    label: string;
}

/** The bag priced now: every amount is the server's. */
export interface CheckoutQuote {
    currency: string;
    lines: QuoteLine[];
    ways: QuoteWay[];
    fulfilment: ShopWay | null;
    subtotal: string;
    delivery: string;
    /**
     * The code typed in the bag: what it took off the lines, or why it took
     * nothing — the counter's rules (DEC-104). Null without a code; absent
     * from an API before site codes.
     */
    discount?: QuoteDiscount | null;
    /**
     * The location's "Free delivery over": the amount, and how much more the
     * items (after any code) must come to before delivery is free — null
     * once they reach it, when the delivery ways' fees read free. Null when
     * there is no amount, or no way here has a fee; absent from an older API.
     */
    freeDelivery?: QuoteFreeDelivery | null;
    total: string;
    ready: boolean;
    /**
     * How an order leaving the chosen way can be paid, online first. Empty
     * until a way is chosen; absent from an API before offline payment,
     * which takes online payment only.
     */
    payments?: QuotePayment[];
    /**
     * Where a pick-up is collected (UX-025): the place's address and
     * hours. Null when Pick-up isn't offered; absent from an older API.
     */
    pickup?: PickupPlace | null;
}

/** Free delivery over an amount, as the bag shows it. */
export interface QuoteFreeDelivery {
    /** "999.00" */
    over: string;
    /** "120.00" more to go, or null once the items reach `over`. */
    short: string | null;
}

/** A discount code as the bag shows it. */
export type QuoteDiscount =
    | { code: string; applied: true; amount: string }
    | { code: string; applied: false; reason: string; message: string };

/** A place customers visit, to collect a pick-up from. */
export interface PickupPlace {
    address: string;
    /** "Mon–Sat 10:00–19:00, Sun closed"; null when not set. */
    hours: string | null;
}

/** Where a Local delivery or a shipment goes. */
export interface DeliveryAddress {
    name?: string;
    phone?: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
}

export interface StartCheckout {
    lines: BagItem[];
    fulfilment: ShopWay;
    address?: DeliveryAddress;
    notes?: string;
    /** How it is paid; left out, online. */
    payment?: ShopPayment;
    /** A code the bag applied, judged again by the server. */
    discountCode?: string;
    /** Stable for one checkout, so a double tap starts it once. */
    key: string;
}

/**
 * A started checkout: the order and the provider's window to open — or,
 * paid at the handover, no window: the order is placed already.
 */
export interface CheckoutStarted {
    orderId: string;
    orderNumber: string;
    total: string;
    currency: string;
    /** Absent from an API before offline payment: online. */
    payBy?: ShopPayment;
    payment: PaymentHandoff | null;
}

/** How a started checkout stands while the payment is confirmed. */
export interface CheckoutStanding {
    orderNumber: string;
    /**
     * refunding: paid, but it sold out or had closed; the refund is owed
     * and being sent. refunded: the provider has taken it — on its way.
     * to-pay: placed, to be paid at the handover.
     */
    state: "paying" | "placed" | "refunding" | "refunded" | "closed" | "to-pay";
    total: string;
    currency: string;
    /** For "refunding" and "refunded": what the customer is told. */
    message: string | null;
}

/**
 * Why something couldn't be done, with the page's sentence for it.
 * - test-release: the page is a test release (DEC-071); nothing is ordered.
 * - signed-out: the session ended; sign in again.
 * - bag-changed: price it again before paying.
 * - busy: a checkout is open already, or too many tries.
 * - cant-order: the shop isn't taking orders online now.
 * - payments-down: the business's online payment failed just now; try
 *   later, or pay them another way.
 */
export type ShopProblem =
    | "signed-out"
    | "bag-changed"
    | "busy"
    | "cant-order"
    | "payments-down"
    | "invalid"
    | "error"
    | "test-release";

export type ShopResult<T> =
    { ok: true; data: T } | { ok: false; reason: ShopProblem; message: string };

/** The site's server actions, handed to the bag. */
export interface ShopCheckoutApi {
    quote(body: {
        lines: BagItem[];
        fulfilment?: ShopWay;
        discountCode?: string;
    }): Promise<ShopResult<CheckoutQuote>>;
    start(body: StartCheckout): Promise<ShopResult<CheckoutStarted>>;
    standing(orderId: string): Promise<ShopResult<CheckoutStanding>>;
}

/** The sentence when the server can't be reached at all. */
export const SHOP_OFFLINE =
    "We couldn't reach the shop — check your connection and try again.";

/** A key for one checkout: letters, digits, - and _ only. */
export function checkoutKey(): string {
    const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return id.replace(/[^A-Za-z0-9_-]/g, "");
}
