import { Logger } from "@nestjs/common";

import type {
    CommsProvider,
    CommsSendInput,
    CommsSendResult,
} from "./provider.port";

/**
 * WhatsApp adapter (S6-001).
 *
 * Hands one message to a Meta Cloud API-style WhatsApp endpoint
 * (`POST https://graph.facebook.com/<version>/<phoneNumberId>/messages`)
 * authenticated with a Bearer `accessToken` from the org's sealed credentials.
 * The `phoneNumberId` (the org's registered sender) also comes from the sealed
 * credentials; the body is sent as a plain text message. This same generic
 * shape stands in for the TWILIO provider this adapter is registered for.
 *
 * SECURITY: on any non-2xx the error is SANITIZED to the HTTP status only —
 * never the Authorization header, the access token, or the raw provider body.
 */
export class WhatsappCommsProvider implements CommsProvider {
    readonly channel = "WHATSAPP" as const;
    private readonly logger = new Logger(WhatsappCommsProvider.name);
    private readonly providers = ["TWILIO", "META"];

    supports(provider: string): boolean {
        return this.providers.includes(provider);
    }

    async send(input: CommsSendInput): Promise<CommsSendResult> {
        const { to, body, credentials } = input;

        const { accessToken, phoneNumberId, apiVersion, baseUrl } =
            credentials as {
                accessToken?: string;
                phoneNumberId?: string;
                apiVersion?: string;
                baseUrl?: string;
            };
        if (!accessToken || !phoneNumberId) {
            // Shape error only — never name/echo any credential value.
            throw new Error(
                "WhatsApp send failed: provider credentials are incomplete",
            );
        }
        const version = apiVersion ?? "v19.0";
        const origin = (baseUrl ?? "https://graph.facebook.com").replace(
            /\/$/,
            "",
        );

        let res: Response;
        try {
            res = await fetch(
                `${origin}/${version}/${phoneNumberId}/messages`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to,
                        type: "text",
                        text: { body },
                    }),
                },
            );
        } catch {
            // Network failure — never echo the request (it carries the token).
            throw new Error("WhatsApp send failed: network error");
        }

        if (!res.ok) {
            this.logger.warn(`WhatsApp send failed with HTTP ${res.status}`);
            throw new Error(`WhatsApp send failed (HTTP ${res.status})`);
        }

        const payload = (await res.json()) as {
            messages?: { id?: string }[];
        };
        const providerMessageId = payload.messages?.[0]?.id;
        if (!providerMessageId) {
            throw new Error(
                "WhatsApp send failed: missing message id in provider response",
            );
        }
        return { providerMessageId };
    }
}
