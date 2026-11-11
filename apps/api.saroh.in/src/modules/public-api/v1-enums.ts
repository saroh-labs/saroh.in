import type {
    BOOKING_STATES,
    BOOKING_STATUSES,
    ENQUIRY_STATUSES,
    FULFILMENTS,
    HOLD_PAY,
    PAY_BY,
    PAYMENT_PROVIDERS,
    PLAN_INTERVALS,
    PLAN_STATUSES,
    BOOKING_OUTCOMES as PUBLIC_BOOKING_OUTCOMES,
    ORDER_STAGES as PUBLIC_ORDER_STAGES,
    ORDER_STATUSES as PUBLIC_ORDER_STATUSES,
    PAYMENT_STATUSES as PUBLIC_PAYMENT_STATUSES,
    POST_STATUSES as PUBLIC_POST_STATUSES,
    PRODUCT_STATUSES as PUBLIC_PRODUCT_STATUSES,
    SERVICE_STATUSES as PUBLIC_SERVICE_STATUSES,
    REFUND_STATUSES,
} from "@saroh/api-contract";
import type { PaymentProvider } from "@saroh/database";

import type { RefundStatus } from "../bookings/booking-cancel";
import type { HoldState } from "../bookings/booking-hold";
import type { BookingOutcome, ServiceStatus } from "../bookings/dto";
import type { PostStatus } from "../content/dto";
import type { LeadStatus } from "../leads/dto";
import type { CheckoutPayment } from "../orders/checkout-readiness";
import type {
    FulfilmentType,
    OrderStage,
    OrderStatus,
    PaymentStatus,
} from "../orders/dto";
import type { ProductStatus } from "../products/dto";
import type { PlanListStatus } from "../subscriptions/dto";
import type { Interval } from "../subscriptions/periods";

/**
 * The public API's enum values (plan 2026-11-10-001, review #3): one table
 * per field from Saroh's own value to the published lower_snake_case one.
 * Each table is a `Record` over the internal type, so a value added inside
 * Saroh fails to compile, and `v1-enums.spec.ts` fails, until it is mapped.
 */

type Values<T extends readonly string[]> = T[number];

export interface PublicEnum<I extends string, P extends string> {
    readonly field: string;
    readonly table: Readonly<Record<I, P>>;
    /** Saroh's value as published; throws on one no table names. */
    out(value: string): P;
    /** A published value a caller sent, as Saroh's own. */
    in(value: P): I;
}

function publicEnum<I extends string, P extends string>(
    field: string,
    table: Record<I, P>,
): PublicEnum<I, P> {
    const back = new Map<string, I>(
        (Object.entries(table) as [I, P][]).map(([i, p]) => [p, i]),
    );
    return {
        field,
        table,
        out(value) {
            if (!Object.prototype.hasOwnProperty.call(table, value)) {
                // Publishing a value the contract doesn't list would break a
                // client's exhaustive switch; fail loudly here instead.
                throw new Error(`${field}: no public value for "${value}"`);
            }
            return table[value as I];
        },
        in(value) {
            const internal = back.get(value);
            if (internal === undefined) {
                throw new Error(`${field}: no value for "${value}"`);
            }
            return internal;
        },
    };
}

export const orderStatus = publicEnum<
    OrderStatus,
    Values<typeof PUBLIC_ORDER_STATUSES>
>("order.status", {
    PENDING: "pending",
    PROCESSING: "processing",
    SHIPPED: "shipped",
    DELIVERED: "delivered",
    CANCELLED: "cancelled",
});

// PARTIALLY_REFUNDED is read by the cancel (order-cancel.service.ts) though
// nothing writes it today; it is mapped so an old row never fails a read.
export const paymentStatus = publicEnum<
    PaymentStatus | "PARTIALLY_REFUNDED",
    Values<typeof PUBLIC_PAYMENT_STATUSES>
>("order.paymentStatus", {
    UNPAID: "unpaid",
    PAID: "paid",
    FAILED: "failed",
    PARTIALLY_REFUNDED: "partially_refunded",
    REFUNDED: "refunded",
});

export const orderStage = publicEnum<
    OrderStage,
    Values<typeof PUBLIC_ORDER_STAGES>
