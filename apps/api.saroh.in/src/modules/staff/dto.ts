import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
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
 * to the business) or a stretch of time (`startAt`–`endAt`). The reason is
 * for the team only.
 */
export class AddTimeOffDto {
    @IsOptional()
    @Matches(DATE, { message: "fromDate must be YYYY-MM-DD" })
    fromDate?: string;

    @IsOptional()
    @Matches(DATE, { message: "toDate must be YYYY-MM-DD" })
    toDate?: string;

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
}
