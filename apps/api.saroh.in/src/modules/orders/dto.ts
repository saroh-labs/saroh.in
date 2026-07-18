import { Transform, Type } from "class-transformer";
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Min,
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

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const MONEY_MSG = "Must be a number with up to 2 decimals";
const CURRENCY_RE = /^[A-Z]{3}$/;

export class OrderItemInput {
    @Transform(trim)
    @IsString()
    productId!: string;

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
