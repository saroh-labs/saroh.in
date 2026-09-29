import type { MerchantPaymentProvider } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { decryptSecret } from "./crypto";
import type { SupportedProvider } from "./providers/provider.port";
import { SUPPORTED_PROVIDERS } from "./providers/provider.port";
import type { SealedCredentials } from "./webhook-secret";
import {
    needsWebhookSecret,
    WEBHOOK_EVENTS,
    webhookSecretFrom,
} from "./webhook-secret";

/**
 * What the app shows about a connection's webhook (DEC-063): whether it
 * lacks the secret its provider signs with, and the address to register.
 * The rules themselves are in `webhook-secret.ts`, which loads no env.
 */

type SealedRow = Pick<
    MerchantPaymentProvider,
    "provider" | "encryptedCredentials" | "credentialsIv" | "credentialsAuthTag"
>;

/**
 * Whether a connection can't have its payments confirmed because it was
 * saved without the webhook secret its provider signs with — a Razorpay
 * connection made before DEC-063. Opens the blob in memory only; nothing
 * but the yes or no leaves here.
 *
 * A blob that can't be opened (a seed's placeholder, a key that isn't set
 * here) says nothing either way, so it is not flagged: the flag names one
 * fix, entering the webhook secret, and that would not be it.
 */
export function lacksWebhookSecret(row: SealedRow): boolean {
    if (!needsWebhookSecret(row.provider)) return false;
    let creds: SealedCredentials;
    try {
        creds = JSON.parse(
            decryptSecret({
                ciphertext: row.encryptedCredentials,
                iv: row.credentialsIv,
                authTag: row.credentialsAuthTag,
            }),
        ) as SealedCredentials;
    } catch {
        return false;
    }
    return webhookSecretFrom(row.provider, creds) === null;
}

/** The API's own public address, which providers POST webhooks to. */
function apiBase(): string {
    const base =
        env.BETTER_AUTH_URL ??
        (env.NODE_ENV === "development"
            ? "https://api.saroh.localhost"
            : "https://api.saroh.in");
    return base.replace(/\/$/, "");
}

/**
 * The address to register in the provider's dashboard for this business —
 * `webhooks.controller.ts`'s route. The organization id in it is not a
 * secret: trust comes from the signature, never the URL.
 */
export function webhookUrl(organizationId: string, provider: string): string {
    return `${apiBase()}/public/webhooks/${provider.toLowerCase()}/${encodeURIComponent(organizationId)}`;
}

/** A provider's webhook, as setup shows it (DEC-063). Nothing secret. */
export interface WebhookSetup {
    provider: SupportedProvider;
    /** Where the provider sends payment updates for this business. */
    url: string;
    /** What to tick in the provider's dashboard. */
    events: string[];
    /** Whether setup asks for a signing secret of its own (Razorpay). */
    secretRequired: boolean;
    /**
     * When a payment update from it last arrived. The webhook inbox keeps
     * only deliveries whose signature checked out, so one here proves the
     * webhook and its secret match. `null`: none yet.
     */
    lastReceivedAt: Date | null;
}

/**
 * Every provider's webhook for one business — connected or not, so setup
 * can show the address before the first connect. Scoped to the business
 * the caller proved (`ctx.organizationId`), never one it names.
 */
export function readWebhookSetup(
    organizationId: string,
    db: Pick<typeof prisma, "webhookEvent"> = prisma,
): Promise<WebhookSetup[]> {
    return Promise.all(
        SUPPORTED_PROVIDERS.map(async (provider) => {
            const last = await db.webhookEvent.findFirst({
                where: { organizationId, provider },
                orderBy: { createdAt: "desc" },
                select: { createdAt: true },
            });
            return {
                provider,
                url: webhookUrl(organizationId, provider),
                events: [...WEBHOOK_EVENTS[provider]],
                secretRequired: needsWebhookSecret(provider),
                lastReceivedAt: last?.createdAt ?? null,
            };
        }),
    );
}
