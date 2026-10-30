import { Injectable, Logger } from "@nestjs/common";

import type {
    MessagingProvider,
    SendResult,
    SmsSendResult,
    WhatsappAuthInput,
    WhatsAppTemplateCategory,
    WidgetVerifyResult,
} from "./messaging-provider.port";

/** The customer is waiting on the code, so one call gets little time. */
const CALL_TIMEOUT_MS = 8_000;

export interface Msg91Config {
    authKey?: string;
    whatsappNumber?: string;
    whatsappTemplate?: string;
    /** Saroh's template key → MSG91's approved utility template name. */
    utilityTemplates?: Record<string, string>;
    /** Where calls go instead of MSG91's own API (tests). */
    baseUrl?: string;
    /** Tests shorten it; MSG91 itself always gets {@link CALL_TIMEOUT_MS}. */
    timeoutMs?: number;
}

const OWN_API = "https://api.msg91.com";
const CONTROL_API = "https://control.msg91.com";

/**
 * Saroh's MSG91 account: WhatsApp sends and the OTP widget's token check.
 * Never logs or echoes the auth key, a number, a code, the text or MSG91's
 * body.
 */
@Injectable()
export class Msg91Provider implements MessagingProvider {
    private readonly logger = new Logger(Msg91Provider.name);

    constructor(
        private readonly config: Msg91Config,
        private readonly fetchFn: typeof fetch = (input, init) =>
            fetch(input, init),
    ) {}

    /**
     * Meta's authentication shape, `saroh_login_code` (en_US): the code and
     * a copy-code button carrying the same code. A template with more
     * variables was refused on every send (28 Oct, DEV_LEARNINGS).
     */
    async sendWhatsappAuth({
        toE164,
        code,
    }: WhatsappAuthInput): Promise<SendResult> {
        required(this.config.authKey, "MSG91_AUTH_KEY");
        const template = required(
            this.config.whatsappTemplate,
            "MSG91_WHATSAPP_TEMPLATE",
        );
        return this.sendTemplate(toE164, template, {
            body_1: { type: "text", value: code },
            // Meta sends the copy-code button as a url sub-type.
            button_1: { subtype: "url", type: "text", value: code },
        });
    }

    async sendWhatsAppTemplate({
        toE164,
        template,
        category,
        variables,
    }: {
        toE164: string;
        template: string;
        category: WhatsAppTemplateCategory;
        variables: string[];
    }): Promise<SendResult> {
        required(this.config.authKey, "MSG91_AUTH_KEY");
        const name =
            category === "authentication"
                ? required(
                      this.config.whatsappTemplate,
                      "MSG91_WHATSAPP_TEMPLATE",
                  )
                : this.config.utilityTemplates?.[template];
        if (!name) return { outcome: "rejected", reason: "unknown_template" };
        const components = Object.fromEntries(
            variables.map((value, i) => [
                `body_${i + 1}`,
                { type: "text", value },
            ]),
        );
        return this.sendTemplate(toE164, name, components);
    }

    async sendWhatsAppText({
        toE164,
        text,
    }: {
        toE164: string;
        text: string;
    }): Promise<SendResult> {
        required(this.config.authKey, "MSG91_AUTH_KEY");
        const number = required(
            this.config.whatsappNumber,
            "MSG91_WHATSAPP_NUMBER",
        );
        // Session message: https://msg91.com/guide/unlocking-whatsapp-messaging-guide-session-outbound-messages
        // shortcut: MSG91's reference shows these fields as query parameters; sent as a JSON body so the text never sits in a URL. Confirm on the live account.
        return this.post(
            `${this.base(OWN_API)}/api/v5/whatsapp/whatsapp-outbound-message/`,
            {
                integrated_number: number,
                recipient_number: digits(toE164),
                content_type: "text",
                text,
            },
        );
    }

    sendSms(): Promise<SmsSendResult> {
        // shortcut: no SMS until Saroh's own DLT entity and header are registered (DEC-191, Q1 2027); SMS codes go through the OTP widget meanwhile. docs/architecture/MESSAGING_MSG91.md says how to add it.
        return Promise.resolve({ outcome: "unavailable" });
    }

