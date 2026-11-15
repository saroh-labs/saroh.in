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

/** The Graph version Meta's WhatsApp Cloud API docs show (12 Nov 2026). */
const GRAPH_API = "https://graph.facebook.com/v27.0";

/** Meta's "not a WhatsApp user" (or can't take this message). */
const NOT_ON_WHATSAPP = 131026;

/**
 * Meta's throughput and pacing refusals: too many calls (4, 80007), the
 * number's send rate (130429), spam pacing (131048) and too many to one user
 * (131056). Each is worth trying again later.
 */
const RATE_LIMITED = new Set([4, 80007, 130429, 131048, 131056]);

/** Meta's expired or invalid access token. */
const BAD_TOKEN = 190;

export interface MetaCloudConfig {
    phoneNumberId?: string;
    token?: string;
    /** The approved authentication template's name in Saroh's WhatsApp account. */
    authTemplate?: string;
    /** Saroh's template key → the approved utility template's name. */
    utilityTemplates?: Record<string, string>;
    /** The templates' language; Saroh's approved ones are en_US. */
    templateLang?: string;
    /** Where calls go instead of Meta's Graph API, version included (tests). */
    baseUrl?: string;
    /** Tests shorten it; Meta itself always gets {@link CALL_TIMEOUT_MS}. */
    timeoutMs?: number;
}

/**
 * Saroh's own WhatsApp number on Meta's Cloud API, called directly (DEC-213).
 * SMS and the OTP widget's token check stay on MSG91: they go to `sms`,
 * unchanged. Never logs or echoes the token, a number, a code, the text or
 * Meta's body.
 */
@Injectable()
export class MetaCloudProvider implements MessagingProvider {
    private readonly logger = new Logger(MetaCloudProvider.name);

    constructor(
        private readonly config: MetaCloudConfig,
        /** SMS and the widget, which stay on MSG91. */
        private readonly sms: Pick<
            MessagingProvider,
            "sendSms" | "verifyOtpWidgetToken"
        >,
        private readonly fetchFn: typeof fetch = (input, init) =>
            fetch(input, init),
    ) {}

    /**
     * Meta's authentication shape: the code as the body's one parameter and
     * again on the copy-code button, which the send names a `url` sub-type
     * (https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates).
     */
    async sendWhatsappAuth({
        toE164,
        code,
    }: WhatsappAuthInput): Promise<SendResult> {
        required(this.config.token, "META_WA_TOKEN");
        const name = required(
            this.config.authTemplate,
            "MSG91_WHATSAPP_TEMPLATE",
        );
        return this.sendTemplate(toE164, name, [
            { type: "body", parameters: [{ type: "text", text: code }] },
            {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: code }],
            },
        ]);
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
        required(this.config.token, "META_WA_TOKEN");
        const name =
            category === "authentication"
                ? required(this.config.authTemplate, "MSG91_WHATSAPP_TEMPLATE")
                : this.config.utilityTemplates?.[template];
        if (!name) return { outcome: "rejected", reason: "unknown_template" };
        return this.sendTemplate(
            toE164,
            name,
            variables.length
                ? [
                      {
                          type: "body",
                          parameters: variables.map((text) => ({
                              type: "text",
                              text,
                          })),
                      },
                  ]
                : [],
        );
    }

    async sendWhatsAppText({
        toE164,
        text,
    }: {
        toE164: string;
        text: string;
    }): Promise<SendResult> {
        required(this.config.token, "META_WA_TOKEN");
        return this.post({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: digits(toE164),
            type: "text",
            text: { body: text },
        });
    }

    sendSms(input: { toE164: string; text: string }): Promise<SmsSendResult> {
        return this.sms.sendSms(input);
    }

    verifyOtpWidgetToken(accessToken: string): Promise<WidgetVerifyResult> {
        return this.sms.verifyOtpWidgetToken(accessToken);
    }

    private sendTemplate(
        toE164: string,
        name: string,
        components: unknown[],
    ): Promise<SendResult> {
        return this.post({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: digits(toE164),
            type: "template",
            template: {
                name,
                language: { code: this.config.templateLang ?? "en_US" },
                ...(components.length ? { components } : {}),
            },
        });
    }

    private async post(body: unknown): Promise<SendResult> {
        const token = required(this.config.token, "META_WA_TOKEN");
        const phoneNumberId = required(
            this.config.phoneNumberId,
            "META_WA_PHONE_NUMBER_ID",
        );
        const base = (this.config.baseUrl ?? GRAPH_API).replace(/\/$/, "");
        let res: Response;
        try {
            res = await this.fetchFn(`${base}/${phoneNumberId}/messages`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(
                    this.config.timeoutMs ?? CALL_TIMEOUT_MS,
                ),
            });
        } catch {
            // Never echo the request: it carries the token, the number and the words.
            throw new Error("Meta WhatsApp send failed: network error");
        }
        // A 5xx is Meta's own trouble: thrown, so the send is tried again.
        if (res.status >= 500)
            throw new Error(
                `Meta WhatsApp send failed with HTTP ${res.status}`,
            );

        const json = (await res.json().catch(() => null)) as MetaReply | null;
        if (res.ok) {
            const id = json?.messages?.[0]?.id;
            if (typeof id === "string" && id)
                return { outcome: "accepted", providerMessageId: id };
            this.logger.warn(
                "Meta WhatsApp send accepted without a message id",
            );
            return { outcome: "rejected", reason: "no_message_id" };
        }
        const code =
            typeof json?.error?.code === "number" ? json.error.code : null;
        if (code === NOT_ON_WHATSAPP) return { outcome: "ineligible" };
        // Only the status and Meta's numeric code are logged, never its words.
        this.logger.warn(
            `Meta WhatsApp send failed with HTTP ${res.status}${code === null ? "" : ` code ${code}`}`,
        );
        return { outcome: "rejected", reason: rejectionCode(res.status, code) };
    }
}

/** The parts of Meta's reply we read: the message id, or the error's code. */
interface MetaReply {
    messages?: { id?: unknown }[];
    error?: { code?: unknown };
}

function required(value: string | undefined, name: string): string {
    if (!value)
        throw new Error(
            `${name} is not set — Saroh's Meta WhatsApp sender is not configured.`,
        );
    return value;
}

function digits(e164: string): string {
    return e164.replace(/^\+/, "");
}

function rejectionCode(status: number, code: number | null): string {
    if (status === 429 || (code !== null && RATE_LIMITED.has(code)))
        return "rate_limited";
    if (status === 401 || status === 403 || code === BAD_TOKEN)
        return "unauthorized";
    if (code !== null) return `whatsapp_${code}`;
    return status >= 400 ? "refused" : "provider_error";
}
