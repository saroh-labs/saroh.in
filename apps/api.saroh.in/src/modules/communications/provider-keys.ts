import {
    BadRequestException,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { CommunicationProvider } from "@saroh/database";
import { prisma } from "@saroh/database";

import { KEYS_REFUSED } from "../../common/providers/provider-attention";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { domainOf } from "./providers/email.provider";
import type {
    CommsProvider,
    CommsVerifyInput,
} from "./providers/provider.port";

/**
 * A business's messaging keys, checked on connect and watched on use
 * (UX-012). A fake Resend key used to be saved as CONNECTED, and would
 * have quietly stopped Saroh's own fallback sending too (DEC-086).
 */

const LABELS: Partial<Record<string, string>> = {
    RESEND: "Resend",
    SENDGRID: "SendGrid",
    SMTP: "Your SMTP relay",
    TWILIO: "Twilio",
    META: "WhatsApp",
};

/**
 * Refuse keys the provider doesn't accept, before anything is stored:
 * 400 under the key's field, or under the sending address when its
 * domain isn't verified; a deliberate 503 when the provider can't say.
 * A provider the adapter can't check is let through.
 */
export async function assertCommsKeysAccepted(
    adapter: CommsProvider,
    input: CommsVerifyInput,
): Promise<void> {
    const check = (await adapter.verifyCredentials?.(input)) ?? null;
    if (check === null || check === "ACCEPTED") return;
    const label = LABELS[input.provider] ?? input.provider;
    if (check === "REJECTED") {
        throw new BadRequestException({
            message: `${label} didn't accept this API key. Copy it from your ${label} dashboard again.`,
            field: "apiKey",
        });
    }
    if (check === "DOMAIN_UNVERIFIED") {
        const domain = domainOf(input.fromAddress) ?? "this domain";
        throw new BadRequestException({
            message: `${label} hasn't verified ${domain} yet. Verify it in ${label}, or send from an address on a domain it has verified.`,
            field: "fromAddress",
        });
    }
    throw new ServiceUnavailableException({
        message: `We couldn't reach ${label} to check this key. Try again in a minute.`,
        details: { reason: "provider-unreachable" },
    });
}

/**
 * Mark a messaging connection as needing attention and queue the team's
 * alert (the bell only), on one transaction. Only a connection not
 * already flagged is marked, so each refusal tells the team once; true
 * when this call did.
 */
export async function flagCommsProvider(
    row: Pick<CommunicationProvider, "id" | "organizationId" | "channel">,
    now: Date = new Date(),
): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
        const marked = await tx.communicationProvider.updateMany({
            where: {
                id: row.id,
                organizationId: row.organizationId,
                attentionAt: null,
            },
            data: { attentionReason: KEYS_REFUSED, attentionAt: now },
        });
        if (marked.count === 0) return false;
        // WhatsApp has no alert wording yet; its row still shows it.
        if (row.channel === "EMAIL") {
            await enqueueTeamAlert(tx, row.organizationId, {
                event: "provider",
                channel: "EMAIL",
                providerId: row.id,
                since: now.toISOString(),
            });
        }
        return true;
    });
}
