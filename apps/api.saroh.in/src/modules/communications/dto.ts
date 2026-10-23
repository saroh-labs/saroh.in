import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

import { NOTICE_KINDS } from "./notice-settings";
import {
    OVERDUE_FIRST_DAY_MAX,
    OVERDUE_SECOND_DAY_MAX,
} from "./overdue-timing";
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

/**
 * Turn "Updates in your customers' Messages" on or off (12 Oct 2026). A
 * real boolean, or a 400: nothing is converted (`common/validation.ts`).
 */
export class SetAccountUpdatesDto {
    @IsBoolean({ message: "Choose on or off" })
    on!: boolean;
}

/**
 * Turn one automatic customer notice on or off (DEC-174, U1 #1132). The
 * kind exactly as `NOTICE_KINDS` spells it, and a real boolean, or a 400.
 */
export class SetNoticeSettingDto {
    @IsIn(NOTICE_KINDS, {
        message: `kind must be one of: ${NOTICE_KINDS.join(", ")}`,
    })
    kind!: (typeof NOTICE_KINDS)[number];

    @IsBoolean({ message: "Choose on or off" })
    on!: boolean;
}

/**
 * When overdue reminders go (DEC-178, #1169): all four numbers, whole.
 * Each is checked alone here; together (the second after the first, the
 * end after the start) in `overdueTimingProblem`, in words.
 */
export class SetOverdueTimingDto {
    @IsInt({ message: "Choose a day for the first reminder" })
    @Min(1, {
        message: "The first reminder goes at least 1 day after the due date",
    })
    @Max(OVERDUE_FIRST_DAY_MAX, {
        message: `The first reminder goes at most ${OVERDUE_FIRST_DAY_MAX} days after the due date`,
    })
    firstDay!: number;

    @IsInt({ message: "Choose a day for the second reminder" })
    @Min(2, { message: "The second reminder goes after the first" })
    @Max(OVERDUE_SECOND_DAY_MAX, {
        message: `The second reminder goes at most ${OVERDUE_SECOND_DAY_MAX} days after the due date`,
    })
    secondDay!: number;

    @IsInt({ message: "Choose when reminders start" })
    @Min(0, { message: "Choose when reminders start" })
    @Max(23, { message: "Choose when reminders start" })
    fromHour!: number;

    @IsInt({ message: "Choose when reminders stop" })
    @Min(1, { message: "Choose when reminders stop" })
    @Max(24, { message: "Choose when reminders stop" })
    untilHour!: number;
}
