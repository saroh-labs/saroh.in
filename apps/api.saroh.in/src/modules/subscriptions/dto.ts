import { Transform } from "class-transformer";
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

import type { Interval } from "./periods";
import { INTERVALS } from "./periods";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/** Up to nine whole digits and two decimals; "12.345" is refused, not rounded. */
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

export const PLAN_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * A plan, created or changed. One shape for both; the service says what a
 * create cannot do without. A change reaches only future sign-ups: everyone
 * already subscribed keeps the price and interval they signed up at.
 */
export class PlanInputDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Give the plan a name" })
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string | null;

    @IsOptional()
    @Transform(trim)
    @Matches(MONEY, { message: "A price has at most two decimal places" })
    price?: string;

    @IsOptional()
    @Transform(upper)
    @Matches(/^[A-Z]{3}$/, { message: "Currency must be a 3-letter code" })
    currency?: string;

    @IsOptional()
    @IsIn(INTERVALS)
    interval?: Interval;
}

export class ListPlansQueryDto {
    @IsOptional()
    @IsIn(PLAN_STATUSES)
    status?: PlanStatus;
}

export class SubscribeDto {
    @IsString()
    contactId!: string;

    @IsString()
    planId!: string;

    /**
     * The first day, in the subscription's timezone. May be in the past, for
     * a member moved over from a spreadsheet: they keep that renewal day, but
     * only the period holding today is invoiced. Defaults to today.
     */
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "A start date is YYYY-MM-DD" })
    startDate?: string;

    /** IANA zone. Defaults to the business's, then UTC. Checked in the service. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    timezone?: string;
}

export class CancelSubscriptionDto {
    /** `periodEnd` lets the paid period run out; `now` ends it today. */
    @IsIn(["now", "periodEnd"])
    when!: "now" | "periodEnd";
}

export class ListSubscriptionsQueryDto {
    @IsOptional()
    @IsIn(SUBSCRIPTION_STATUSES)
    status?: SubscriptionStatus;

    @IsOptional()
    @IsString()
    contactId?: string;

    @IsOptional()
    @IsString()
    planId?: string;
}
