import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";

import { SUPPORTED_BILLING_PROVIDERS } from "./providers/billing-provider.port";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/**
 * Subscribe the org to a plan, or change to a different plan (S7-005).
 *
 * `planKey` selects the catalog plan (the latest active version is resolved
 * server-side — the client never picks a version). `provider` is REQUIRED for a
 * paid plan (which one of Saroh's platform billing providers to charge through)
 * and ignored for a free plan, which needs no provider.
 */
export class SubscribeDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    planKey!: string;

    @IsOptional()
    @Transform(upper)
    @IsIn(SUPPORTED_BILLING_PROVIDERS, {
        message: `provider must be one of: ${SUPPORTED_BILLING_PROVIDERS.join(", ")}`,
    })
    provider?: string;
}

/**
 * Cancel the org's subscription (S7-005). By default the cancellation takes
 * effect at the end of the current paid period (`cancelAtPeriodEnd`); pass
 * `immediate: true` to cancel right away (status → CANCELLED now).
 */
export class CancelSubscriptionDto {
    @IsOptional()
    @IsBoolean()
    immediate?: boolean;
}

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
}

/** `GET …/billing/change-plan?plan=&cycle=`: the same two, to quote. */
export class ChangePlanQuery extends ChangePlanDto {}
