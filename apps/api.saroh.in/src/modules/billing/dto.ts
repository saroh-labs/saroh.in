import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
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
