import { Injectable, Logger } from "@nestjs/common";

import type { OtpSendResult, OtpTransport } from "./otp-transport.port";

/** The customer is waiting on the code, so one call gets little time. */
const CALL_TIMEOUT_MS = 8_000;

export interface Msg91Config {
    authKey?: string;
    whatsappNumber?: string;
    whatsappTemplate?: string;
    /** Where calls go instead of MSG91's own API (tests). */
    baseUrl?: string;
}

const OWN_API = "https://api.msg91.com";

/**
 * MSG91 WhatsApp authentication-template send, from Saroh's own account.
 * Never logs or echoes the auth key, the code or MSG91's body.
 */
@Injectable()
export class Msg91OtpTransport implements OtpTransport {
    private readonly logger = new Logger(Msg91OtpTransport.name);

    constructor(
        private readonly config: Msg91Config,
        private readonly fetchFn: typeof fetch = (input, init) =>
            fetch(input, init),
    ) {}

    async sendWhatsappAuth({
        toE164,
        code,
    }: {
        toE164: string;
        code: string;
    }): Promise<OtpSendResult> {
        const authKey = required(this.config.authKey, "MSG91_AUTH_KEY");
        const number = required(
            this.config.whatsappNumber,
            "MSG91_WHATSAPP_NUMBER",
        );
        const template = required(
            this.config.whatsappTemplate,
            "MSG91_WHATSAPP_TEMPLATE",
        );
        const base = (this.config.baseUrl ?? OWN_API).replace(/\/$/, "");

        // Body shape: https://msg91.com/help/whatsapp/whatsapp-otp
        // shortcut: language "en" and no namespace; confirm against the live account's approved template.
        const body = {
            integrated_number: number,
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: template,
                    language: { code: "en", policy: "deterministic" },
                    to_and_components: [
                        {
                            to: [toE164.replace(/^\+/, "")],
                            components: {
                                body_1: { type: "text", value: code },
                                // Meta sends the copy-code button as a url sub-type.
                                button_1: {
                                    subtype: "url",
                                    type: "text",
                                    value: code,
                                },
                            },
                        },
                    ],
                },
            },
        };

        let res: Response;
        try {
            res = await this.fetchFn(
                `${base}/api/v5/whatsapp/whatsapp-outbound-message/bulk/`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        authkey: authKey,
                    },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
                },
            );
        } catch {
            // Never echo the request: it carries the key and the code.
            throw new Error("MSG91 WhatsApp send failed: network error");
        }

        const json = (await res.json().catch(() => null)) as Msg91Reply | null;
        if (res.ok && json && !json.hasError) {
            // shortcut: id field unconfirmed for the bulk endpoint (single send returns data.message_uuid); confirm on the live account.
            const id =
                json.request_id ??
                json.data?.message_uuid ??
                json.data?.request_id;
            if (typeof id === "string" && id)
                return { outcome: "accepted", providerMessageId: id };
            this.logger.warn(
                "MSG91 WhatsApp send accepted without a message id",
            );
            return { outcome: "rejected", reason: "no_message_id" };
        }
        // shortcut: MSG91 mostly reports "not on WhatsApp" later on the delivery
        // report; this catches only a synchronous refusal worded so. Confirm the
        // live wording and error codes.
        if (
            /not (a valid )?whatsapp|not on whatsapp|invalid (phone|mobile|number)/i.test(
                errorText(json),
            )
        ) {
            return { outcome: "ineligible" };
        }
        this.logger.warn(`MSG91 WhatsApp send failed with HTTP ${res.status}`);
        return { outcome: "rejected", reason: rejectionCode(res.status) };
    }
}

interface Msg91Reply {
    hasError?: boolean;
    request_id?: unknown;
    data?: { message_uuid?: unknown; request_id?: unknown } | null;
    errors?: unknown;
}

function required(value: string | undefined, name: string): string {
    if (!value)
        throw new Error(
            `${name} is not set — Saroh's MSG91 sender is not configured.`,
        );
    return value;
}

/** The provider's error words, only to classify; never logged or returned. */
function errorText(json: Msg91Reply | null): string {
    if (!json) return "";
    return JSON.stringify([
        json.errors ?? null,
        typeof json.data === "string" ? json.data : null,
    ]);
}

function rejectionCode(status: number): string {
    if (status === 401 || status === 403) return "unauthorized";
    if (status === 429) return "rate_limited";
    if (status >= 500) return "provider_unavailable";
    if (status >= 400) return "refused";
    return "provider_error";
}
