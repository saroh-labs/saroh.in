import {
    BadRequestException,
    Logger,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { MerchantPaymentProvider } from "@saroh/database";
import { prisma } from "@saroh/database";

import {
    isKeysRefused,
    KEYS_REFUSED,
    NO_ATTENTION,
} from "../../common/providers/provider-attention";
import { queueProviderBack } from "../notifications/provider-alerts";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import type {
    MerchantProvider,
    ProviderCredentials,
} from "./providers/provider.port";

/**
 * A business's payment keys, checked on connect and watched on use
 * (UX-012). Fake keys used to be saved as CONNECTED; a customer pressing
 * Pay then hit an unhandled 500 and nobody told the business.
 */

const logger = new Logger("PaymentProviderKeys");

/** How a provider is named to the merchant. */
export function providerLabel(provider: string): string {
    if (provider === "RAZORPAY") return "Razorpay";
    if (provider === "CASHFREE") return "Cashfree";
    return provider;
}

/**
 * Refuse keys the provider doesn't accept, before anything is stored.
 * 400 under the secret's field when it refuses them; a deliberate 503
 * when it can't say, so a typo is never saved as connected. An adapter
 * without a check (none today) is let through.
 */
export async function assertKeysAccepted(
    adapter: MerchantProvider,
    provider: string,
    credentials: ProviderCredentials,
): Promise<void> {
    if (!adapter.verifyCredentials) return;
    const label = providerLabel(provider);
    const check = await adapter.verifyCredentials(credentials);
    if (check === "ACCEPTED") return;
    if (check === "REJECTED") {
        throw new BadRequestException({
            message: `${label} didn't accept these keys. Copy the key id and secret from your ${label} dashboard again, in the same mode (test or live).`,
            field: "keySecret",
        });
    }
    throw new ServiceUnavailableException({
        message: `We couldn't reach ${label} to check these keys. Try again in a minute.`,
        details: { reason: "provider-unreachable" },
    });
}

/** What a customer reads when the business's provider fails at checkout. */
export const PROVIDER_FAILED_MESSAGE =
    "The business can't take payment online right now. Please try again later, or pay them another way.";

/**
 * A provider order that failed, as a handled answer (UX-012): a
 * deliberate 503 in the customer's words, never the provider's. When the
 * provider refused the keys themselves the connection is marked as
 * needing attention and the team is told, once per refusal. Returns the
 * exception for the caller to throw.
 */
export async function providerOrderFailed(
    row: Pick<MerchantPaymentProvider, "id" | "organizationId" | "provider">,
    err: unknown,
    now: Date = new Date(),
): Promise<ServiceUnavailableException> {
    const refused = isKeysRefused(err);
    // The adapter's message keeps only the HTTP status, never a key.
    logger.warn(
        `${providerLabel(row.provider)} order failed for business ${row.organizationId}: ${
            err instanceof Error ? err.message : "unknown error"
        }`,
    );
    if (refused) {
        try {
            await flagPaymentProvider(row, now);
        } catch (flagErr) {
            // The customer's answer never waits on the flag.
            logger.warn(
                `Could not mark provider ${row.id} as needing attention: ${
                    flagErr instanceof Error ? flagErr.message : "unknown"
                }`,
            );
        }
    }
    return new ServiceUnavailableException({
        message: PROVIDER_FAILED_MESSAGE,
        details: {
            reason: refused ? "provider-keys-refused" : "provider-unavailable",
        },
    });
}

/**
 * Mark a payment connection as needing attention and queue the team's
 * alert, on one transaction. Only a connection not already flagged is
 * marked, so each refusal tells the team once; true when this call did.
 */
export async function flagPaymentProvider(
    row: Pick<MerchantPaymentProvider, "id" | "organizationId">,
    now: Date = new Date(),
): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const marked = await tx.merchantPaymentProvider.updateMany({
            where: {
                id: row.id,
                organizationId: row.organizationId,
                attentionAt: null,
            },
            data: { attentionReason: KEYS_REFUSED, attentionAt: now },
        });
        if (marked.count === 0) return false;
        await enqueueTeamAlert(tx, row.organizationId, {
            event: "provider",
            change: "down",
            channel: "PAYMENTS",
            providerId: row.id,
            since: now.toISOString(),
        });
        return true;
    });
}

/**
 * A flagged payment connection whose provider order went through after all
 * (#555): the provider let the keys back in. Clears the flag it was read
 * with (one flagged again since stands) and queues "working again" on the
 * same transaction, when the team was told it stopped. Never fails the
 * customer's checkout: a failure here is only logged. True when this call
 * cleared it.
 */
export async function paymentProviderWorks(
    row: Pick<MerchantPaymentProvider, "id" | "organizationId" | "attentionAt">,
    now: Date = new Date(),
): Promise<boolean> {
    const flaggedAt = row.attentionAt;
    if (!flaggedAt) return false;
    try {
        return await prisma.$transaction(async (tx) => {
            const cleared = await tx.merchantPaymentProvider.updateMany({
                where: {
                    id: row.id,
                    organizationId: row.organizationId,
                    attentionAt: flaggedAt,
                },
                data: NO_ATTENTION,
            });
            if (cleared.count === 0) return false;
            await queueProviderBack(tx, row, "PAYMENTS", now);
            return true;
        });
    } catch (err) {
        logger.warn(
            `Could not clear provider ${row.id}'s attention: ${
                err instanceof Error ? err.message : "unknown"
            }`,
        );
        return false;
    }
}
