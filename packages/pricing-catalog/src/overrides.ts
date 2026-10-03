/**
 * Per-business overrides (KTD-6) and the order they combine in
 * (RECOMMENDATIONS 3, accepted): plan, then remove, then grant, then limit,
 * then raise; within a kind, oldest first. `raise` keeps today's raise-only
 * meaning: it never lowers a limit.
 *
 * The shape mirrors an `EntitlementOverride` row, so the API can pass rows
 * straight in.
 */

export const OVERRIDE_KINDS = [
    "raise",
    "grant",
    "remove",
    "limit",
    "price",
    "plan",
] as const;
export type OverrideKind = (typeof OVERRIDE_KINDS)[number];

/** How module overrides combine: earlier kinds first, so later kinds win. */
export const OVERRIDE_ORDER: readonly OverrideKind[] = [
    "plan",
    "remove",
    "grant",
    "limit",
    "raise",
];

export interface Override {
    kind: OverrideKind;
    /** A legacy entitlement key for `raise`; the catalogue module id otherwise. */
    key: string;
    /** The catalogue module a grant, remove, limit or raise applies to. */
    moduleKey?: string | null;
    /** The limit (`limit`, `raise`) or monthly price in paise (`price`). */
    value?: number | null;
    /** The catalogue plan a `plan` override puts the business on. */
    planKey?: string | null;
    createdAt: Date;
    /** Null lasts until removed. */
    expiresAt?: Date | null;
    revokedAt?: Date | null;
}

/** Still applies at `now`: not revoked and not past its end. */
export function isLive(o: Override, now: Date): boolean {
    if (o.revokedAt && o.revokedAt.getTime() <= now.getTime()) return false;
    if (o.expiresAt && o.expiresAt.getTime() <= now.getTime()) return false;
    return true;
}

/** Live overrides in the order they apply. */
export function orderOverrides(
    overrides: readonly Override[],
    now: Date,
): Override[] {
    const rank = (k: OverrideKind) => {
        const i = OVERRIDE_ORDER.indexOf(k);
        return i < 0 ? OVERRIDE_ORDER.length : i;
    };
    return overrides
        .filter((o) => isLive(o, now))
        .slice()
        .sort(
            (a, b) =>
                rank(a.kind) - rank(b.kind) ||
                a.createdAt.getTime() - b.createdAt.getTime(),
        );
}

/** The plan a business is on once a live `plan` override is applied. */
export function effectivePlanId(
    planId: string,
    overrides: readonly Override[],
    now: Date,
    knownPlanIds?: ReadonlySet<string>,
): string {
    let out = planId;
    for (const o of orderOverrides(overrides, now)) {
        if (o.kind !== "plan" || !o.planKey) continue;
        if (knownPlanIds && !knownPlanIds.has(o.planKey)) continue;
        out = o.planKey;
    }
    return out;
}

/** A custom monthly price, if one applies: the newest live `price` override. */
export function priceOverridePaise(
    overrides: readonly Override[],
    now: Date,
): number | null {
    let out: number | null = null;
    for (const o of orderOverrides(overrides, now)) {
        if (o.kind === "price" && typeof o.value === "number") out = o.value;
    }
    return out;
}
