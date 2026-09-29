import { Transform, Type } from "class-transformer";
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
    ValidateNested,
} from "class-validator";

import { SUPPORTED_PROVIDERS } from "./providers/provider.port";
import { needsWebhookSecret, WEBHOOK_SECRET_REQUIRED } from "./webhook-secret";

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
     * The provider's webhook signing secret (S5-003). Like `keySecret` it is
     * INBOUND-ONLY: sealed into the same encrypted credentials blob and NEVER
     * echoed back. Used server-side to HMAC-verify inbound webhooks for this org.
     *
     * Required where the provider signs with a secret of its own — Razorpay
     * (DEC-063): without it every webhook is refused and a payment is never
     * confirmed. Cashfree signs with the key secret, so it stays optional.
     */
    @ValidateIf(
        (o: ConnectProviderDto, v: unknown) =>
            needsWebhookSecret(String(o.provider)) || (v != null && v !== ""),
    )
    @Transform(trim)
    @IsString({ message: WEBHOOK_SECRET_REQUIRED })
    @MinLength(1, { message: WEBHOOK_SECRET_REQUIRED })
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

/** One line to refund, and how many of it (U6). */
export class RefundLineInput {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    itemId!: string;

    @IsInt({ message: "Quantity must be a whole number" })
    @Min(1, { message: "Refund at least one" })
    quantity!: number;
}

/** Units of a line a refund puts back on the shelf (#511). */
export class RefundPutBackInput {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    itemId!: string;

    @IsInt({ message: "Quantity must be a whole number" })
    @Min(1, { message: "Put back at least one" })
    quantity!: number;
}

/** How a refund is asked for: by line (or everything left), or an amount (B8). */
export const REFUND_KINDS = ["lines", "goodwill"] as const;
export type RefundKind = (typeof REFUND_KINDS)[number];

/** Money as a decimal string, two places at most — never a float. */
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/**
 * Initiate a refund against an Order's successful payment (S5-003), by line
 * (ADR-008, U6), or as another amount (B8).
 *
 * SECURITY: a refund by line carries NO amount — it is worked out
 * server-side from the chosen lines (what each paid, less what was already
 * refunded of it), or with no lines, everything still refundable on the
 * order. `kind: "goodwill"` ("Or another amount") is the one refund that
 * names an amount, and it needs a reason: the server caps it at what was
 * paid and not yet handed back, under the order's row lock; it names no
 * line and returns no stock. `idempotencyKey` makes a retry return the
 * first refund instead of making a second.
 */
export class RefundOrderDto {
    /** Omitted: `lines`, the refund as it was before B8. */
    @IsOptional()
    @IsIn(REFUND_KINDS, { message: "Unknown kind of refund" })
    kind?: RefundKind;

    /** Required for another amount; optional, and kept, by line. */
    @ValidateIf(
        (o: RefundOrderDto, v: unknown) =>
            o.kind === "goodwill" || (v != null && v !== ""),
    )
    @Transform(trim)
    @IsString({ message: "Say why you're refunding this amount" })
    @MinLength(1, { message: "Say why you're refunding this amount" })
    @MaxLength(500)
    reason?: string;

    /** Another amount, in the order's currency ("50" or "49.50"). */
    @ValidateIf(
        (o: RefundOrderDto, v: unknown) => o.kind === "goodwill" || v != null,
    )
    @Transform(trim)
    @IsString({ message: "Type the amount to refund" })
    @Matches(MONEY_RE, {
        message: "The amount must be a number with up to 2 decimals",
    })
    amount?: string;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1, { message: "Choose at least one line to refund" })
    @ValidateNested({ each: true })
    @Type(() => RefundLineInput)
    lines?: RefundLineInput[];

    /**
     * "Put N back in stock" (#511), off unless sent: units of refunded lines
     * that go back on the shelf once the provider confirms the refund. Each
     * is capped at what the line sold less what went back already.
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RefundPutBackInput)
    putBack?: RefundPutBackInput[];

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    idempotencyKey?: string;
}
