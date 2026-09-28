import { Transform, Type } from "class-transformer";
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

import {
    NewOrderCustomerInput,
    NewOrderPaymentInput,
    WalkInInput,
} from "./new-order.dto";

/** The Orders list's tabs: All · Open · Refunded (default 14). */
export const LIST_TABS = ["all", "open", "refunded"] as const;
export type ListTab = (typeof LIST_TABS)[number];

/**
 * How the money on an order stands, as one word for the row and the filter.
 * Derived from payments and refunds the way Order Detail's `refundStanding`
 * is, so the list and the order never disagree (`order-list-filters.ts`).
 */
export const PAYMENT_STANDINGS = [
    "PAID",
    "UNPAID",
    "PARTLY_REFUNDED",
    "REFUNDED",
] as const;
export type PaymentStanding = (typeof PAYMENT_STANDINGS)[number];

export const ORDER_STATUSES = [
    "PENDING",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
    "UNPAID",
    "PAID",
    "FAILED",
    "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** The kitchen stage under the status (ADR-008) — see order-stage.ts. */
export const ORDER_STAGES = [
    "NEW",
    "PREPARING",
    "READY",
    "COLLECTED",
    "HANDED_TO_COURIER",
    "DELIVERED",
    // Local delivery's handover and Digital's done step (DEC-045). Written
    // from release 2 (B2c) on; read from release 1.
    "OUT_FOR_DELIVERY",
    "SENT",
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

/**
 * The six ways an order leaves (DEC-045). Their rules are in
 * `fulfilment.ts`, which every reader goes through.
 */
export const FULFILMENT_TYPES = [
    "PICKUP",
    "LOCAL_DELIVERY",
    "SHIPPING",
    "DIGITAL",
    "APPOINTMENT_IN_PERSON",
    "APPOINTMENT_ONLINE",
] as const;
export type FulfilmentType = (typeof FULFILMENT_TYPES)[number];

/**
 * Every value `Order.fulfilment` can hold, and a client can send: the six
 * types. The legacy words COLLECT and DELIVERY went in the contract release
 * (B2d, `20261013100000_order_fulfilment_contract`); a client sending one
 * gets 400.
 */
export const ORDER_FULFILMENTS = FULFILMENT_TYPES;
export type OrderFulfilment = (typeof ORDER_FULFILMENTS)[number];

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MONEY_MSG = "Must be a number with up to 2 decimals";
const CURRENCY_RE = /^[A-Z]{3}$/;

/** The most a courier's name or a tracking number may run to (DEC-045). */
export const COURIER_FIELD_MAX = 80;

/** Where a delivery order goes (ADR-008). Every part is plain text. */
export class DeliveryAddressInput {
    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(120)
    name?: string | null;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(32)
    phone?: string | null;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Add the first line of the address" })
    @MaxLength(200)
    line1!: string;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(200)
    line2?: string | null;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Add the town or city" })
    @MaxLength(100)
    city!: string;

    /** The state — U5 reads it as the place of supply. */
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Add the state" })
    @MaxLength(100)
    state!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Add the PIN code" })
    @MaxLength(16)
    postalCode!: string;
}

export class OrderItemInput {
    @Transform(trim)
    @IsString()
    productId!: string;

    /** Required when the product has variants: the one being bought. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    variantId?: string;

    @Type(() => Number)
    @IsInt({ message: "Quantity must be a whole number" })
    @Min(1, { message: "Quantity must be at least 1" })
    quantity!: number;
}

export class CreateOrderDto {
    /**
     * The storefront's customer. One of this, `contactId`, `customer` or
     * `walkIn` names who it is for (B13); an app from before B13 sends only
     * this.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    customerId?: string;

    /** A person picked from the customer search (E4's picker, B13). */
    @IsOptional()
    @Transform(trim)
    @IsString()
    contactId?: string;

    /** Someone new, by email (B13). */
    @IsOptional()
    @ValidateNested()
    @Type(() => NewOrderCustomerInput)
    customer?: NewOrderCustomerInput;

    /** A walk-in: a name, and a phone if given; no record (B13). */
    @IsOptional()
    @ValidateNested()
    @Type(() => WalkInInput)
    walkIn?: WalkInInput;

    /**
     * How it is paid (B13). Absent, it is left unpaid, as every order was
     * before B13.
     */
    @IsOptional()
    @ValidateNested()
    @Type(() => NewOrderPaymentInput)
    payment?: NewOrderPaymentInput;

    @IsArray()
    @ArrayMinSize(1, { message: "An order needs at least one item" })
    @ValidateNested({ each: true })
    @Type(() => OrderItemInput)
    items!: OrderItemInput[];

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(MONEY_RE, { message: `Tax: ${MONEY_MSG}` })
    tax?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(MONEY_RE, { message: `Shipping: ${MONEY_MSG}` })
    shipping?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(MONEY_RE, { message: `Discount: ${MONEY_MSG}` })
    discount?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @IsString()
    @Matches(CURRENCY_RE, { message: "Currency must be a 3-letter code" })
    currency?: string;

    /**
     * A discount code. The API works out what it takes off; a client-sent
     * amount is never trusted for it. Not allowed alongside `discount`.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(32)
    discountCode?: string;

    /**
     * How it leaves (DEC-045): Pick-up by default. An appointment type is
     * refused: it is made by booking it (`fulfilment.ts`).
     */
    @IsOptional()
    @IsIn(ORDER_FULFILMENTS, { message: "Unknown way to fulfil an order" })
    fulfilment?: OrderFulfilment;

    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryAddressInput)
    address?: DeliveryAddressInput;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(1000)
    notes?: string | null;
}

/** Move an order to its next kitchen stage (`order:stage`). */
export class MoveStageDto {
    @IsIn(ORDER_STAGES, { message: "Unknown kitchen stage" })
    to!: OrderStage;

    /** The courier's tracking link — only on the handover to a courier. */
    @IsOptional()
    @Transform(trim)
    @IsUrl(
        { protocols: ["http", "https"], require_protocol: true },
        { message: "The tracking link must be a web address" },
    )
    @MaxLength(500)
    trackingUrl?: string;

    /** Who took it — only on the handover to a courier; optional. */
    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(COURIER_FIELD_MAX, {
        message: "Keep the courier's name to 80 characters",
    })
    courierName?: string | null;

    /** The courier's number for it — only on that handover; optional. */
    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(COURIER_FIELD_MAX, {
        message: "Keep the tracking number to 80 characters",
    })
    trackingNumber?: string | null;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(500)
    note?: string | null;
}

/** Undo the last kitchen step, named by its event (`order:stage`). */
export class UndoStageDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    eventId!: string;
}

