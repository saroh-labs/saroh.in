import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
    ValidateNested,
} from "class-validator";

import type { BookingPayment } from "../bookings/booking-rules";
import { BOOKING_PAYMENTS } from "../bookings/booking-rules";

/** A person on the diary takes new bookings while ACTIVE (U3). */
export const STAFF_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One weekly range of a person's hours, in the business's timezone. That a
 * range ends after it starts, and does not overlap another on the same day,
 * is checked in the service — class-validator cannot compare siblings.
 */
export class StaffHoursDto {
    @IsInt()
    @Min(0)
    @Max(6)
    dayOfWeek!: number;

    @IsInt()
    @Min(0)
    @Max(1439)
    startMinute!: number;

    @IsInt()
    @Min(1)
    @Max(1440)
    endMinute!: number;
}

export class CreateStaffDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    name!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(80)
    title?: string;

    /** The team member this person is, when they have an account. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    membershipId?: string;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    serviceIds?: string[];

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(70)
    @ValidateNested({ each: true })
    @Type(() => StaffHoursDto)
    hours?: StaffHoursDto[];
}

export class UpdateStaffDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(80)
    name?: string;

    /** `null` clears it. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(80)
    title?: string | null;

    /** `null` unlinks the team member; the person stays on the diary. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @MaxLength(64)
    membershipId?: string | null;

    @IsOptional()
    @IsIn(STAFF_STATUSES)
    status?: StaffStatus;
}

export class SetStaffServicesDto {
    @IsArray()
    @ArrayMaxSize(200)
    @IsString({ each: true })
    serviceIds!: string[];
}

export class ReplaceStaffHoursDto {
    @IsArray()
    @ArrayMaxSize(70)
    @ValidateNested({ each: true })
    @Type(() => StaffHoursDto)
    hours!: StaffHoursDto[];
}

/**
 * Time off: whole days (`fromDate`, and `toDate` for more than one — local
 * to the business), the same hours on each of those days (`startMinute`–
 * `endMinute` with the dates, E3), or a stretch of time (`startAt`–`endAt`).
 * The reason is for the team only.
 */
export class AddTimeOffDto {
    @IsOptional()
    @Matches(DATE, { message: "fromDate must be YYYY-MM-DD" })
    fromDate?: string;

    @IsOptional()
    @Matches(DATE, { message: "toDate must be YYYY-MM-DD" })
    toDate?: string;

    /** Part of each day, from local midnight; with `endMinute`. */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1439)
    startMinute?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1440)
    endMinute?: number;

    @IsOptional()
    @IsISO8601()
    startAt?: string;

    @IsOptional()
    @IsISO8601()
    endAt?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(280)
    reason?: string;
}

/** Several rows of time off or closure taken away together — one line. */
export class RemoveOffDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(400)
    @IsString({ each: true })
    ids!: string[];
}

/**
 * A range of the business's local days, all day or the same hours on each
 * (E3) — what a closure is, and what a preview of time off reads.
 */
export class OffRangeDto {
    @Matches(DATE, { message: "fromDate must be YYYY-MM-DD" })
    fromDate!: string;

    @IsOptional()
    @Matches(DATE, { message: "toDate must be YYYY-MM-DD" })
    toDate?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1439)
    startMinute?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1440)
    endMinute?: number;
}

/** The whole business closed (E3). The reason is for the team only. */
export class AddClosureDto extends OffRangeDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(280)
    reason?: string;
}

/**
 * What time off would cover, before it is saved: one person's bookings, or
 * — with no `staffId` — the whole business's, for a closure.
 */
export class PreviewOffDto extends OffRangeDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    staffId?: string;
}

/** Hours on one date on top of the weekly ones — a closed day opened. */
export class AddExtraHoursDto {
    @Matches(DATE, { message: "date must be YYYY-MM-DD" })
    date!: string;

    @IsInt()
    @Min(0)
    @Max(1439)
    startMinute!: number;

    @IsInt()
    @Min(1)
    @Max(1440)
    endMinute!: number;
}

/**
 * The business's booking rules. Each is optional in the body (absent: left
 * as it is) and `null` clears it (no rule).
 */
export class UpdateBookingRulesDto {
    /** How far ahead a customer may book, in days. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsInt()
    @Min(1)
    @Max(365)
    bookAheadDays?: number | null;

    /** The latest a customer may book before a start, in minutes. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsInt()
    @Min(0)
    @Max(10080)
    latestBookingMinutes?: number | null;

    /** Cancel at least this many hours before to get a class back. */
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsInt()
    @Min(0)
    @Max(720)
    freeCancelHours?: number | null;

    /**
     * The refund policy for a booking cancelled in time (E30, DEC-058):
     * refund what was paid online automatically, or not. Never null.
     */
    @IsOptional()
    @IsBoolean()
    refundInTimeCancels?: boolean;

    /**
     * How people pay when they book on the booking page (DEC-088): ONLINE,
     * DESK or BOTH. Absent: left as it is (BOTH for a business that never
     * set it), so an app older than it saves the other rules unchanged.
     */
    @IsOptional()
    @IsIn(BOOKING_PAYMENTS)
    bookingPayment?: BookingPayment;
}
