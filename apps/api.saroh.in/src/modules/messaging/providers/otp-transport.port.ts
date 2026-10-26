/**
 * Saroh's platform transport for customer verification codes (DEC-191, #1237).
 *
 * Saroh is the one sender: the credentials are Saroh's own, never a
 * merchant's. Transport only: the caller makes the code, keeps the wallet and
 * decides any fallback. SMS slots in here as `sendSmsAuth` once DLT
 * registration clears (DEC-191 defers it); it is not built yet.
 */
export type OtpSendResult =
    | { outcome: "accepted"; providerMessageId: string }
    /** The number can't take this channel (not on WhatsApp). */
    | { outcome: "ineligible" }
    /** The provider refused; `reason` is a short code, never its body. */
    | { outcome: "rejected"; reason: string };

export interface OtpTransport {
    /**
     * Send `code` in the approved WhatsApp authentication template.
     * Throws (naming no value) on a network error or timeout, as the billing
     * providers do.
     */
    sendWhatsappAuth(input: {
        toE164: string;
        code: string;
    }): Promise<OtpSendResult>;
}

/** Nest token for the {@link OtpTransport}. */
export const OTP_TRANSPORT = Symbol("OTP_TRANSPORT");
