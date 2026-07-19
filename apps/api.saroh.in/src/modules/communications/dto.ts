import { Transform } from "class-transformer";
import {
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import { COMMS_CHANNELS } from "./providers/provider.port";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value;

/** The consent states a contact can be in for a channel. */
const CONSENT_STATUSES = ["GRANTED", "REVOKED"] as const;

/**
 * Connect (or re-connect) the org's provider for a channel (S6-001).
 *
 * SECURITY: `credentials` is INBOUND-ONLY — a free-form string map (api key,
 * access token, phone-number id, …) that the service AES-256-GCM seals at rest
 * and NEVER echoes back in any response. `fromAddress` is the non-secret
 * verified sender (safe to read back).
 */
export class ConnectCommsProviderDto {
    @Transform(upper)
    @IsIn(COMMS_CHANNELS, {
        message: `channel must be one of: ${COMMS_CHANNELS.join(", ")}`,
    })
    channel!: string;

    @Transform(upper)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    provider!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    fromAddress?: string;

    /**
     * Provider secret material — sealed by the service, never persisted or
     * echoed in plaintext. Each value must be a string (enforced by the
     * service); the object itself is validated here.
     */
    @IsObject()
    credentials!: Record<string, string>;
}

/**
 * Set (upsert) a contact's consent for a channel (S6-001). The stored consent
 * is what {@link sendMessage} checks before ever handing a message to a
 * provider — a REVOKED row suppresses the send.
 */
export class SetConsentDto {
    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    contactId!: string;

    @Transform(upper)
    @IsIn(COMMS_CHANNELS, {
        message: `channel must be one of: ${COMMS_CHANNELS.join(", ")}`,
    })
    channel!: string;

    @Transform(upper)
    @IsIn(CONSENT_STATUSES, {
        message: `status must be one of: ${CONSENT_STATUSES.join(", ")}`,
    })
    status!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    source?: string;
}

/**
 * Queue an outbound message on a channel (S6-001).
 *
 * The recipient is resolved server-side: `contactId` (the org's own Contact,
 * whose email/phone is used) OR an explicit `toAddress`. `leadId` optionally
 * links the message to a Lead for the auditable lifecycle view.
 */
export class SendMessageDto {
    @Transform(upper)
    @IsIn(COMMS_CHANNELS, {
        message: `channel must be one of: ${COMMS_CHANNELS.join(", ")}`,
    })
    channel!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    contactId?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(320)
    toAddress?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    leadId?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(255)
    subject?: string;

    @Transform(trim)
    @IsString()
    @MinLength(1)
    @MaxLength(10_000)
    body!: string;
}
