import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { DEFAULT_DUE_DAYS } from "../invoices/invoice-state";
import { PRE_DEBIT_LEAD_HOURS } from "../payments/providers/provider.port";
import { accountAreaOn } from "../site-accounts/account-area";
import type { AutopayChargeTiming } from "./autopay-timing";
import { AUTOPAY_LEAD_DAYS, timingOf } from "./autopay-timing";

/**
 * The business's subscription settings, kept on the business profile
 * beside the time zone subscriptions renew in:
 *
 * - "Members can pause from their account" (round-2 A8,
 *   `BusinessProfile.membersCanPause`). On by default; a business with no
 *   profile yet reads as on. On, a member pauses their own plan for 2, 4 or
 *   8 weeks from the account area on the business's site; off, the account
 *   shows no Pause and a customer's pause is refused. Staff pause either
 *   way.
 * - "When autopay charges" (D13B, DEC-065,
 *   `BusinessProfile.autopayChargeTiming`): see `autopay-timing.ts`. A
 *   plan's own choice wins over it.
 */

export interface SubscriptionSettingsView {
    membersCanPause: boolean;
    /**
     * Whether customers have an account area at all yet (A5's switch,
     * `SITE_ACCOUNT_AREA`). Until they do, the workspace doesn't offer a
     * setting that nobody could see the effect of.
     */
    accountArea: boolean;
    /** "When autopay charges" (D13B). Absent from an API older than D13B. */
    autopay: {
        /**
         * Whether autopay can charge for this business: a provider that
         * takes mandates, with its charging on (`RAZORPAY_AUTOPAY`). Off,
         * the workspace hides the setting.
         */
        available: boolean;
        chargeTiming: AutopayChargeTiming;
        /** How many days early an ON_RENEWAL_DATE invoice goes out. */
        leadDays: number;
        /** The bank's notice, in hours before a UPI debit. */
        noticeHours: number;
        /** Days from an invoice's issue to its due date. */
        dueDays: number;
    };
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
    autopayAvailable = false,
): Promise<SubscriptionSettingsView> {
    const profile = await prisma.businessProfile.findUnique({
        where: { organizationId },
        select: { membersCanPause: true, autopayChargeTiming: true },
    });
    return {
        membersCanPause: profile?.membersCanPause ?? true,
        accountArea: accountAreaOn(),
        autopay: {
            available: autopayAvailable,
            chargeTiming: timingOf(profile?.autopayChargeTiming),
            leadDays: AUTOPAY_LEAD_DAYS,
            noticeHours: PRE_DEBIT_LEAD_HOURS,
            dueDays: DEFAULT_DUE_DAYS,
        },
    };
}

/** Set what's given, making the profile if the business has none yet. */
export async function writeSubscriptionSettings(
    organizationId: string,
    value: {
        membersCanPause?: boolean;
        autopayChargeTiming?: AutopayChargeTiming;
    },
    autopayAvailable = false,
): Promise<SubscriptionSettingsView> {
    const data = {
        ...(value.membersCanPause === undefined
            ? {}
            : { membersCanPause: value.membersCanPause }),
        ...(value.autopayChargeTiming === undefined
            ? {}
            : { autopayChargeTiming: value.autopayChargeTiming }),
    };
    await prisma.businessProfile.upsert({
        where: { organizationId },
        create: { organizationId, ...data },
        update: data,
    });
    return readSubscriptionSettings(organizationId, autopayAvailable);
}
