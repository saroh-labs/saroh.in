import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { accountAreaOn } from "../site-accounts/account-area";

/**
 * The business's subscription settings (round-2 A8): "Members can pause
 * from their account", kept on the business profile beside the time zone
 * subscriptions renew in (`BusinessProfile.membersCanPause`). On by
 * default; a business with no profile yet reads as on.
 *
 * On, a member pauses their own plan for 2, 4 or 8 weeks from the account
 * area on the business's site; off, the account shows no Pause and a
 * customer's pause is refused. Staff pause either way.
 */

export interface SubscriptionSettingsView {
    membersCanPause: boolean;
    /**
     * Whether customers have an account area at all yet (A5's switch,
     * `SITE_ACCOUNT_AREA`). Until they do, the workspace doesn't offer a
     * setting that nobody could see the effect of.
     */
    accountArea: boolean;
}

type Db = Pick<Prisma.TransactionClient, "businessProfile">;

/** Whether this business lets members pause from their account. */
export async function membersCanPause(
    organizationId: string,
    db: Db = prisma,
): Promise<boolean> {
    const profile = await db.businessProfile.findUnique({
        where: { organizationId },
        select: { membersCanPause: true },
    });
    return profile?.membersCanPause ?? true;
}

export async function readSubscriptionSettings(
    organizationId: string,
): Promise<SubscriptionSettingsView> {
    return {
        membersCanPause: await membersCanPause(organizationId),
        accountArea: accountAreaOn(),
    };
}

/** Set it, making the profile if the business has none yet. */
export async function writeSubscriptionSettings(
    organizationId: string,
    value: { membersCanPause: boolean },
): Promise<SubscriptionSettingsView> {
    await prisma.businessProfile.upsert({
        where: { organizationId },
        create: { organizationId, membersCanPause: value.membersCanPause },
        update: { membersCanPause: value.membersCanPause },
    });
    return readSubscriptionSettings(organizationId);
}
