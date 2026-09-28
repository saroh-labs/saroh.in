import { Transform, Type } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    ValidateNested,
} from "class-validator";

import type { OrderFulfilment } from "./dto";
import { DeliveryAddressInput, ORDER_FULFILMENTS } from "./dto";

/*
 * Order Detail's two changes after it was placed (round-2 B9): how it is
 * fulfilled, and cancelling it as a refund in full. Their own file: the
 * order DTOs are past the size the codebase keeps (00-universal §6).
 */

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) => {
    if (typeof value !== "string") return value;
    const t = value.trim();
    return t === "" ? null : t;
};

/** Money as a decimal string, two places at most — never a float. */
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/** The longest reason the order keeps (as a refund's). */
export const CANCEL_REASON_MAX = 500;

/**
 * "Change how it's fulfilled…": the new way, the address a delivery needs,
 * and the delivery charge staff type (decided 2026-09-27; there is no fee
 * per storefront yet). The difference from the charge now is worked out on
 * the server, under the order's lock.
 */
export class ChangeFulfilmentDto {
    @IsIn(ORDER_FULFILMENTS, { message: "Unknown way to fulfil an order" })
    fulfilment!: OrderFulfilment;

    /** The delivery charge now, in the order's currency ("40" or "40.00"). */
    @Transform(trim)
    @IsString({ message: "Type the delivery charge" })
    @Matches(MONEY_RE, {
        message: "The delivery charge must be a number with up to 2 decimals",
    })
    @MaxLength(12, { message: "That delivery charge is too large" })
    shipping!: string;

    /** Where it goes, for a delivery; the address on the order otherwise. */
    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryAddressInput)
    address?: DeliveryAddressInput;

    /** Say so in the customer's message thread, when it can reach them. */
    @IsOptional()
    @IsBoolean()
    tell?: boolean;

    /** A retry with the same key returns the refund the first one made. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    idempotencyKey?: string;
}

/** "Cancel order…": a refund in full, with the reason the order keeps. */
export class CancelOrderDto {
    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(CANCEL_REASON_MAX)
    reason?: string | null;

    /** The sheet's key: a retry of this cancel finds the refund it made. */
    @Transform(trim)
    @IsString({ message: "A cancel needs its key" })
    @MinLength(1, { message: "A cancel needs its key" })
    @MaxLength(100)
    idempotencyKey!: string;

    /** Say so in the customer's message thread, when it can reach them. */
    @IsOptional()
    @IsBoolean()
    tell?: boolean;
}
