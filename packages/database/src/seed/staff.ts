import { isThrowawayDatabase, seedPassword, STAFF_EMAIL } from "./data";
import type { Db } from "./helpers";
import { hashPassword, id } from "./helpers";

/**
 * Sam, Saroh staff (admin plan U23): a verified login with an active
 * `PlatformAdmin` grant and one role, Platform owner, so the operator
 * console's browser specs open every screen. In no business: the console
 * is not a workspace, and a spec that wants a merchant signs in as one.
 *
 * Only on a database on this machine (a local or CI throwaway). Anywhere
 * else the seed's logins share a password the team holds, and a seed must
 * not hand that password the whole control plane: real staff are granted
 * through the console, with a reason and an audit row. Returns the user's
 * id, or null when it was skipped.
 */
export async function seedStaff(
    prisma: Db,
    databaseUrl: string | undefined = process.env.DATABASE_URL,
): Promise<string | null> {
    if (!isThrowawayDatabase(databaseUrl)) return null;

    const staff = await prisma.user.upsert({
        where: { email: STAFF_EMAIL },
        update: { name: "Sam Staff", emailVerified: true },
        create: {
            id: id("user", "staff"),
            email: STAFF_EMAIL,
            name: "Sam Staff",
            emailVerified: true,
        },
    });
    // better-auth's own hasher, as for the owner and the reviewer.
    await prisma.account.upsert({
        where: { id: id("account", "staff") },
        update: { password: await hashPassword(seedPassword()) },
        create: {
            id: id("account", "staff"),
            accountId: staff.id,
            providerId: "credential",
            userId: staff.id,
            password: await hashPassword(seedPassword()),
        },
    });
    // Active again on every run: a spec that revokes or changes Sam's access
    // must not leave the next run without a console.
    const grant = await prisma.platformAdmin.upsert({
        where: { userId: staff.id },
        update: { revokedAt: null },
        create: {
            id: id("platformadmin", "staff"),
            userId: staff.id,
            note: "Seeded for the console's browser specs",
        },
        select: { id: true },
    });
    await prisma.platformAdminRoleAssignment.upsert({
        where: { id: id("platformrole", "staff", "owner") },
        update: { revokedAt: null, expiresAt: null },
        create: {
            id: id("platformrole", "staff", "owner"),
            platformAdminId: grant.id,
            role: "PLATFORM_OWNER",
            reason: "Seeded for the console's browser specs",
        },
    });
    return staff.id;
}
