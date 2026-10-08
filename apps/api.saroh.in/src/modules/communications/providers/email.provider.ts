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

const RESEND_API = "https://api.resend.com";

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
 * Attachments (DEC-083, the invoice PDF) go only to RESEND, whose
 * documented `/emails` API takes `attachments: [{ filename, content }]`
 * with the content base64-encoded (40 MB a message, after encoding).
 * SENDGRID and SMTP are reached here through a relay speaking this same
 * shape, and nothing says a relay passes attachments on — one that
 * rejected the field would fail the send — so they send the message alone,
 * its link to the invoice as before.
 *
 * SECURITY: on any non-2xx the error is SANITIZED to the HTTP status only —
 * never the Authorization header, the api key, or the raw provider body.
 */
export class EmailCommsProvider implements CommsProvider {
    readonly channel = "EMAIL" as const;
    private readonly logger = new Logger(EmailCommsProvider.name);
    private readonly providers = ["RESEND", "SENDGRID", "SMTP"];
    /** The providers known to take attachments in this request shape. */
    private readonly attaching = ["RESEND"];

    supports(provider: string): boolean {
        return this.providers.includes(provider);
    }

    takesAttachments(provider: string): boolean {
        return this.attaching.includes(provider);
    }

    /**
     * Resend's key, checked on connect (UX-012) with `GET /domains`: a
     * full-access key lists the account's domains, so the sending
     * address's domain must be among them and verified; a sending-only key
     * is refused that read as `restricted_api_key`, which still proves the
     * key, so its domain is left to the first send. 401/403 otherwise
     * rejects; anything else is unsure. SENDGRID and SMTP go through a
     * relay of this same shape whose checks we don't know, and a Resend
     * key pointed at another `baseUrl` is a relay too: not checked (null).
     */
    async verifyCredentials(
        input: CommsVerifyInput,
    ): Promise<CredentialCheck | null> {
        const { apiKey, baseUrl } = input.credentials as {
            apiKey?: string;
            baseUrl?: string;
        };
        if (input.provider !== "RESEND" || baseUrl) return null;
        if (!apiKey) return "REJECTED";

        let res: Response;
        try {
            res = await fetch(`${RESEND_API}/domains`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: providerCallSignal(),
            });
        } catch {
            return "UNSURE";
        }
        const body = await readJson(res);
        if (res.ok) {
            const domain = domainOf(input.fromAddress);
            if (!domain) return "ACCEPTED";
            const domains = Array.isArray(body?.data) ? body.data : [];
            const verified = domains.some(
                (d) =>
                    typeof d === "object" &&
                    d !== null &&
                    String((d as { name?: unknown }).name).toLowerCase() ===
                        domain &&
                    (d as { status?: unknown }).status === "verified",
            );
            return verified ? "ACCEPTED" : "DOMAIN_UNVERIFIED";
        }
        if (res.status === 401 && body?.name === "restricted_api_key") {
            return "ACCEPTED";
        }
        if (refusesKeys(res.status)) return "REJECTED";
        this.logger.warn(`Resend key check answered HTTP ${res.status}`);
        return "UNSURE";
    }

    async send(input: CommsSendInput): Promise<CommsSendResult> {
        const { to, from, subject, body, credentials, attachments } = input;

        const { apiKey, baseUrl } = credentials as {
            apiKey?: string;
            baseUrl?: string;
        };
        if (!apiKey) {
            // Shape error only — never name/echo any credential value.
            throw new Error("Email send failed: provider api key is missing");
        }
        const url = `${(baseUrl ?? RESEND_API).replace(/\/$/, "")}/emails`;

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
                    ...(attachments && attachments.length > 0
                        ? {
                              attachments: attachments.map((a) => ({
                                  filename: a.fileName,
                                  content: a.content.toString("base64"),
                                  content_type: a.contentType,
                              })),
                          }
                        : {}),
                }),
            });
        } catch {
            // Network failure — never echo the request (it carries the key).
            throw new Error("Email send failed: network error");
        }

        if (!res.ok) {
            this.logger.warn(`Email send failed with HTTP ${res.status}`);
            const message = `Email send failed (HTTP ${res.status})`;
            // The provider refused the keys (or what they may send): the
            // connection needs attention, not only a retry (UX-012).
            if (refusesKeys(res.status)) {
                throw new ProviderKeysRefusedError(message, res.status);
            }
            throw new Error(message);
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

/** A JSON answer's top level, or null when it has none we can read. */
async function readJson(
    res: Response,
): Promise<{ data?: unknown[]; name?: unknown } | null> {
    try {
        const body: unknown = await res.json();
        return typeof body === "object" && body !== null ? body : null;
    } catch {
        return null;
    }
}

/** The domain an address sends from, lower-cased; null without one. */
export function domainOf(address?: string | null): string | null {
    const at = address?.lastIndexOf("@") ?? -1;
    if (!address || at < 0) return null;
    // "Name <hello@shop.in>" as well as "hello@shop.in". Cut at the first
    // ">" by index: a regex here ran in quadratic time on a string of ">".
    const rest = address.slice(at + 1);
    const close = rest.indexOf(">");
    const domain = (close < 0 ? rest : rest.slice(0, close))
        .trim()
        .toLowerCase();
    return domain || null;
}