/** A change to one existing line: its new quantity; 0 takes it off. */
export class OrderLineChangeInput {
    @Transform(trim)
    @IsString()
    itemId!: string;

    @IsInt({ message: "Quantity must be a whole number" })
    @Min(0, { message: "Quantity cannot be negative" })
    quantity!: number;
}

/**
 * Change an order before anyone starts on it (`order:edit`, ADR-008; B16): its
 * lines, its fulfilment and address, and its notes. Lines, fulfilment and
 * address only while it is New; notes until it is handed over or cancelled.
 *
 * The courier's name, the tracking number and the tracking link go with the
 * handover to a courier (DEC-045): they are the only fields that change
 * after it, and `order:stage` is enough for them. `null` clears one.
 */
export class EditOrderDto {
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrderLineChangeInput)
    lines?: OrderLineChangeInput[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrderItemInput)
    add?: OrderItemInput[];

    @IsOptional()
    @IsIn(ORDER_FULFILMENTS, { message: "Unknown way to fulfil an order" })
    fulfilment?: OrderFulfilment;

    /** The delivery address; `null` clears it. */
    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryAddressInput)
    address?: DeliveryAddressInput | null;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(1000)
    notes?: string | null;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(COURIER_FIELD_MAX, {
        message: "Keep the courier's name to 80 characters",
    })
    courierName?: string | null;

    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(COURIER_FIELD_MAX, {
        message: "Keep the tracking number to 80 characters",
    })
    trackingNumber?: string | null;

    @IsOptional()
    @Transform(blankToNull)
    @IsUrl(
        { protocols: ["http", "https"], require_protocol: true },
        { message: "The tracking link must be a web address" },
    )
    @MaxLength(500)
    trackingUrl?: string | null;
}

export class UpdateOrderDto {
    @IsOptional()
    @IsString()
    @IsIn(ORDER_STATUSES, { message: "Unknown order status" })
    status?: OrderStatus;

    @IsOptional()
    @IsString()
    @IsIn(PAYMENT_STATUSES, { message: "Unknown payment status" })
    paymentStatus?: PaymentStatus;
}

