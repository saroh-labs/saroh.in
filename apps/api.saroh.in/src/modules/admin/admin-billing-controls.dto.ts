import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from "class-validator";

import { OperatorReasonDto } from "./dto";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

export const ACTION_STATES = ["open", "resolved"] as const;
export type ActionState = (typeof ACTION_STATES)[number];

/** Admin › Billing › Needs action (DEC-166): open or resolved, a page. */
export class ListBillingActionsDto {
    @IsOptional()
    @IsIn(ACTION_STATES)
    state?: ActionState;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100_000)
    page?: number;
}

export const EVENT_FILTERS = ["not-applied", "no-business"] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

/** Admin › Billing › Provider events (DEC-166). */
export class ListProviderEventsDto {
    @IsOptional()
    @IsIn(EVENT_FILTERS)
    filter?: EventFilter;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100_000)
    page?: number;
}

/**
 * A refund the owner made by hand in Razorpay, recorded against a Saroh
 * invoice (DEC-166): its payment, the refund's id and what it gave back.
 */
export class RecordRefundDto extends OperatorReasonDto {
    @Transform(trim)
    @Matches(/^pay_[A-Za-z0-9]{6,40}$/, {
        message: "A Razorpay payment id looks like pay_…",
    })
    providerPaymentId!: string;

    @Transform(trim)
    @Matches(/^rfnd_[A-Za-z0-9]{6,40}$/, {
        message: "A Razorpay refund id looks like rfnd_…",
    })
    providerRefundId!: string;

    @Type(() => Number)
    @IsInt({ message: "The amount is in paise, a whole number" })
    @Min(1)
    @Max(100_000_000)
    amountPaise!: number;
}
