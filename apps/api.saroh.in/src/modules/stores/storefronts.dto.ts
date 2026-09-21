import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const PERCENT_RE = /^\d{1,2}(\.\d{1,2})?$|^100(\.0{1,2})?$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

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
}
