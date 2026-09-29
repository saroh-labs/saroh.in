import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsDefined,
    IsIn,
    IsInt,
    IsObject,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from "class-validator";

import type { StorefrontFulfilmentType } from "../../orders/fulfilment";
import { STOREFRONT_FULFILMENT_TYPES } from "../../orders/fulfilment";

/**
 * The setup payload of `PUT /organizations/:id/modules/:key` (DEC-068): what
 * the Turn on sheet asks for, one shape per module. The body's `setup` is a
 * plain object; `parseModuleSetup` validates it against the module's class
 * here, with the global pipe's whitelist rules, and every refusal names its
 * field as `setup.<path>`.
 *
 * The messages are the merchant's, not a developer's: the sheet shows the
 * first one under its field.
 */

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** "HH:MM", 24-hour, 00:00–23:59. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Rupees and paise as a decimal string: "500", "499.50". Empty: no price. */
const PRICE = /^(\d{1,7}(\.\d{1,2})?)?$/;

/** Sell: the storefront's name and how orders leave. */
export class CommerceSetupDto {
    @Transform(trim)
    @IsString({ message: "Give your storefront a name." })
    @MinLength(1, { message: "Give your storefront a name." })
    @MaxLength(80, { message: "Keep the name to 80 characters or fewer." })
    storefrontName!: string;

    @IsArray({ message: "Choose how orders leave." })
    @ArrayMinSize(1, { message: "Choose at least one way orders leave." })
    @ArrayUnique({ message: "Choose each way once." })
    @IsIn(STOREFRONT_FULFILMENT_TYPES, {
        each: true,
        message: "Choose Pick-up, Local delivery or Shipping.",
    })
    fulfilment!: StorefrontFulfilmentType[];
}

/** One opening window on one day of the week. */
export class OpeningHoursDto {
    @IsInt({ message: "Choose a day." })
    @Min(0, { message: "Choose a day." })
    @Max(6, { message: "Choose a day." })
    weekday!: number;

    @IsString({ message: "Enter an opening time like 10:00." })
    @Matches(HH_MM, { message: "Enter an opening time like 10:00." })
    open!: string;

    @IsString({ message: "Enter a closing time like 19:00." })
    @Matches(HH_MM, { message: "Enter a closing time like 19:00." })
    close!: string;
}

/** The first bookable service. */
export class FirstServiceDto {
    @Transform(trim)
    @IsString({ message: "Name your first service." })
    @MinLength(1, { message: "Name your first service." })
    @MaxLength(128, { message: "Keep the name to 128 characters or fewer." })
    name!: string;

    @IsInt({ message: "Enter how long it takes, in minutes." })
    @Min(1, { message: "A service takes at least a minute." })
    @Max(1440, { message: "A service takes at most a day." })
    durationMinutes!: number;

    @Transform(trim)
    @IsString({ message: "Enter a price like 500 or 499.50." })
    @Matches(PRICE, { message: "Enter a price like 500 or 499.50." })
    price!: string;
}

/** Bookings: opening hours and the first service. */
export class AppointmentsSetupDto {
    @IsArray({ message: "Set your opening hours." })
    @ArrayMinSize(1, { message: "Open on at least one day." })
    @ArrayMaxSize(21, { message: "Up to three windows a day." })
    @ValidateNested({ each: true })
    @Type(() => OpeningHoursDto)
    hours!: OpeningHoursDto[];

    @IsDefined({ message: "Add your first service." })
    @IsObject({ message: "Add your first service." })
    @ValidateNested()
    @Type(() => FirstServiceDto)
    service!: FirstServiceDto;
}

/** Website: the site's name and its address, `<address>.saroh.app`. */
export class WebsiteSetupDto {
    @Transform(trim)
    @IsString({ message: "Give your site a name." })
    @MinLength(1, { message: "Give your site a name." })
    @MaxLength(120, { message: "Keep the name to 120 characters or fewer." })
    siteName!: string;

    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toLowerCase() : value,
    )
    @IsString({ message: "Choose your web address." })
    @MinLength(1, { message: "Choose your web address." })
    @MaxLength(63, { message: "Keep the address to 63 characters or fewer." })
    address!: string;
}

/**
 * Nothing to ask: Contacts (a default pipeline is made), Payments and
 * Communications (a provider is connected later), Insights, Class packs,
 * Courses and Automations. Any field sent is refused.
 */
export class EmptySetupDto {}
