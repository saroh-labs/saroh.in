import { prisma } from "@saroh/database";

/**
 * How much of a catalogue row one business uses, for the rows the business
 * page can count today: products that aren't archived, and team members
 * (memberships and pending invitations, KTD-9). A row not listed has no
 * count yet (metering, U13) and reads as not measured, never as zero.
 *
 * CROSS-TENANT READ: called only by the admin services, behind the admin
 * guards, for the one business in the path.
 */
export async function catalogueUsage(
    organizationId: string,
): Promise<Record<string, number>> {
    const [products, members, invitations] = await Promise.all([
        prisma.product.count({
            where: { organizationId, status: { not: "ARCHIVED" } },
        }),
        prisma.membership.count({ where: { organizationId } }),
        prisma.organizationInvitation.count({
            where: { organizationId, status: "PENDING" },
        }),
    ]);
    return { products, members: members + invitations };
}
