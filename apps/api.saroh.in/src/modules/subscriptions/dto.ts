import { Transform, Type } from "class-transformer";
import {
    IsBoolean,
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

import type { AutopayChargeTiming } from "./autopay-timing";
import { AUTOPAY_CHARGE_TIMINGS } from "./autopay-timing";
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

/** What the staff list can be filtered to, drafts included (D5). */
export const PLAN_LIST_STATUSES = ["DRAFT", ...PLAN_STATUSES] as const;
export type PlanListStatus = (typeof PLAN_LIST_STATUSES)[number];

/**
 * The staff Plans list. With no `status`, it lists live and archived plans
 * but not drafts, as every app before the Plan Editor (D7) expects: an
 * older Plans tab would draw a draft as a live card. The editor's app asks
 * for them with `include=drafts` (everything) or `status=DRAFT`.
 */
export class ListPlansQueryDto {
    @IsOptional()
    @IsIn(PLAN_LIST_STATUSES)
    status?: PlanListStatus;

    @IsOptional()
    @IsIn(["drafts"])
    include?: "drafts";
}

/** The draft revision an editor holds, sent with every draft write (#285). */
export class DraftRevisionDto {
    @IsInt({ message: "Reload the plan and try again" })
    @Min(0)
    revision!: number;
}

/**
 * An autosave from the Plan Editor (D5): the fields in view and the
 * revision it holds. On a DRAFT it writes the plan; on a live plan it
 * writes the unpublished changes, and buyers keep the published terms.
 */
export class PlanDraftDto extends PlanInputDto {
    @IsInt({ message: "Reload the plan and try again" })
    @Min(0)
    revision!: number;
}

/** Deleting a draft names the revision in the query: a DELETE has no body. */
export class DeleteDraftQueryDto {
    @Type(() => Number)
    @IsInt({ message: "Reload the plan and try again" })
    @Min(0)
    revision!: number;
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

/** A page of a subscription's log (D9): the same paging as a plan's. */
export class ListSubscriptionEventsQueryDto extends ListPlanEventsQueryDto {}

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

/**
 * A pause's lengths with an end date (D8, default 30): the only choices a
 * customer has from their own account (A8), and staff's besides "Until I
 * resume".
 */
export const PAUSE_WEEKS = [2, 4, 8] as const;
export type PauseWeeks = (typeof PAUSE_WEEKS)[number];

/**
 * How long to pause (D8). `weeks` pauses for 2, 4 or 8 weeks from today;
 * `until` names the day it resumes (YYYY-MM-DD, in the subscription's
 * timezone), or null to pause until someone resumes it. Both are staff's:
 * a customer's own pause (A8) takes `weeks` only. An empty body is the
 * open-ended pause every earlier client sent.
 */
export class PauseSubscriptionDto {
    @IsOptional()
    @IsIn(PAUSE_WEEKS, { message: "Pause for 2, 4 or 8 weeks" })
    weeks?: PauseWeeks;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "A resume date is YYYY-MM-DD" })
    until?: string | null;
}

export class CancelSubscriptionDto {
    /** `periodEnd` lets the paid period run out; `now` ends it today. */
    @IsIn(["now", "periodEnd"])
    when!: "now" | "periodEnd";
}

/**
 * The business's subscription settings: "Members can pause from their
 * account" (A8) and "When autopay charges" (D13B). Either or both; a save
 * that names neither is refused.
 */
export class SubscriptionSettingsDto {
    @IsOptional()
    @IsBoolean()
    membersCanPause?: boolean;

    @IsOptional()
    @IsIn(AUTOPAY_CHARGE_TIMINGS, {
        message: "Pick when autopay charges",
    })
    autopayChargeTiming?: AutopayChargeTiming;
}

/** A plan's own "When autopay charges" (D13B); null uses the business's. */
export class PlanChargeTimingDto {
    // Present and null, or one of the timings; absent is refused.
    @ValidateIf((o: PlanChargeTimingDto) => o.autopayChargeTiming !== null)
    @IsIn(AUTOPAY_CHARGE_TIMINGS, {
        message: "Pick when autopay charges, or use the business setting",
    })
    autopayChargeTiming!: AutopayChargeTiming | null;
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

/**
 * Retry a failed renewal (D13): `MANDATE` charges the customer's autopay
 * again, `PAY_LINK` (the default, as before D13) makes a new pay link. The
 * subscription's read says which is on offer (`retryVia`).
 */
export class RetryPaymentDto {
    @IsOptional()
    @IsIn(["MANDATE", "PAY_LINK"])
    via?: "MANDATE" | "PAY_LINK";
}
