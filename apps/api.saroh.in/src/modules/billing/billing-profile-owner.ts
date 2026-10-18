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

type DeletingTx = Tx &
    Pick<Prisma.TransactionClient, "billingProfile" | "billingCheckout">;

/**
 * Someone is deleting their account (DEC-167): their billing profiles go
 * with it (cascade), each business billed to one is left with none
 * (SET NULL), and a checkout authorised or waiting on one keeps an id
 * that no longer exists. The deletion isn't refused for it — another
 * owner keeps the business — but every business billed to one of their
 * profiles, or with an OPEN or SCHEDULED checkout on one, raises
 * {@link BILLING_PROFILE_OWNER_LEFT} once in Admin › Billing › Needs
 * action: an owner should choose their own profile in Plan & billing, and
 * a subscription authorised on the deleted profile's customer may need
 * cancelling. Run before the user's row is deleted, on the caller's
 * transaction. Returns the businesses it raised it for.
 */
export async function noticeProfilesOfDeletedOwnerInTx(
    tx: DeletingTx,
    logger: Pick<Logger, "error">,
    userId: string,
): Promise<string[]> {
    const profiles = await tx.billingProfile.findMany({
        where: { ownerUserId: userId },
        select: { id: true },
    });
    if (profiles.length === 0) return [];
    const ids = profiles.map((p) => p.id);
    const [billed, live] = await Promise.all([
        tx.organization.findMany({
            where: { billingProfileId: { in: ids } },
            select: { id: true, billingProfileId: true },
        }),
        tx.billingCheckout.findMany({
            where: {
                billingProfileId: { in: ids },
                status: { in: ["OPEN", "SCHEDULED"] },
            },
            select: { id: true, organizationId: true, billingProfileId: true },
        }),
    ]);
    const byBusiness = new Map<
        string,
        { billingProfileId: string | null; checkoutIds: string[] }
    >();
    for (const org of billed) {
        byBusiness.set(org.id, {
            billingProfileId: org.billingProfileId,
            checkoutIds: [],
        });
    }
    for (const c of live) {
        const seen = byBusiness.get(c.organizationId) ?? {
            billingProfileId: c.billingProfileId,
            checkoutIds: [],
        };
        seen.checkoutIds.push(c.id);
        byBusiness.set(c.organizationId, seen);
    }
    for (const [organizationId, seen] of byBusiness) {
        await raiseBillingOpsNoticeInTx(tx, logger, {
            code: BILLING_PROFILE_OWNER_LEFT,
            organizationId,
            refs: {
                billingProfileId: seen.billingProfileId,
                userId,
                checkoutIds: seen.checkoutIds.join(",") || null,
            },
            note: "The owner of a billing profile this business is billed to, or has a payment waiting or authorised on, deleted their account, and the profile went with it. If the business was billed to it, it now has none and chooses one before it next pays. A subscription authorised on that profile's customer keeps charging it until it is cancelled or replaced. An owner of the business should choose their own profile in Plan & billing.",
            dedupeKey: `${BILLING_PROFILE_OWNER_LEFT}:deleted:${userId}:${organizationId}`,
        });
    }
    return [...byBusiness.keys()];
}
