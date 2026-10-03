import { prisma } from "@saroh/database";

import { openProviderCredentials } from "./provider-credentials";
import type {
    MandateCapability,
    ProviderCredentials,
    ProviderFactory,
} from "./providers/provider.port";

/** A business's provider connection, opened for one round of mandate calls. */
export interface MandateConnection {
    provider: string;
    mandates: MandateCapability;
    /** In memory only, for these calls. Never logged or returned. */
    credentials: ProviderCredentials;
}

/**
 * The business's connection to `provider`, with its mandate capability.
 * Null when there's no connection, or its adapter has no mandates
 * (`supportsMandates` false). `connectedOnly` refuses a disconnected
 * (DISABLED) one: a set-up or a charge needs a live connection, while a
 * cancel still goes through one, since the mandate is still live at the
 * provider.
 */
export async function openMandateConnection(
    providers: ProviderFactory,
    organizationId: string,
    provider: string,
    opts: { connectedOnly: boolean },
): Promise<MandateConnection | null> {
    const row = await prisma.merchantPaymentProvider.findUnique({
        where: { organizationId_provider: { organizationId, provider } },
    });
    if (!row) return null;
    if (opts.connectedOnly && row.status !== "CONNECTED") return null;
    let mandates: MandateCapability | undefined;
    try {
        mandates = providers.get(provider).mandates;
    } catch {
        return null;
    }
    if (!mandates) return null;
    return {
        provider: row.provider,
        mandates,
        credentials: openProviderCredentials(row),
    };
}

/**
 * The connected providers of a business whose adapters can take autopay,
 * oldest first — where a set-up is sent when the caller names none.
 */
export async function mandateProviders(
    providers: ProviderFactory,
    organizationId: string,
): Promise<string[]> {
    const rows = await prisma.merchantPaymentProvider.findMany({
        where: { organizationId, status: "CONNECTED" },
        select: { provider: true },
        orderBy: { createdAt: "asc" },
    });
    return rows
        .map((r) => r.provider)
        .filter((name) => {
            try {
                return providers.get(name).mandates !== undefined;
            } catch {
                return false;
            }
        });
}
