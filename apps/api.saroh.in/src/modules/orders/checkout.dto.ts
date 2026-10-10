import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from "class-validator";

import { qrSourceTagOf } from "../sites/qr-target";
import { MAX_BAG_LINES, MAX_LINE_QUANTITY } from "./checkout-quote";
import type { CheckoutPayment } from "./checkout-readiness";
import { DeliveryAddressInput } from "./dto";
import type { StorefrontFulfilmentType } from "./fulfilment";
import { STOREFRONT_FULFILMENT_TYPES } from "./fulfilment";

/**
 * The bodies the site's checkout takes (round-2 G13). A line names a
 * listing, a variant and a quantity — never a price, a total or a currency.
 * The global pipe's `forbidNonWhitelisted` refuses a body carrying anything
 * else (an `amount`, a `price`, an `organizationId`) with a 400, so a
 * tampered bag can't even be priced.
 */

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const blankToNull = ({ value }: { value: unknown }) =>
    typeof value === "string" && value.trim() === "" ? null : value;

/** "  save10 " → "save10"; blank → null (no code). */
const trimToNull = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() || null : value;

const CHECKOUT_PAYMENTS: readonly CheckoutPayment[] = ["ONLINE", "ON_HANDOVER"];

export class BagLineInput {
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    listingId!: string;

    /** The option bought; null or absent for a product without options. */
    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(64)
    variantId?: string | null;

    @Type(() => Number)
    @IsInt({ message: "Quantity must be a whole number" })
    @Min(1, { message: "Quantity must be at least 1" })
    @Max(MAX_LINE_QUANTITY)
    quantity!: number;
}

export class CheckoutQuoteDto {
    @IsArray()
    @ArrayMaxSize(MAX_BAG_LINES)
    @ValidateNested({ each: true })
    @Type(() => BagLineInput)
    lines!: BagLineInput[];

    /** The way picked so far, if any. */
    @IsOptional()
    @IsIn(STOREFRONT_FULFILMENT_TYPES)
    fulfilment?: StorefrontFulfilmentType;

    /**
     * A discount code from Sell › Discounts (DEC-104). The server judges
     * it, by the counter's rules, against the bag it prices; nothing the
     * browser says it takes off is read.
     */
    @IsOptional()
    @Transform(trimToNull)
    @IsString()
    @MaxLength(32)
    discountCode?: string | null;
}

export class CheckoutStartDto {
    @IsArray()
    @ArrayMinSize(1, { message: "Your bag is empty" })
    @ArrayMaxSize(MAX_BAG_LINES)
    @ValidateNested({ each: true })
    @Type(() => BagLineInput)
    lines!: BagLineInput[];

    @IsIn(STOREFRONT_FULFILMENT_TYPES, {
        message: "Choose Pick-up, Local delivery or Shipping",
    })
    fulfilment!: StorefrontFulfilmentType;

    /** Where it goes, for Local delivery and Shipping. */
    @IsOptional()
    @ValidateNested()
    @Type(() => DeliveryAddressInput)
    address?: DeliveryAddressInput;

    /**
     * How it is paid: online in the provider's window (the default, and
     * what a site from before offline checkout sends by leaving it out), or
     * on handover — "Pay when you collect", "Pay on delivery".
     */
    @IsOptional()
    @IsIn(CHECKOUT_PAYMENTS, { message: "Choose how you'll pay" })
    payment?: CheckoutPayment;

    /** "Ring the bell", "no sesame". */
    @IsOptional()
    @Transform(blankToNull)
    @IsString()
    @MaxLength(500)
    notes?: string | null;

    /**
     * A discount code from Sell › Discounts (DEC-104). The server judges
     * it, by the counter's rules, against the bag it prices; nothing the
     * browser says it takes off is read.
     */
    @IsOptional()
    @Transform(trimToNull)
    @IsString()
    @MaxLength(32)
    discountCode?: string | null;

    /**
     * The checkout sheet's key: a double tap or a retry with the same key
     * returns the same order and payment, never a second.
     */
    @Transform(trim)
    @IsString()
    @Matches(/^[A-Za-z0-9_-]{8,64}$/, {
        message: "A checkout key is 8 to 64 letters, digits, - or _",
    })
    key!: string;

    /**
     * The tag the page's address carried when a QR code's scan opened it,
     * `qr-<code>`. Never refuses an order: anything that isn't a
     * well-formed tag is dropped before validation (`qrSourceTagOf`), and
     * the code is looked up on the customer's own site
     * (`sites/qr-source.ts`).
     */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => qrSourceTagOf(value))
    @IsString()
    source?: string;
}
