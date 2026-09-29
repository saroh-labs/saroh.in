import { Transform } from "class-transformer";
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from "class-validator";

import { SUPPORTED_PROVIDERS } from "../payments/providers/provider.port";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/** Provider ids: letters, digits, `_` and `-` (Razorpay `order_…`, Cashfree's numbers). */
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * What the provider's window handed the merchant's page (P1). Razorpay's
 * Checkout gives `razorpay_order_id`, `razorpay_payment_id` and
 * `razorpay_signature`; Cashfree's drop-in gives only its order. Never an
 * amount: that is read from the provider.
 */
export class CheckoutReturnDto {
    @Transform(upper)
    @IsIn(SUPPORTED_PROVIDERS, {
        message: `provider must be one of: ${SUPPORTED_PROVIDERS.join(", ")}`,
    })
    provider!: string;

    @Transform(trim)
    @IsString()
    @Matches(PROVIDER_ID, { message: "providerOrderId is not a provider id" })
    providerOrderId!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(PROVIDER_ID, { message: "providerPaymentId is not a provider id" })
    providerPaymentId?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(256)
    signature?: string;
}
