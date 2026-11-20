import type { Prisma } from "@saroh/database";

import { normaliseGstin } from "../invoices/gst-states";

/**
 * The businesses that share a payer with this one (M-2, M-3, DEC-227): the
 * free trial and the launch discount are once per person, not per business.
 * A business shares a payer with another when one of its owners owns the
 * other, when they bill to the same billing profile or to profiles of the
 * same person (DEC-167), or when either carries the same GSTIN (its own
 * `taxId` or its billing profile's). The business itself is in the list.
 */
type Db = Pick<Prisma.TransactionClient, "organization">;

// Stored normalised since N9 (and by the backfill before it), so a
// normalised compare matches "29AAAAA 0000A1ZY" with "29AAAAA0000A1ZY".
function cleanGstin(v: string | null | undefined): string | null {
    const t = normaliseGstin(v);
    return t === "" ? null : t;
}

export async function samePayer(
    db: Db,
    organizationId: string,
): Promise<string[]> {
    const org = await db.organization.findUnique({
        where: { id: organizationId },
        select: {
            billingProfileId: true,
            billingProfile: { select: { ownerUserId: true, gstin: true } },
            businessProfile: { select: { taxId: true } },
            memberships: {
                where: { role: "OWNER" },
                select: { userId: true },
            },
        },
    });
    if (!org) return [organizationId];
    const people = [
        ...new Set([
            ...org.memberships.map((m) => m.userId),
            ...(org.billingProfile ? [org.billingProfile.ownerUserId] : []),
        ]),
    ];
    const gstins = [
        ...new Set(
            [org.billingProfile?.gstin, org.businessProfile?.taxId]
                .map(cleanGstin)
                .filter((g): g is string => g !== null),
        ),
    ];
    const or: Prisma.OrganizationWhereInput[] = [{ id: organizationId }];
    if (people.length > 0) {
        or.push(
            {
                memberships: {
                    some: { userId: { in: people }, role: "OWNER" },
                },
            },
            { billingProfile: { ownerUserId: { in: people } } },
        );
    }
    if (org.billingProfileId)
        or.push({ billingProfileId: org.billingProfileId });
    for (const gstin of gstins) {
        or.push(
            {
                billingProfile: {
                    gstin: { equals: gstin, mode: "insensitive" },
                },
            },
            {
                businessProfile: {
                    taxId: { equals: gstin, mode: "insensitive" },
                },
            },
        );
    }
    const rows = await db.organization.findMany({
        where: { OR: or },
        select: { id: true },
    });
    return [...new Set([organizationId, ...rows.map((r) => r.id)])];
}

/**
 * A checkout that holds an offer for its business: completed, waiting to
 * start, or still open (N3: two businesses of one person checking out side
 * by side can't both get it).
 */
export function offerHeld(now: Date): Prisma.BillingCheckoutWhereInput {
    return {
        OR: [
            { status: { in: ["COMPLETED", "SCHEDULED"] } },
            { status: "OPEN", expiresAt: { gt: now } },
        ],
    };
}
