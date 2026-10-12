import { prisma } from "@saroh/database";

import { accountThreadOffered, accountUpdatesChosen } from "./account-thread";

/**
 * "Updates in your customers' Messages" (12 Oct 2026), for Settings ›
 * Providers: the business's own choice to have Saroh post order, booking
 * and invoice updates into a customer's account thread on its site.
 *
 * The rule the posts follow is `accountThreadOn` (`account-thread.ts`);
 * this is only what the workspace reads to draw the row, and the write.
 */
export interface AccountUpdatesView {
    /** The business's choice. On by default. */
    on: boolean;
    /**
     * Whether the choice can have an effect yet: the account area is on
     * for the instance and the rollout flag is on for this business. Until
     * then the workspace doesn't offer a switch that does nothing.
     */
    offered: boolean;
    /**
     * Whether the business has its own email provider connected: with
     * none, its customers hear of an update nowhere else, and the
     * workspace says so before the choice is turned off.
     */
    emailConnected: boolean;
}

export async function readAccountUpdates(
    organizationId: string,
): Promise<AccountUpdatesView> {
    const [on, offered, provider] = await Promise.all([
        accountUpdatesChosen(organizationId),
        accountThreadOffered(organizationId),
        prisma.communicationProvider.findUnique({
            where: {
                organizationId_channel: { organizationId, channel: "EMAIL" },
            },
            select: { status: true },
        }),
    ]);
    return { on, offered, emailConnected: provider?.status === "CONNECTED" };
}

/** Set the choice, making the profile if the business has none yet. */
export async function writeAccountUpdates(
    organizationId: string,
    on: boolean,
): Promise<AccountUpdatesView> {
    await prisma.businessProfile.upsert({
        where: { organizationId },
        create: { organizationId, accountUpdates: on },
        update: { accountUpdates: on },
    });
    return readAccountUpdates(organizationId);
}
