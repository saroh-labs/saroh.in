import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    ValidateNested,
} from "class-validator";

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
}
