import { prisma } from "@saroh/database";

import { meteredKeyOf, usageByModule } from "../billing/metering";

/** Why a count reads as it does, where the number alone would mislead. */
export type UsageNote =
    /** Locations at 0 because every storefront it has sells online only. */
    "online-only";

export interface CatalogueUsage {
    /** Metering's count by catalogue row id, for the metered rows asked for. */
    usage: Record<string, number>;
    /** Storefronts not deleted, of either kind: what says "online-only". */
    storefronts: number;
}

/**
 * How much of each catalogue row one business uses, for the business page
 * and the limit override's warning. The counts are metering's
 * (`billing/metering.ts`), the same ones enforcement and the merchant's
 * Settings › Plan read, so the console can't disagree with either. Only
 * places customers visit (`SHOP`) count as locations (owner, 8 Oct): an
 * online-only storefront is 0 of them. A row metering doesn't count is left
 * out and reads as not measured, never as zero.
 *
 * CROSS-TENANT READ: called only by the admin services, behind the admin
 * guards, for the one business in the path.
 */
export async function catalogueUsage(
    organizationId: string,
    moduleIds: readonly string[],
    now: Date = new Date(),
): Promise<CatalogueUsage> {
    const [usage, storefronts] = await Promise.all([
        usageByModule(prisma, organizationId, moduleIds, now),
        prisma.store.count({ where: { organizationId, deletedAt: null } }),
    ]);
    return { usage, storefronts };
}

/**
 * The note beside a row's count: a locations row at 0 for a business whose
 * storefronts all sell online says so, rather than a bare 0 that reads as
 * "not set up".
 */
export function usageNote(
    moduleId: string,
    usage: number | null,
    storefronts: number,
): UsageNote | null {
    return meteredKeyOf(moduleId) === "shopLocations" &&
        usage === 0 &&
        storefronts > 0
        ? "online-only"
        : null;
}
