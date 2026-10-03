import {
    ensureStorefrontTeamRole,
    STOREFRONT_TEAM_ROLE_KEY,
} from "../backfill/store-members-to-memberships";
import { STOREFRONT_TEAM_EMAIL, STOREFRONT_TEAM_PASSWORD } from "./data";
import type { Db } from "./helpers";
import { hashPassword, id } from "./helpers";

/**
 * Someone on one of Northwind's storefronts (F16, DEC-074): Farah, a Viewer
 * on Northwind Store, on the team as "Storefront team". Her orders are
 * Northwind Store's; Online's are another location's. Without her, a
 * location's team could only be tried by writing the rows by hand.
 *
 * No `membership.storefront-join` Activity entry: she was seeded, not
 * invited, so Team's one-time notice doesn't name her.
 */
export async function seedStorefrontTeammate(
    prisma: Db,
    orgId: string,
    storeId: string,
): Promise<void> {
    const farah = await prisma.user.upsert({
        where: { email: STOREFRONT_TEAM_EMAIL },
        update: { name: "Farah Sheikh", emailVerified: true },
        create: {
            id: id("user", "storefront"),
            email: STOREFRONT_TEAM_EMAIL,
            name: "Farah Sheikh",
            emailVerified: true,
        },
    });
    // better-auth's own hasher, as for the owner and the reviewer.
    await prisma.account.upsert({
        where: { id: id("account", "storefront") },
        update: { password: await hashPassword(STOREFRONT_TEAM_PASSWORD) },
        create: {
            id: id("account", "storefront"),
            accountId: farah.id,
            providerId: "credential",
            userId: farah.id,
            password: await hashPassword(STOREFRONT_TEAM_PASSWORD),
        },
    });

    await prisma.$transaction((tx) => ensureStorefrontTeamRole(tx, orgId));
    await prisma.membership.upsert({
        where: {
            organizationId_userId: { organizationId: orgId, userId: farah.id },
        },
        update: { role: STOREFRONT_TEAM_ROLE_KEY },
        create: {
            id: id("membership", "storefront"),
            organizationId: orgId,
            userId: farah.id,
            role: STOREFRONT_TEAM_ROLE_KEY,
        },
    });
    await prisma.storeMembers.upsert({
        where: { storeId_userId: { storeId, userId: farah.id } },
        update: { role: "VIEWER" },
        create: {
            id: id("storemember", "storefront"),
            storeId,
            userId: farah.id,
            role: "VIEWER",
        },
    });
}
