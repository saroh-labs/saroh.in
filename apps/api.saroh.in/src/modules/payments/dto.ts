import { Transform } from "class-transformer";
import {
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import { SUPPORTED_PROVIDERS } from "./providers/provider.port";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/**
 * Connect (or re-connect) a merchant payment provider for the org.
 *
 * SECURITY: `keyId` / `keySecret` are INBOUND-ONLY — they are encrypted at rest
 * by the service and NEVER echoed back in any response. `publicKey` is the
 * non-secret public identifier (safe to read back). There is deliberately no
 * amount here — amounts are only ever computed server-side from an Order.
 */
export class ConnectProviderDto {
    @Transform(upper)
    @IsIn(SUPPORTED_PROVIDERS, {
        message: `provider must be one of: ${SUPPORTED_PROVIDERS.join(", ")}`,
    })
    provider!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    publicKey?: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    keyId!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(1024)
    keySecret!: string;

    /**
     * OPTIONAL provider webhook signing secret (S5-003). Like `keySecret` it is
     * INBOUND-ONLY: sealed into the same encrypted credentials blob and NEVER
     * echoed back. Used server-side to HMAC-verify inbound webhooks for this org.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(1024)
    webhookSecret?: string;
}

/**
 * Create a payment intent for an Order.
 *
 * SECURITY: there is NO amount/currency field — both are computed server-side
 * from the Order (`order.total`, `order.currency`). A client cannot influence
 * the amount charged. `provider` optionally pins which connected provider to
 * use; `idempotencyKey` dedupes retries of the same create call.
 */
export class CreateIntentDto {
    @IsOptional()
    @Transform(upper)
    @IsIn(SUPPORTED_PROVIDERS, {
        message: `provider must be one of: ${SUPPORTED_PROVIDERS.join(", ")}`,
    })
    provider?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    idempotencyKey?: string;
}

/**
 * Initiate a refund against an Order's successful payment (S5-003).
 *
 * SECURITY: there is NO amount field — the refund amount is derived server-side
 * from the Order's SUCCEEDED PaymentIntent (`amountCents`), so a client can
 * never influence how much is refunded. `reason` is an optional free-text note.
 */
export class RefundOrderDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    reason?: string;
}