    /**
     * MSG91's OTP widget, server side. Endpoint and replies from MSG91's
     * widget reference (https://docs.msg91.com/otp-widget, "Verify Access
     * Token"), as mirrored at
     * https://www.withone.ai/knowledge/msg91/conn_mod_def%3A%3AGNWEPX154UU%3A%3AaSGFqn5gRkeJSHQPmU-ADQ:
     *   POST https://control.msg91.com/api/v5/widget/verifyAccessToken
     *   body { "authkey": "<auth key>", "access-token": "<jwt>" }
     *   200 { "type": "success", "message": "919999999999" }
     *   200 { "type": "error", "code": "201", "message": "AuthenticationFailure" }
     *   401 { "status": "fail", "hasError": true, "errors": "Unauthorized" }
     * shortcut: the number's form (country code, no "+") is from the sample; confirm on the live account.
     */
    async verifyOtpWidgetToken(
        accessToken: string,
    ): Promise<WidgetVerifyResult> {
        const authKey = required(this.config.authKey, "MSG91_AUTH_KEY");
        let res: Response;
        try {
            res = await this.fetchFn(
                `${this.base(CONTROL_API)}/api/v5/widget/verifyAccessToken`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        authkey: authKey,
                    },
                    body: JSON.stringify({
                        authkey: authKey,
                        "access-token": accessToken,
                    }),
                    signal: AbortSignal.timeout(this.timeoutMs()),
                },
            );
        } catch {
            this.logger.warn("msg91 widget_verify network_error");
            return { ok: false, reason: "unavailable" };
        }
        if (res.status >= 500 || res.status === 429) {
            this.logger.warn(`msg91 widget_verify http_${res.status}`);
            return { ok: false, reason: "unavailable" };
        }
        const json = (await res.json().catch(() => null)) as {
            type?: unknown;
            message?: unknown;
        } | null;
        if (!res.ok || json?.type !== "success") {
            this.logger.warn(`msg91 widget_verify refused http_${res.status}`);
            return { ok: false, reason: "invalid_token" };
        }
        const number =
            typeof json.message === "string" ? json.message.trim() : "";
        if (!/^\+?\d{8,15}$/.test(number))
            return { ok: false, reason: "not_a_phone" };
        return { ok: true, phoneE164: `+${digits(number)}` };
    }

    private sendTemplate(
        toE164: string,
        template: string,
        components: Record<string, unknown>,
    ): Promise<SendResult> {
        const number = required(
            this.config.whatsappNumber,
            "MSG91_WHATSAPP_NUMBER",
        );
        // Body shape: https://msg91.com/help/whatsapp/whatsapp-otp
        // Saroh's approved templates are en_US (checked on the live account, 28 Oct).
        return this.post(
            `${this.base(OWN_API)}/api/v5/whatsapp/whatsapp-outbound-message/bulk/`,
            {
                integrated_number: number,
                content_type: "template",
                payload: {
                    messaging_product: "whatsapp",
                    type: "template",
                    template: {
                        name: template,
                        language: { code: "en_US", policy: "deterministic" },
                        to_and_components: [
                            { to: [digits(toE164)], components },
                        ],
                    },
                },
            },
        );
    }

    private async post(url: string, body: unknown): Promise<SendResult> {
        const authKey = required(this.config.authKey, "MSG91_AUTH_KEY");
        let res: Response;
        try {
            res = await this.fetchFn(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    authkey: authKey,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(this.timeoutMs()),
            });
        } catch {
            // Never echo the request: it carries the key, the number and the words.
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

    private base(own: string): string {
        return (this.config.baseUrl ?? own).replace(/\/$/, "");
    }

    private timeoutMs(): number {
        return this.config.timeoutMs ?? CALL_TIMEOUT_MS;
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

function digits(e164: string): string {
    return e164.replace(/^\+/, "");
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
