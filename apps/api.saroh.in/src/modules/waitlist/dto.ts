import { Transform } from "class-transformer";
import {
    IsEmail,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateIf,
} from "class-validator";

import type { WaitlistKind, WaitlistPlan } from "./waitlist-keys";
import { WAITLIST_KINDS, WAITLIST_PLANS } from "./waitlist-keys";

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value;

/** An empty optional field is no field: "" from a blank input is not a city. */
const blankToUndefined = ({ value }: { value: unknown }): unknown => {
    const trimmed = trim({ value });
    return trimmed === "" ? undefined : trimmed;
};

/** A country code in capitals, or no field when blank. */
const upperOrUndefined = ({ value }: { value: unknown }): unknown => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim().toUpperCase();
    return trimmed === "" ? undefined : trimmed;
};

/**
 * One join (U30). The V2 form sends a business name and a kind together;
 * the V1 form (until U26 removes it) sends an email only, so the two are
 * optional — but one without the other is refused.
 */
export class JoinWaitlistDto {
    /**
     * Normalized here rather than in the service so validation and storage see
     * the same string — otherwise `IsEmail` could pass on "  A@B.com " while the
     * unique index sees a different value than a later lowercase submission.
     */
    @Transform(normalizeEmail)
    @IsEmail({}, { message: "Enter an email like name@shop.in." })
    @MaxLength(320) // RFC 5321 maximum length of a forward path
    email!: string;

    @ValidateIf(
        (o: JoinWaitlistDto) =>
            o.business !== undefined || o.kind !== undefined,
    )
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: "Add your business name." })
    @MaxLength(120)
    business?: string;

    @ValidateIf(
        (o: JoinWaitlistDto) =>
            o.business !== undefined || o.kind !== undefined,
    )
    @IsIn(WAITLIST_KINDS, { message: "Pick the closest one." })
    kind?: WaitlistKind;

    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(80)
    city?: string;

    /**
     * The visitor's country, two letters, as saroh.in's host saw their
     * connection — the site adds it, the visitor never types it. Anything
     * else is refused rather than stored.
     */
    @IsOptional()
    @Transform(upperOrUndefined)
    @Matches(/^[A-Z]{2}$/)
    country?: string;

    @IsOptional()
    @IsIn(WAITLIST_PLANS)
    plan?: WaitlistPlan;

    /** Analytics only — the page's `?src=`, e.g. "pricing". Cleaned in the service. */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    source?: string;

    /**
     * The referral id from the page's `?ref=`. A malformed or unknown one is
     * ignored by the service rather than refused: a bad link must not stop
     * someone joining.
     */
    @IsOptional()
    @Transform(blankToUndefined)
    @IsString()
    @MaxLength(64)
    ref?: string;
}
