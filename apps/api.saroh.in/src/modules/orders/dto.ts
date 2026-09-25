import { Transform, Type } from "class-transformer";
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

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
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const ORDER_FULFILMENTS = ["COLLECT", "DELIVERY"] as const;
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
    @Transform(trim)
    @IsString()
    customerId!: string;

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

    /** Collected at the counter (the default) or delivered (ADR-008). */
    @IsOptional()
    @IsIn(ORDER_FULFILMENTS, { message: "Collect or delivery" })
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
 * Change an order before anyone starts on it (`order:write`, ADR-008): its
 * lines, its fulfilment and address, and its notes. Lines, fulfilment and
 * address only while it is New; notes at any time until it is cancelled.
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
    @IsIn(ORDER_FULFILMENTS, { message: "Collect or delivery" })
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
