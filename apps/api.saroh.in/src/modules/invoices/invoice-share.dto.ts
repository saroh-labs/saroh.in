import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from "class-validator";

import type { ShareKind } from "./invoice-share-words";
import { SHARE_KINDS } from "./invoice-share-words";

/**
 * How an invoice is shared by hand (DEC-173): opened on WhatsApp, its link
 * copied, its PDF downloaded or printed, all logged; or, for a receipt,
 * emailed through the business's own provider.
 */
export const SHARE_CHANNELS = [
    "WHATSAPP",
    "LINK",
    "PDF",
    "PRINT",
    "EMAIL",
] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/** The channels the share log keeps: every one but email (Messages). */
export type LoggedShareChannel = Exclude<ShareChannel, "EMAIL">;

/** At most this many invoices in one Remind many. */
export const BULK_REMINDER_MAX = 100;

/** The longest quiet a Remind many can ask for, in days. */
export const REMINDER_QUIET_MAX = 14;

/** `POST :invoiceId/share`. */
export class ShareInvoiceDto {
    @IsIn(SHARE_CHANNELS, {
        message: "Pick WhatsApp, link, PDF, print or email.",
    })
    channel!: ShareChannel;

    /**
     * Which message: a new invoice, a reminder or a receipt. Left out, the
     * invoice's own: a receipt once paid, a reminder once overdue, else new.
     * Email takes only a receipt: a new invoice or a reminder is emailed by
     * `send` and `remind`.
     */
    @IsOptional()
    @IsIn(SHARE_KINDS, {
        message: "Pick a new invoice, a reminder or a receipt.",
    })
    kind?: ShareKind;
}

/** `POST reminders/preview` and `POST reminders`. */
export class BulkRemindersDto {
    @IsArray()
    @ArrayMinSize(1, { message: "Pick at least one invoice." })
    @ArrayMaxSize(BULK_REMINDER_MAX, {
        message: `Remind at most ${BULK_REMINDER_MAX} invoices at a time.`,
    })
    @IsString({ each: true })
    @MaxLength(64, { each: true })
    invoiceIds!: string[];

    /**
     * Wait anyone sent or reminded in the last this many days, not only
     * today: Home's Remind all asks 3 (DEC-171, U8). Left out, one a day.
     */
    @IsOptional()
    @IsInt({ message: "Say how many days as a whole number." })
    @Min(1, { message: "Wait at least a day." })
    @Max(REMINDER_QUIET_MAX, {
        message: `Wait at most ${REMINDER_QUIET_MAX} days.`,
    })
    quietDays?: number;
}
