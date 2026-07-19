import { Transform, Type } from "class-transformer";
import {
    IsArray,
    IsEmail,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

/** Service lifecycle statuses. ACTIVE is bookable; ARCHIVED is not. */
export const SERVICE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * Create a bookable Service. Structural validation is done here by
 * class-validator; the SEMANTIC checks that need I/O (valid IANA timezone,
 * `siteId` belongs to the org) live in {@link BookingsService}.
 */
export class CreateServiceDto {
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @IsInt()
    @Min(1)
    @Max(1440)
    durationMinutes!: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1440)
    bufferBeforeMinutes?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1440)
    bufferAfterMinutes?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    capacity?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    priceCents?: number;

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string;

    /** IANA timezone, e.g. "Asia/Kolkata". Validated against the tz database in the service. */
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    timezone!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    siteId?: string;
}

/** Update a Service (PATCH semantics — every field optional). */
export class UpdateServiceDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(1440)
    durationMinutes?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1440)
    bufferBeforeMinutes?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(1440)
    bufferAfterMinutes?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    capacity?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    priceCents?: number;

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    timezone?: string;

    @IsOptional()
    @IsIn(SERVICE_STATUSES)
    status?: ServiceStatus;
}

/**
 * One recurring weekly availability window, authored in the Service's timezone.
 * The cross-field rule `startMinute < endMinute` is enforced in the service
 * (class-validator can't compare sibling fields cleanly).
 */
export class AvailabilityRuleDto {
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

/** Replace a Service's full set of availability rules (PUT semantics). */
export class ReplaceRulesDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AvailabilityRuleDto)
    rules!: AvailabilityRuleDto[];
}

/** Add a single availability rule to a Service. */
export class AddRuleDto extends AvailabilityRuleDto {}

/**
 * PUBLIC booking request (unauthenticated). The org is derived from the target
 * Service, NEVER from this body. `startAt` must resolve to a real open slot.
 */
export class BookServiceDto {
    /** ISO-8601 absolute instant of the requested slot start. */
    @IsISO8601()
    startAt!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(128)
    bookerName?: string;

    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
    )
    @IsEmail()
    @MaxLength(320)
    bookerEmail!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(32)
    bookerPhone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string;
}
