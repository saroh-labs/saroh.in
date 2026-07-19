import { Logger } from "@nestjs/common";

import type {
    CommsProvider,
    CommsSendInput,
    CommsSendResult,
} from "./provider.port";

/**
 * Email adapter (S6-001).
 *
 * Hands one message to a Resend-style transactional-email API
 * (`POST https://api.resend.com/emails`) authenticated with a Bearer `apiKey`
 * from the org's sealed credentials. The same generic JSON shape covers the
 * SENDGRID / SMTP-bridge providers this adapter is registered for; the base URL
 * and key name are read from the (decrypted) credentials so a self-hosted relay
 * can point elsewhere.
 *
 * SECURITY: on any non-2xx the error is SANITIZED to the HTTP status only —
 * never the Authorization header, the api key, or the raw provider body.
 */
export class EmailCommsProvider implements CommsProvider {
    readonly channel = "EMAIL" as const;
    private readonly logger = new Logger(EmailCommsProvider.name);
    private readonly providers = ["RESEND", "SENDGRID", "SMTP"];

    supports(provider: string): boolean {
        return this.providers.includes(provider);
    }

    async send(input: CommsSendInput): Promise<CommsSendResult> {
        const { to, from, subject, body, credentials } = input;

        const { apiKey, baseUrl } = credentials as {
            apiKey?: string;
            baseUrl?: string;
        };
        if (!apiKey) {
            // Shape error only — never name/echo any credential value.
            throw new Error("Email send failed: provider api key is missing");
        }
        const url = `${(baseUrl ?? "https://api.resend.com").replace(/\/$/, "")}/emails`;

        let res: Response;
        try {
            res = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from,
                    to,
                    subject: subject ?? "",
                    html: body,
                }),
            });
        } catch {
            // Network failure — never echo the request (it carries the key).
            throw new Error("Email send failed: network error");
        }

        if (!res.ok) {
            this.logger.warn(`Email send failed with HTTP ${res.status}`);
            throw new Error(`Email send failed (HTTP ${res.status})`);
        }

        const payload = (await res.json()) as { id?: string };
        if (!payload.id) {
            throw new Error(
                "Email send failed: missing message id in provider response",
            );
        }
        return { providerMessageId: payload.id };
    }
}
