import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { ProviderFactory } from "./providers/provider.port";

// Stateless: it reads the flag rows on every call.
const rolloutFlags = new FeatureFlagService();

/**
 * Whether Saroh may charge a mandate at `provider` for this business
 * (round-2 D13; waves plan, release boundary 6): the business's connection
 * is live, its adapter takes mandates, and the adapter's rollout flag
 * (Razorpay: `RAZORPAY_AUTOPAY`) is on for it. Off, a renewal is invoiced
 * with a pay link exactly as before D13, and Retry makes a pay link.
 *
 * Fails closed: an unknown provider, a missing connection or a flag that
 * can't be read is "no".
 */
export async function mandateChargingOn(
    providers: ProviderFactory,
    organizationId: string,
    provider: string,
): Promise<boolean> {
    try {
        const mandates = providers.get(provider).mandates;
        if (!mandates) return false;
        const connection = await prisma.merchantPaymentProvider.findUnique({
            where: { organizationId_provider: { organizationId, provider } },
            select: { status: true },
        });
        if (connection?.status !== "CONNECTED") return false;
        const flag = mandates.rolloutFlag;
        return !flag || (await rolloutFlags.isEnabled(flag, organizationId));
    } catch {
        return false;
    }
}
