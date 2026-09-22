import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
} from "class-validator";

import type { DiscountKind, DiscountReach } from "./redeem";
import { DISCOUNT_KINDS, DISCOUNT_REACH } from "./redeem";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/**
 * A discount, created or changed. One shape for both: every field is optional
 * here, and the service says which a create cannot do without — a PATCH sends
 * only what the merchant touched.
 *
 * Money and percentages travel as strings (backend-data-and-money): "12.5"
 * converts to exactly 1250 basis points, and a value that cannot — "12.345"
 * — is refused rather than silently rounded.
 */
export class DiscountInputDto {
    /** Normalised to upper case; letters, digits, "-" and "_". */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @Matches(/^[A-Z0-9_-]{2,32}$/, {
        message:
            "A code is 2 to 32 letters, digits, dashes or underscores, with no spaces",
    })
    code?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    description?: string | null;

    @IsOptional()
    @IsIn(DISCOUNT_KINDS)
    kind?: DiscountKind;

    /** "15" or "12.5": up to two decimals, above 0 and at most 100. */
    @IsOptional()
    @Transform(trim)
    @Matches(/^\d{1,3}(\.\d{1,2})?$/, {
        message: "A percentage has at most two decimal places",
    })
    percent?: string;

    @IsOptional()
    @Transform(trim)
    @Matches(/^\d{1,10}(\.\d{1,2})?$/, {
        message: "An amount has at most two decimal places",
    })
    amount?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @Matches(/^[A-Z]{3}$/, { message: "Currency must be a 3-letter code" })
    currency?: string;

    @IsOptional()
    @IsIn(DISCOUNT_REACH)
    appliesTo?: DiscountReach;

    /**
     * The storefronts, collections or products the code reaches — whichever
     * `appliesTo` names. Written as a whole: the reach is replaced, not
     * merged.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @IsString({ each: true })
    targetIds?: string[];

    /** ISO; `null` clears it. */
    @IsOptional()
    @IsISO8601()
    startsAt?: string | null;

    @IsOptional()
    @IsISO8601()
    endsAt?: string | null;

    /** `null` means no cap. */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    usageLimit?: number | null;
}