>("order.stage", {
    NEW: "new",
    PREPARING: "preparing",
    READY: "ready",
    COLLECTED: "collected",
    HANDED_TO_COURIER: "handed_to_courier",
    OUT_FOR_DELIVERY: "out_for_delivery",
    DELIVERED: "delivered",
    SENT: "sent",
});

export const orderFulfilment = publicEnum<
    FulfilmentType,
    Values<typeof FULFILMENTS>
>("order.fulfilment", {
    PICKUP: "pickup",
    LOCAL_DELIVERY: "local_delivery",
    SHIPPING: "shipping",
    DIGITAL: "digital",
    APPOINTMENT_IN_PERSON: "appointment_in_person",
    APPOINTMENT_ONLINE: "appointment_online",
});

/** `Booking.status` is a text column; its values are schema.prisma's comment. */
export const bookingStatus = publicEnum<
    "PENDING" | "CONFIRMED" | "CANCELLED",
    Values<typeof BOOKING_STATUSES>
>("booking.status", {
    PENDING: "pending",
    CONFIRMED: "confirmed",
    CANCELLED: "cancelled",
});

export const bookingOutcome = publicEnum<
    BookingOutcome,
    Values<typeof PUBLIC_BOOKING_OUTCOMES>
>("booking.outcome", { ATTENDED: "attended", NO_SHOW: "no_show" });

export const refundStatus = publicEnum<
    RefundStatus,
    Values<typeof REFUND_STATUSES>
>("booking.money.refund.status", {
    SENT: "sent",
    CONFIRMING: "confirming",
    REFUSED: "refused",
});

export const productStatus = publicEnum<
    ProductStatus,
    Values<typeof PUBLIC_PRODUCT_STATUSES>
>("product.status", {
    DRAFT: "draft",
    PUBLISHED: "published",
    ARCHIVED: "archived",
});

export const serviceStatus = publicEnum<
    ServiceStatus,
    Values<typeof PUBLIC_SERVICE_STATUSES>
>("service.status", { ACTIVE: "active", ARCHIVED: "archived" });

export const postStatus = publicEnum<
    PostStatus,
    Values<typeof PUBLIC_POST_STATUSES>
>("post.status", {
    DRAFT: "draft",
    PUBLISHED: "published",
    ARCHIVED: "archived",
});

export const planStatus = publicEnum<
    PlanListStatus,
    Values<typeof PLAN_STATUSES>
>("subscriptionPlan.status", {
    DRAFT: "draft",
    ACTIVE: "active",
    ARCHIVED: "archived",
});

export const planInterval = publicEnum<Interval, Values<typeof PLAN_INTERVALS>>(
    "subscriptionPlan.interval",
    { WEEK: "week", MONTH: "month", QUARTER: "quarter", YEAR: "year" },
);

export const enquiryStatus = publicEnum<
    LeadStatus,
    Values<typeof ENQUIRY_STATUSES>
>("enquiry.status", { OPEN: "open", WON: "won", LOST: "lost" });

// ── Storefront ──────────────────────────────────────────────────────────────

export const bookingState = publicEnum<
    HoldState,
    Values<typeof BOOKING_STATES>
>("storefront.booking.state", {
    HELD: "held",
    CONFIRMED: "confirmed",
    RELEASED: "released",
    CANCELLED: "cancelled",
});

export const payBy = publicEnum<CheckoutPayment, Values<typeof PAY_BY>>(
    "storefront.order.payBy",
    { ONLINE: "online", ON_HANDOVER: "on_handover" },
);

export const holdPay = publicEnum<"NOW" | "DEPOSIT", Values<typeof HOLD_PAY>>(
    "storefront.hold.pay",
    { NOW: "now", DEPOSIT: "deposit" },
);

export const paymentProvider = publicEnum<
    PaymentProvider,
    Values<typeof PAYMENT_PROVIDERS>
>("storefront.payment.provider", {
    STRIPE: "stripe",
    RAZORPAY: "razorpay",
    CASHFREE: "cashfree",
    DODO: "dodo",
});

/** Every table, for `v1-enums.spec.ts`. */
export const PUBLIC_ENUMS = [
    orderStatus,
    paymentStatus,
    orderStage,
    orderFulfilment,
    bookingStatus,
    bookingOutcome,
    refundStatus,
    productStatus,
    serviceStatus,
    postStatus,
    planStatus,
    planInterval,
    enquiryStatus,
    bookingState,
    payBy,
    holdPay,
    paymentProvider,
] as const;
