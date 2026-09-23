import { Transform, Type } from "class-transformer";
import {
    IsArray,
    IsBoolean,
    IsEmail,
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

/** Service lifecycle statuses. ACTIVE is bookable; ARCHIVED is not. */
export const SERVICE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/**
 * Where a service happens (ADR-007). ONLINE carries a meeting link that the
 * person who booked is shown; IN_PERSON has none.
 */
export const LOCATION_TYPES = ["IN_PERSON", "ONLINE"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/**
 * How an appointment went (#241). Declared here beside the other closed sets
 * so the DTO can validate against it without importing the service, which
 * imports this file.
 */
export const BOOKING_OUTCOMES = ["ATTENDED", "NO_SHOW"] as const;
export type BookingOutcome = (typeof BOOKING_OUTCOMES)[number];

/**
 * How a booking was paid (U3): a membership's monthly classes, a class pack,
 * paid for, or to be paid at the desk. Null on bookings nobody said about.
 */
export const PAID_WITH = ["MEMBERSHIP", "PACK", "PAID", "DESK"] as const;
export type PaidWith = (typeof PAID_WITH)[number];

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

    /**
     * GST the price includes, in percent (ADR-008): on a registered
     * business's tax invoice. Checked against GST's rates in the service.
     * null clears it.
     */
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: "A GST rate like 5 or 18" })
    gstRate?: string | null;

    /** SAC code: four to eight digits. null clears it. */
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Matches(/^\d{4,8}$/, { message: "A SAC code is 4 to 8 digits" })
    sacCode?: string | null;

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

    @IsOptional()
    @IsIn(LOCATION_TYPES)
    locationType?: LocationType;

    /**
     * The link an online service's bookers join by. https only; checked in
     * the service, which also clears it when the service goes back to in
     * person. `null` clears it.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    meetingUrl?: string | null;
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

    /**
     * GST the price includes, in percent (ADR-008): on a registered
     * business's tax invoice. Checked against GST's rates in the service.
     * null clears it.
     */
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: "A GST rate like 5 or 18" })
    gstRate?: string | null;

    /** SAC code: four to eight digits. null clears it. */
    @IsOptional()
    @ValidateIf((_o, v) => v !== null)
    @Matches(/^\d{4,8}$/, { message: "A SAC code is 4 to 8 digits" })
    sacCode?: string | null;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    timezone?: string;

    @IsOptional()
    @IsIn(SERVICE_STATUSES)
    status?: ServiceStatus;

    @IsOptional()
    @IsIn(LOCATION_TYPES)
    locationType?: LocationType;

    /**
     * The link an online service's bookers join by. https only; checked in
     * the service, which also clears it when the service goes back to in
     * person. `null` clears it.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    meetingUrl?: string | null;
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

    /**
     * The person to book with (U3), by the opaque id the availability read
     * gave. Absent: whoever is free.
     */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    staffId?: string;
}

/**
 * A booking the merchant makes for someone (#384). The org and the service
 * come from the route; the booker is either a contact (`contactId`) or someone
 * new (`bookerEmail`, optionally a name and phone). The service checks that
 * one of the two is given.
 */
export class BookByHandDto {
    @IsISO8601()
    startAt!: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    contactId?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(128)
    bookerName?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
    )
    @IsEmail()
    @MaxLength(320)
    bookerEmail?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(32)
    bookerPhone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    idempotencyKey?: string;

    /**
     * Pay with a class pack (ADR-007): `true` spends the booker's pack that
     * expires soonest, or `packPurchaseId` names one. Needs `pack:write`.
     */
    @IsOptional()
    @IsBoolean()
    useClassPack?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    packPurchaseId?: string;

    /** Who takes it (U3). Absent: whoever is free, or the class's instructor. */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    staffId?: string;

    /**
     * How it is paid (U3). PACK is the same as `useClassPack`; MEMBERSHIP
     * needs `subscriptionId` and uses one of that month's classes.
     */
    @IsOptional()
    @IsIn(PAID_WITH)
    paidWith?: PaidWith;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    subscriptionId?: string;
}

/**
 * Move an existing booking to a different slot (#121).
 *
 * Only the instant. Everything else about the booking — who it is for, what
 * service, the terms agreed at booking time — is deliberately not reschedulable
 * here: moving a booking is one decision, and editing its terms is another.
 */
export class RescheduleBookingDto {
    /** ISO-8601 absolute instant of the new slot start. */
    @IsISO8601()
    startAt!: string;
}

/**
 * Record how an appointment went (#241). Only a person sets this — nothing
 * derives it from time passing.
 */
export class RecordOutcomeDto {
    @IsIn(BOOKING_OUTCOMES)
    outcome!: BookingOutcome;
}
