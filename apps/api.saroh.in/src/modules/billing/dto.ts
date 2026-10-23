import { Transform, Type } from "class-transformer";
import {
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

import { RegisteredAddressDto } from "../organizations/dto";
import { MAX_ADDON_QUANTITY } from "./offers";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/**
 * Change the business's catalogue plan (pricing catalogue U15): the plan's id
 * in the catalogue (`grow`, …) and the billing cycle. Nothing else — every
 * amount is worked out on the server (KTD-18), so a body carrying a price is
 * refused by the validation pipe.
 */
export class ChangePlanDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    plan!: string;

    @IsIn(["month", "year"], { message: "cycle must be month or year" })
    cycle!: "month" | "year";

    /**
     * Who Saroh's invoice is billed to (U17): the state the business is
     * registered in (a GST state code or name), which sets the place of
     * supply. Optional: unset, the business profile's.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    billingState?: string;

    /** The business's GSTIN for Saroh's invoice, when it has one (U17). */
    @IsOptional()
    @Transform(upper)
    @IsString()
    @Matches(/^[0-9A-Z]{15}$/, { message: "A GSTIN is 15 characters." })
    gstin?: string;

    /**
     * The business's registered address, asked for when its profile has
     * none whole: required before a paid plan (17 Oct 2026,
     * `billing-details.ts`), and saved to the business's own registered
     * address, never over a whole one it already has.
     */
    @IsOptional()
    @ValidateNested()
    @Type(() => RegisteredAddressDto)
    registeredAddress?: RegisteredAddressDto;

    /**
     * The name for Saroh's invoice, asked for only when the business has
     * neither a legal name nor a name; saved as its legal name.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    billingName?: string;

    /**
     * An email for Saroh's invoices, asked for only when neither the owner
     * nor the business has one; kept on the checkout.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(254)
    billingEmail?: string;

    /**
     * A phone for Saroh's invoice, optional, asked for when the business
     * has none; kept on the checkout, never on the profile (whose phone
     * its website shows). Its shape is the service's, which names it.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(32)
    phone?: string;

    /**
     * A coupon code (U16), upper-cased. Checked on the server against the
     * coupon, the plan and the business; the discount is the server's.
     */
    @IsOptional()
    @Transform(upper)
    @IsString()
    @MaxLength(32, { message: "That isn't a coupon code." })
    coupon?: string;

    /**
     * The owner saw "This changes Saroh's invoices for N businesses." and
     * went on (owner, 18 Oct 2026): a checkout that would change a billing
     * profile billing more than one business is refused without it.
     */
    @IsOptional()
    @IsBoolean()
    confirmSharedProfile?: boolean;
}

/** `GET …/billing/change-plan?plan=&cycle=`: the same two, to quote. */
export class ChangePlanQuery extends ChangePlanDto {}

/** `PUT …/billing/addons/:addonId`: how many to hold; zero removes it (U16). */
export class SetAddonDto {
    @IsInt()
    @Min(0)
    @Max(MAX_ADDON_QUANTITY)
    quantity!: number;
}
