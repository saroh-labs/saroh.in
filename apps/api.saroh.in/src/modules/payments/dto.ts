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
