import { Logger } from "@nestjs/common";

import type { CredentialCheck } from "../../../common/providers/provider-attention";
import {
    ProviderKeysRefusedError,
    refusesKeys,
} from "../../../common/providers/provider-attention";
import { providerCallSignal } from "../../payments/providers/provider-call";
import type {
    CommsProvider,
    CommsSendInput,
    CommsSendResult,
    CommsVerifyInput,
} from "./provider.port";
import { relayBase } from "./relay-base";

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

    /**
     * Meta's token, checked on connect (review 04 H4) by reading the
     * phone number it should send from: a token Meta refuses, or a number
     * it can't reach, is REJECTED; a permission error (the token may send
     * but not read) is ACCEPTED; anything else Meta says is UNSURE.
     */
    async verifyCredentials(
        input: CommsVerifyInput,
    ): Promise<CredentialCheck | null> {
        const { accessToken, phoneNumberId, apiVersion, baseUrl } =
            input.credentials as Record<string, string | undefined>;
        if (input.provider !== "META" || baseUrl) return null;
        if (!accessToken || !phoneNumberId) return "REJECTED";
        let res: Response;
        try {
            res = await fetch(
                `${GRAPH}/${apiVersion ?? VERSION}/${encodeURIComponent(phoneNumberId)}?fields=id`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    signal: providerCallSignal(),
                },
            );
        } catch {
            return "UNSURE";
        }
        if (res.ok) return "ACCEPTED";
        const code = await errorCode(res);
        // 10 and 200 are permission errors: a token that can send but not
        // read the number's details is a working token (07 F12).
        if (code === 10 || code === 200) return "ACCEPTED";
        // 190: the token itself is bad; 100: no such number for it.
        if (res.status === 401 || code === 190 || code === 100) {
            return "REJECTED";
        }
        this.logger.warn(`WhatsApp key check answered HTTP ${res.status}`);
        return "UNSURE";
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
        const version = apiVersion ?? VERSION;
        const origin = await relayBase(baseUrl, GRAPH);

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
            const message = `WhatsApp send failed (HTTP ${res.status})`;
            // A revoked or expired token (401/403, or Meta's 400 code 190):
            // the connection needs reconnecting, not only a retry.
            if (refusesKeys(res.status) || (await errorCode(res)) === 190) {
                throw new ProviderKeysRefusedError(message, res.status);
            }
            throw new Error(message);
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

const GRAPH = "https://graph.facebook.com";
const VERSION = "v19.0";

/** Meta's `error.code` in a refusal, or null; never the body itself. */
async function errorCode(res: Response): Promise<number | null> {
    try {
        const body = (await res.json()) as { error?: { code?: unknown } };
        return typeof body.error?.code === "number" ? body.error.code : null;
    } catch {
        return null;
    }
}
