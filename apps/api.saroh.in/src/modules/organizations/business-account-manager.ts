import { prisma } from "@saroh/database";

/**
 * The business sees its manager (DEC-169, admin console U26).
 *
 * Who at Saroh looks after this business, as the business itself reads it:
 * the manager's name and the work email on their staff profile, only while
 * a link is open. Never the email they sign in to the console with, and no
 * phone (owner, 18 Oct): the business reaches them at work, not at home.
 */
export interface BusinessAccountManager {
    /** Their name as they gave it; null when they never gave one. */
    name: string | null;
    /** The work email on their staff profile; null when it isn't set. */
    workEmail: string | null;
}

/**
 * The open link's manager, or null when no link is open (none ever, or the
 * last one ended), or when there is nothing to show of them: no name and no
 * work email. Read inside the business's own context, so the policy on
 * `AccountManagerLink` keeps it to this business's links.
 */
export async function accountManagerOf(
    organizationId: string,
): Promise<BusinessAccountManager | null> {
    const link = await prisma.accountManagerLink.findFirst({
        where: { organizationId, endedAt: null },
        select: { platformAdminId: true },
    });
    if (!link) return null;

    const manager = await prisma.platformAdmin.findUnique({
        where: { id: link.platformAdminId },
        select: {
            user: { select: { name: true } },
            staffProfile: { select: { workEmail: true } },
        },
    });
    if (!manager) return null;

    // A blank is as good as absent.
    const blankAsNull = (value: string | null | undefined) =>
        value?.trim() ? value.trim() : null;
    const name = blankAsNull(manager.user.name);
    const workEmail = blankAsNull(manager.staffProfile?.workEmail);
    if (!name && !workEmail) return null;
    return { name, workEmail };
}
