import { Transform } from "class-transformer";
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
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** Up to nine whole digits and two decimals; "12.345" is refused, not rounded. */
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * DRAFT is being set up and takes no one; OPEN takes enrolments and holds its
 * unfilled seats; CLOSED takes no more but runs for those on it; ARCHIVED is
 * put away.
 */
export const COURSE_STATUSES = ["DRAFT", "OPEN", "CLOSED", "ARCHIVED"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

/**
 * A course, created or changed. One shape for both; the service says what a
 * create cannot do without. The service is fixed once made: its sessions
 * are that service's time. A price change reaches only later enrolments.
 */
export class CourseInputDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    serviceId?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Give the course a name" })
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(1000)
    description?: string | null;

    @IsOptional()
    @Transform(trim)
    @Matches(MONEY, { message: "A price has at most two decimal places" })
    price?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @Matches(/^[A-Z]{3}$/, { message: "Currency must be a 3-letter code" })
    currency?: string;

    @IsOptional()
    @IsInt()
    @Min(1, { message: "A course has at least one seat" })
    @Max(1000)
    seats?: number;

    @IsOptional()
    @IsIn(COURSE_STATUSES)
    status?: CourseStatus;

    /** Session start times, on create only; each runs the service's length. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(200)
    @IsISO8601({ strict: true }, { each: true })
    sessions?: string[];
}

export class ListCoursesQueryDto {
    @IsOptional()
    @IsIn(COURSE_STATUSES)
    status?: CourseStatus;

    @IsOptional()
    @IsString()
    serviceId?: string;
}

export class AddSessionDto {
    @IsISO8601({ strict: true }, { message: "startAt is not a date and time" })
    startAt!: string;
}

export class EnrolDto {
    @IsString()
    contactId!: string;

    /** What they pay, when not the course's price — a late start, say. */
    @IsOptional()
    @Transform(trim)
    @Matches(MONEY, { message: "A price has at most two decimal places" })
    price?: string;
}

export class ListEnrollmentsQueryDto {
    @IsOptional()
    @IsString()
    contactId?: string;
}
