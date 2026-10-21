import { Transform } from "class-transformer";
import {
    Equals,
    IsEmail,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

import { MAX_WATCH_EMAIL } from "./stock-watch-rules";

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/** An empty optional field is no field. */
const blankToUndefined = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" && value.trim() === "" ? undefined : value;

/**
 * "Tell me when it's back" (U23): the address, the option they want (none:
 * the product, whichever option comes back) and the opt-in, which must be
 * ticked. Trimmed and lower-cased here, so validation and storage see the
 * same string.
 */
export class WatchStockDto {
    @Transform(normalizeEmail)
    @IsEmail({}, { message: "Enter an email like name@example.com." })
    @MaxLength(MAX_WATCH_EMAIL)
    email!: string;

    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(40)
    variantId?: string;

    /** The opt-in: "Email me once when it's back". Consent to that email. */
    @Equals(true, { message: "Tick the box to be emailed when it's back." })
    consent!: boolean;
}

/** The read of whether "Tell me" is offered for a product or an option. */
export class WatchOfferQueryDto {
    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(40)
    variantId?: string;
}

/** The workspace's count of who is waiting for a product (U24). */
export class StockWatchCountQueryDto {
    @IsString()
    @MaxLength(40)
    productId!: string;
}
