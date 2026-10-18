import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { raiseBillingOpsNoticeInTx } from "./billing-ops-notice";

type Tx = Pick<
    Prisma.TransactionClient,
    "organization" | "adminOrganizationNote" | "billingAction"
>;

export const BILLING_PROFILE_OWNER_LEFT = "billing_profile_owner_left";

/**
 * Someone stopped being an owner of a business (moved to another role,
 * removed, or left) while the business is billed to their billing profile
 * (DEC-167). Billing stays as it is — the profile is theirs, and the
 * business keeps paying on it — but an operator should know, so it is
 * raised in Admin › Billing › Needs action: an owner of the business should
 * choose their own profile in Plan & billing. Written on the caller's
 * transaction, so a refused change raises nothing. Returns whether it was
 * raised.
 */
export async function noticeIfProfileOwnerLeftInTx(
    tx: Tx,
    logger: Pick<Logger, "error">,
    input: { organizationId: string; userId: string },
): Promise<boolean> {
    const org = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: {
            billingProfile: { select: { id: true, ownerUserId: true } },
        },
    });
    const profile = org?.billingProfile;
    if (profile?.ownerUserId !== input.userId) return false;
    await raiseBillingOpsNoticeInTx(tx, logger, {
        code: BILLING_PROFILE_OWNER_LEFT,
        organizationId: input.organizationId,
        refs: { billingProfileId: profile.id, userId: input.userId },
        note: "This business is still billed to the billing profile of someone who is no longer one of its owners. Billing is unchanged. An owner of the business should choose their own profile in Plan & billing.",
    });
    return true;
}
