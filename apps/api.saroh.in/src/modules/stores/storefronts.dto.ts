import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
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
    ValidateNested,
} from "class-validator";

import type { StorefrontFulfilmentType } from "../orders/fulfilment";
import { STOREFRONT_FULFILMENT_TYPES } from "../orders/fulfilment";
import {
    LATE_AFTER_MAX_MINUTES,
    LATE_AFTER_MIN_MINUTES,
} from "../orders/late-thresholds";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const PERCENT_RE = /^\d{1,2}(\.\d{1,2})?$|^100(\.0{1,2})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const STOREFRONT_KINDS = ["SHOP", "ONLINE"] as const;
export const WEEKDAYS = [
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN",
] as const;

/** One day of a shop's week. `open`/`close` are "HH:MM", local to the shop. */
export class OpeningHoursDay {
    @IsIn(WEEKDAYS)
    day!: (typeof WEEKDAYS)[number];

    @Matches(TIME_RE, { message: "Opening times are HH:MM" })
    open!: string;

    @Matches(TIME_RE, { message: "Closing times are HH:MM" })
    close!: string;

    @IsBoolean()
    closed!: boolean;
}

const LATE_MIN_MESSAGE = `An order can be late after ${LATE_AFTER_MIN_MINUTES} minutes at the soonest`;
const LATE_MAX_MESSAGE = "An order can be late after 30 days at the most";
const LATE_INT_MESSAGE = "Late after is a whole number of minutes";

/**
 * When a storefront's orders count as late (B17; default 16), in whole
 * minutes from when each was placed: 5 minutes to 30 days.
 */
export class LateAfterMinutesDto {
    @IsOptional()
    @IsInt({ message: LATE_INT_MESSAGE })
    @Min(LATE_AFTER_MIN_MINUTES, { message: LATE_MIN_MESSAGE })
    @Max(LATE_AFTER_MAX_MINUTES, { message: LATE_MAX_MESSAGE })
    PICKUP?: number;

    @IsOptional()
    @IsInt({ message: LATE_INT_MESSAGE })
    @Min(LATE_AFTER_MIN_MINUTES, { message: LATE_MIN_MESSAGE })
    @Max(LATE_AFTER_MAX_MINUTES, { message: LATE_MAX_MESSAGE })
    LOCAL_DELIVERY?: number;

    @IsOptional()
    @IsInt({ message: LATE_INT_MESSAGE })
    @Min(LATE_AFTER_MIN_MINUTES, { message: LATE_MIN_MESSAGE })
    @Max(LATE_AFTER_MAX_MINUTES, { message: LATE_MAX_MESSAGE })
    SHIPPING?: number;
}

/**
 * Change a storefront's own settings. Every field optional: the screen saves
 * one section at a time, and a section never resends what it did not show.
 *
 * Money and rates travel as strings, as everywhere else in the API — a
 * float that cannot say 18.10 is not a tax rate (backend-data-and-money).
 */
export class UpdateStorefrontDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "A storefront needs a name" })
    @MaxLength(80)
    name?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @Matches(CURRENCY_RE, { message: "Currency must be a 3-letter code" })
    currency?: string;

    @IsOptional()
    @IsBoolean()
    taxEnabled?: boolean;

    @IsOptional()
    @Transform(trim)
    @Matches(PERCENT_RE, { message: "Tax is a percentage from 0 to 100" })
    taxRate?: string;

    @IsOptional()
    @IsBoolean()
    shippingEnabled?: boolean;

    /** `null` clears it: no threshold means delivery is never free. */
    @IsOptional()
    @Transform(trim)
    @Matches(MONEY_RE, {
        message: "Free delivery threshold: a number with up to 2 decimals",
    })
    freeShippingThreshold?: string | null;

    /**
     * The site checkout's flat fee for Local delivery (G13); `null` or
     * "0" is free.
     */
    @IsOptional()
    @Transform(trim)
    @Matches(MONEY_RE, {
        message: "Local delivery fee: a number with up to 2 decimals",
    })
    localDeliveryFee?: string | null;

    /** The site checkout's flat fee for Shipping (G13); `null` is free. */
    @IsOptional()
    @Transform(trim)
    @Matches(MONEY_RE, {
        message: "Shipping fee: a number with up to 2 decimals",
    })
    shippingFee?: string | null;

    @IsOptional()
    @IsIn(STOREFRONT_KINDS, { message: "A storefront is a shop or online" })
    kind?: (typeof STOREFRONT_KINDS)[number];

    /** `null` clears it. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    address?: string | null;

    /** The whole week, Monday first — a week is saved, never one day. */
    @IsOptional()
    @IsArray()
    @ArrayMinSize(7)
    @ArrayMaxSize(7)
    @ValidateNested({ each: true })
    @Type(() => OpeningHoursDay)
    openingHours?: OpeningHoursDay[];

    @IsOptional()
    @IsBoolean()
    collectionEnabled?: boolean;

    @IsOptional()
    @IsBoolean()
    tipsEnabled?: boolean;

    @IsOptional()
    @IsBoolean()
    guestCheckout?: boolean;

    @IsOptional()
    @IsBoolean()
    paused?: boolean;

    /** A connected provider's name, or `null` to use the business's only one. */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @IsString()
    @MaxLength(32)
    checkoutProvider?: string | null;

    /**
     * The ways this storefront's orders leave (B17's chips): any of PICKUP,
     * LOCAL_DELIVERY and SHIPPING. Replaces the collection and delivery
     * toggles, which the API keeps in step for one release.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(STOREFRONT_FULFILMENT_TYPES.length)
    @ArrayUnique({ message: "Each way an order leaves is listed once" })
    @IsIn(STOREFRONT_FULFILMENT_TYPES, {
        each: true,
        message: "An order leaves by Pick-up, Local delivery or Shipping",
    })
    fulfilmentTypes?: StorefrontFulfilmentType[];

    /** When its orders count as late, per type; only the ones sent change. */
    @IsOptional()
    @ValidateNested()
    @Type(() => LateAfterMinutesDto)
    lateAfterMinutes?: LateAfterMinutesDto;
}
