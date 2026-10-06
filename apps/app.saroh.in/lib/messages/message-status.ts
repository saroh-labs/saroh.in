/**
 * What a message's status says to the owner (message history, S6-002), in
 * words: never the API's raw code, and never "Sent" for mail that didn't go.
 *
 * Saroh's booking emails (DEC-086) add statuses a business's own provider
 * never had: three for a notice Saroh recorded but didn't email (the
 * month's allowance used, a plan with none, the booking's limit for the
 * day), STOPPED (switched off before it went) and UNKNOWN (the connection
 * dropped after the email was handed over: it may have arrived, and is
 * never sent twice).
 */

export type MessageStatusVariant =
    "default" | "destructive" | "outline" | "warning" | "neutral" | "info";

export interface MessageStatusWords {
    /** The badge's words. */
    label: string;
    variant: MessageStatusVariant;
    /**
     * Whether the email surely went (or is on its way): the row's time then reads
     * "Sent", else "Recorded" — a note kept of mail that wasn't sent.
     */
    sent: boolean;
}

const STATUS_WORDS: Record<string, MessageStatusWords> = {
    QUEUED: { label: "Queued", variant: "outline", sent: true },
    SENT: { label: "Sent", variant: "default", sent: true },
    DELIVERED: { label: "Delivered", variant: "default", sent: true },
    FAILED: { label: "Failed", variant: "destructive", sent: true },
    BOUNCED: { label: "Bounced", variant: "destructive", sent: true },
    // Consent revoked (D17): written for the record, never sent.
    SUPPRESSED: {
        label: "Not sent: they turned email off",
        variant: "destructive",
        sent: false,
    },
    ALLOWANCE_USED: {
        label: "Not emailed: monthly allowance used",
        variant: "warning",
        sent: false,
    },
    NO_ALLOWANCE: {
        label: "Not emailed: plan has no Saroh emails",
        variant: "warning",
        sent: false,
    },
    BOOKING_LIMIT: {
        label: "Not emailed: limit for this booking today",
        variant: "warning",
        sent: false,
    },
    STOPPED: {
        label: "Not sent: Saroh email switched off",
        variant: "neutral",
        sent: false,
    },
    // It may not have arrived: the time says when it was recorded, not sent.
    UNKNOWN: { label: "May have been sent", variant: "info", sent: false },
};

/** The words for `status`; a status this screen doesn't know reads as itself. */
export function messageStatusWords(status: string): MessageStatusWords {
    return (
        STATUS_WORDS[status] ?? {
            label: status,
            variant: "outline",
            sent: true,
        }
    );
}
