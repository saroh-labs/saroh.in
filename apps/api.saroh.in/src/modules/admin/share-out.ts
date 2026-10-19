/**
 * Share out evenly (DEC-169, R30, admin console U25): who each business
 * without a manager goes to. Pure, so the rule is tested without a
 * database; `AdminAccountManagersService.shareOut` reads the inputs and
 * writes the links.
 *
 * - Only people who hold the Account manager role now **and** are on
 *   commission take part (the service reads them so).
 * - Businesses go in order: paying ones first, then the oldest.
 * - Each goes to whoever looks after the fewest businesses at that moment,
 *   counting the ones just given out; a tie goes by name, then id, so the
 *   same inputs always share out the same way.
 * - Someone at their capacity takes no more (no capacity set: no cap).
 * - Nobody is given a business they own.
 * - A business nobody can take is left without a manager, and counted.
 */

export interface ShareOutManager {
    platformAdminId: string;
    /** For the tie-break only. */
    name: string;
    /** Their user id, so they are never given a business they own. */
    userId: string;
    /** Businesses they look after now (open links). */
    load: number;
    /** Most businesses they take; null for no cap. */
    capacity: number | null;
}

export interface ShareOutBusiness {
    organizationId: string;
    paying: boolean;
    createdAt: Date;
    /** Its owners' user ids. */
    ownerUserIds: string[];
}

export interface ShareOutPlan {
    assignments: { organizationId: string; platformAdminId: string }[];
    /** Businesses nobody could take: everyone is full, or owns it. */
    left: string[];
}

/** Paying first, then the oldest, then by id. */
export function shareOutOrder(
    businesses: readonly ShareOutBusiness[],
): ShareOutBusiness[] {
    return [...businesses].sort(
        (a, b) =>
            Number(b.paying) - Number(a.paying) ||
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.organizationId.localeCompare(b.organizationId),
    );
}

export function planShareOut(
    businesses: readonly ShareOutBusiness[],
    managers: readonly ShareOutManager[],
): ShareOutPlan {
    const load = new Map(managers.map((m) => [m.platformAdminId, m.load]));
    const assignments: ShareOutPlan["assignments"] = [];
    const left: string[] = [];
    const loadOf = (m: ShareOutManager) => load.get(m.platformAdminId) ?? 0;
    /** Fewer businesses, then name, then id. */
    const fewer = (a: ShareOutManager, b: ShareOutManager) =>
        (loadOf(a) - loadOf(b) ||
            a.name.localeCompare(b.name) ||
            a.platformAdminId.localeCompare(b.platformAdminId)) < 0;
    for (const business of shareOutOrder(businesses)) {
        const owners = new Set(business.ownerUserIds);
        let pick: ShareOutManager | null = null;
        for (const m of managers) {
            if (owners.has(m.userId)) continue;
            const now = load.get(m.platformAdminId) ?? 0;
            if (m.capacity !== null && now >= m.capacity) continue;
            if (pick === null || fewer(m, pick)) pick = m;
        }
        if (!pick) {
            left.push(business.organizationId);
            continue;
        }
        load.set(
            pick.platformAdminId,
            (load.get(pick.platformAdminId) ?? 0) + 1,
        );
        assignments.push({
            organizationId: business.organizationId,
            platformAdminId: pick.platformAdminId,
        });
    }
    return { assignments, left };
}