/** A query value that may repeat (`?stage=NEW&stage=READY`) or be a list. */
const listOf = ({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === "") return undefined;
    const parts = (Array.isArray(value) ? value : [value])
        .flatMap((v: unknown) => (typeof v === "string" ? v.split(",") : [v]))
        .map((v: unknown) =>
            typeof v === "string" ? v.trim().toUpperCase() : v,
        )
        .filter((v: unknown) => v !== "");
    return parts.length ? parts : undefined;
};
const blankToUndefined = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? undefined : t;
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Orders list's date presets (B4), read in the business's zone:
 * today, yesterday, the last 7 days (today included) and this month.
 */
export const DATE_PRESETS = ["today", "yesterday", "7d", "month"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

/**
 * `GET organizations/:org/orders` (plan B, B1): every filter applies and the
 * answer is `{ rows, counts, nextCursor }`. The bare array an app before B1
 * read without `v=2` went in the contract release (B2d); `v=2` is still
 * accepted, and changes nothing, because the app sends it.
 */
export class ListOrdersQuery {
    @IsOptional()
    @IsIn(["2"], { message: "Unknown list version" })
    v?: "2";

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
    )
    @IsIn(LIST_TABS, { message: "Unknown tab" })
    tab?: ListTab;

    @IsOptional()
    @Transform(listOf)
    @IsArray()
    @IsIn(ORDER_STAGES, { each: true, message: "Unknown step" })
    stage?: string[];

    /** The types (DEC-045). */
    @IsOptional()
    @Transform(listOf)
    @IsArray()
    @IsIn(ORDER_FULFILMENTS, {
        each: true,
        message: "Unknown way of fulfilling an order",
    })
    fulfilment?: string[];

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @IsIn(PAYMENT_STANDINGS, { message: "Unknown payment standing" })
    payment?: PaymentStanding;

    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(64)
    productId?: string;

    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(64)
    customerId?: string;

    // Blank means every storefront: an empty string would filter on a
    // storefront that cannot exist and return nothing.
    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(64)
    storeId?: string;

    /** Text, as a query string is: "true" or "false". */
    @IsOptional()
    @IsIn(["true", "false"], { message: "late is true or false" })
    late?: "true" | "false";

    /**
     * Needs attention (B15): "true" keeps the orders whose customer has an
     * entry the caller may see; "false" the others. A sensitive-only entry
     * counts only for a caller who may read sensitive entries.
     */
    @IsOptional()
    @IsIn(["true", "false"], { message: "attention is true or false" })
    attention?: "true" | "false";

    /**
     * What the row's pill says, as a key: a step's word ("ready",
     * "handed-to-courier") or "refunded" / "cancelled" (B4). The keys the
     * business's orders show come from `GET …/orders/filters`; an unknown
     * one matches nothing.
     */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
    )
    @Matches(/^[a-z0-9-]{1,40}$/, { message: "Unknown step" })
    step?: string;

    /** A date preset in the business's zone (B4); not with `from`/`to`. */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
    )
    @IsIn(DATE_PRESETS, { message: "Unknown date range" })
    date?: DatePreset;

    /** A calendar day in the business's zone. */
    @IsOptional()
    @Matches(DAY_RE, { message: "A date is YYYY-MM-DD" })
    from?: string;

    /** A calendar day in the business's zone, included. */
    @IsOptional()
    @Matches(DAY_RE, { message: "A date is YYYY-MM-DD" })
    to?: string;

    /**
     * An instant: only orders placed from it on (Home's "Last 24 hours",
     * round 2 F6). Narrows the rows and every tab count alike.
     */
    @IsOptional()
    @Transform(blankToUndefined)
    @IsISO8601({ strict: true }, { message: "since is an ISO date and time" })
    since?: string;

    /** An order number or a customer's name; phone or email with `contact:read`. */
    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(100)
    q?: string;

    /** The last row's id from the page before. */
    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(64)
    cursor?: string;

    /**
     * "true": this page is read for Export (B16), which takes
     * `order:export`. The rows are the list's own; an app before B16 sends
     * nothing and is read as the list.
     */
    @IsOptional()
    @IsIn(["true"], { message: "export is true" })
    export?: "true";
}

/**
 * `GET organizations/:org/orders/filters` (B4): what the filter bar offers.
 * `productId` names the product a shared link filters on, for its name.
 */
export class OrderFilterOptionsQuery {
    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(64)
    productId?: string;
}

/** `GET organizations/:org/orders/products` (B4): the product picker's search. */
export class OrderProductsQuery {
    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(100)
    q?: string;
}
