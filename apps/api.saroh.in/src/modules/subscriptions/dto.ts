import { Transform, Type } from "class-transformer";
import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
} from "class-validator";

import type { Interval } from "./periods";
import { INTERVALS } from "./periods";

/** The most of a plan's events one page reads (D2). */
export const PLAN_EVENTS_PAGE_MAX = 100;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/** Up to nine whole digits and two decimals; "12.345" is refused, not rounded. */
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

export const PLAN_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** The most classes a month a plan can include (the Plan Editor's limit). */
export const PLAN_CLASSES_MAX = 60;

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

    /** A membership's classes a month, 1–60; null is as many as they like. */
    @IsOptional()
    @IsInt({ message: "How many classes a month?" })
    @Min(1, { message: "How many classes a month?" })
    @Max(PLAN_CLASSES_MAX, {
        message: `${PLAN_CLASSES_MAX} a month is the most`,
    })
    classesPerMonth?: number | null;
}

export class ListPlansQueryDto {
    @IsOptional()
    @IsIn(PLAN_STATUSES)
    status?: PlanStatus;
}

/** A page of a plan's history (D2): after the event `cursor`, `limit` of them. */
export class ListPlanEventsQueryDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(PLAN_EVENTS_PAGE_MAX)
    limit?: number;
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

    /** ISO weekday they collect on (1 Monday … 7 Sunday); none for a membership. */
    @IsOptional()
    @IsInt({ message: "Choose a collection day" })
    @Min(1, { message: "Choose a collection day" })
    @Max(7, { message: "Choose a collection day" })
    collectionWeekday?: number;

    /** What they collect, as the screen shows it: "1 sourdough loaf". */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    collectionNote?: string;
}

/**
 * The collection schedule. A null weekday stops collections; changing the
 * day drops the skips still to come, which were for the old day.
 */
export class CollectionScheduleDto {
    @ValidateIf((_, v) => v !== null)
    @IsInt({ message: "Choose a collection day" })
    @Min(1, { message: "Choose a collection day" })
    @Max(7, { message: "Choose a collection day" })
    weekday!: number | null;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    note?: string | null;
}

/** One collection, by its date in the subscription's timezone. */
export class SkipCollectionDto {
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: "A collection date is YYYY-MM-DD",
    })
    date!: string;
}

/** The plan to move to at the next renewal. */
export class ChangePlanDto {
    @IsString()
    planId!: string;
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
