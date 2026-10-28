/**
 * Saroh's own platform sender (DEC-191; MSG91 brief, 27 Oct): one port, so
 * the provider can change (MSG91 today, Meta's Cloud API for WhatsApp later)
 * without a caller noticing. Saroh is the one sender: the credentials are
 * Saroh's own, never a merchant's.
 *
 * Transport only. Callers never use this directly: `MessagingService` is the
 * public face (usage counts, the 24-hour window, retries, records).
 *
 * Every send throws (naming no value) on a network error or timeout, as the
 * billing providers do; that, `provider_unavailable` and `rate_limited` are
 * the temporary failures the service retries.
 */
export type SendResult =
    | { outcome: "accepted"; providerMessageId: string }
    /** The number can't take this channel (not on WhatsApp). */
    | { outcome: "ineligible" }
    /** The provider refused; `reason` is a short code, never its body. */
    | { outcome: "rejected"; reason: string };

/** Kept for the verification code path's existing name. */
export type OtpSendResult = SendResult;

/** SMS has no sender of Saroh's own until DLT registration (DEC-191). */
export type SmsSendResult = SendResult | { outcome: "unavailable" };

export type WhatsAppTemplateCategory = "authentication" | "utility";

/**
 * A widget access token checked with the provider. `phoneE164` is the
 * number the provider verified, `+` and digits.
 */
export type WidgetVerifyResult =
    | { ok: true; phoneE164: string }
    | {
          ok: false;
          /**
           * `invalid_token`: the provider refused it (wrong, used or expired).
           * `not_a_phone`: it verified something that isn't a number (an email).
           * `unavailable`: no answer in time, or a 5xx: try again.
           */
          reason: "invalid_token" | "not_a_phone" | "unavailable";
      };

export interface WhatsappAuthInput {
    toE164: string;
    code: string;
    /** "Saroh", or a business's name. */
    appName: string;
    /** The code's lifetime, shown as "10 minutes". */
    minutes: number;
    /** The number to call if you didn't ask, as read: "+91 98450 12345". */
    callNumber: string;
}

export interface MessagingProvider {
    /**
     * A code in the approved WhatsApp authentication template: the code,
     * who it is for (`appName`), how long it lasts, and Saroh's number.
     */
    sendWhatsappAuth(input: WhatsappAuthInput): Promise<SendResult>;

    /**
     * An approved WhatsApp template. `template` is Saroh's key for it; the
     * adapter maps it to the provider's template name. `variables` fill the
     * body's {{1}}, {{2}}… in order.
     */
    sendWhatsAppTemplate(input: {
        toE164: string;
        template: string;
        category: WhatsAppTemplateCategory;
        variables: string[];
    }): Promise<SendResult>;

    /**
     * A free-form WhatsApp message. Meta delivers it only within 24 hours of
     * the number's last message to us; `MessagingService` checks that first.
     */
    sendWhatsAppText(input: {
        toE164: string;
        text: string;
    }): Promise<SendResult>;

    sendSms(input: { toE164: string; text: string }): Promise<SmsSendResult>;

    /**
     * Check an OTP widget's access token server-side. Sending and checking
     * the code happen in the customer's browser through the provider's
     * widget; the server only ever sees this token.
     */
    verifyOtpWidgetToken(accessToken: string): Promise<WidgetVerifyResult>;
}

/** Nest token for the {@link MessagingProvider}. */
export const MESSAGING_PROVIDER = Symbol("MESSAGING_PROVIDER");
