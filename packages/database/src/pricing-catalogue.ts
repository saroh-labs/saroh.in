import type { Prisma, PrismaClient } from "@prisma/client";

import type { TransactionClient } from "./transaction";

/**
 * Writing and reading pricing catalogue versions (plan 2026-09-29 U1, KTD-2).
 *
 * This package doesn't validate a snapshot or derive its billing rows: that is
 * `@saroh/pricing-catalog` (`catalogSchema`, `planRows`), which the caller runs
 * first. Keeping it out of here means the database package never carries a
 * catalogue's content; it only stores what it is given.
 */

type Db = PrismaClient | TransactionClient;

/** One billable `Plan` row, as `@saroh/pricing-catalog` `planRows()` builds it. */
export interface CatalogueVersionPlanRow {
    key: string;
    version: number;
    interval: string;
    name: string;
    priceCents: number;
    currency: string;
    entitlements: Prisma.InputJsonValue;
    active: boolean;
}

export interface CatalogueVersionInput {
    version: number;
    /** A snapshot already validated by `catalogSchema`. */
    catalog: Prisma.InputJsonValue;
    goLiveAt: Date;
    policy: "keep" | "move";
    note?: string;
    /** `diff()` against the version before, in words. */
    changes?: readonly string[];
    publishedByUserId?: string | null;
    /** Every plan × cycle of this version; each row's `version` must match. */
    planRows: readonly CatalogueVersionPlanRow[];
}

/**
 * Store one published version and its `Plan` rows, both or neither, in a
 * transaction of its own. Inside a caller's transaction (a publish), use
 * `writeCatalogueVersionInTx`: our Postgres adapter has no nested
 * transactions, and a transaction client still answers to `$transaction`, so
 * this function can't tell the two apart. A version number already taken is
 * the unique index's error.
 */
export async function writeCatalogueVersion(
    db: PrismaClient,
    input: CatalogueVersionInput,
): Promise<{ versionId: string; planIds: string[] }> {
    return db.$transaction((tx) => writeVersionRows(tx, input));
}

async function writeVersionRows(
    tx: TransactionClient,
    input: CatalogueVersionInput,
): Promise<{ versionId: string; planIds: string[] }> {
    for (const r of input.planRows) {
        if (r.version !== input.version) {
            throw new Error(
                `Plan row ${r.key}/${r.interval} is for version ${r.version}, not ${input.version}`,
            );
        }
    }
    const v = await tx.pricingCatalogVersion.create({
        data: {
            version: input.version,
            catalog: input.catalog,
            goLiveAt: input.goLiveAt,
            policy: input.policy,
            note: input.note ?? "",
            changes: [...(input.changes ?? [])],
            publishedByUserId: input.publishedByUserId ?? null,
        },
        select: { id: true },
    });
    const planIds: string[] = [];
    for (const r of input.planRows) {
        const p = await tx.plan.create({
            data: {
                key: r.key,
                version: r.version,
                interval: r.interval,
                name: r.name,
                priceCents: r.priceCents,
                currency: r.currency,
                entitlements: r.entitlements,
                active: r.active,
            },
            select: { id: true },
        });
        planIds.push(p.id);
    }
    return { versionId: v.id, planIds };
}

/** `writeCatalogueVersion` as part of the caller's transaction `tx`. */
export async function writeCatalogueVersionInTx(
    tx: TransactionClient,
    input: CatalogueVersionInput,
): Promise<{ versionId: string; planIds: string[] }> {
    return writeVersionRows(tx, input);
}

/** `Plan.key` prefix of a catalogue plan's billing rows (`catalog.<planId>`). */
const CATALOGUE_PLAN_KEY_PREFIX = "catalog.";

/**
 * Versions that can't go live yet: one of their `Plan` rows has a billing
 * provider plan that isn't SYNCED (RECOMMENDATIONS 5). A publish writes the
 * paid rows' provider plans as PENDING; the sync job (U15) makes them SYNCED.
 * A version with no provider rows at all (only free plans, or one installed
 * by the migration's installer) is never held.
 */
export async function unsyncedCatalogueVersions(db: Db): Promise<number[]> {
    const rows = await db.pricingProviderPlan.findMany({
        where: {
            status: { not: "SYNCED" },
            plan: { key: { startsWith: CATALOGUE_PLAN_KEY_PREFIX } },
        },
        select: { plan: { select: { version: true } } },
    });
    return Array.from(new Set(rows.map((r) => r.plan.version))).sort(
        (a, b) => a - b,
    );
}

/**
 * The live version at `now`: the newest whose `goLiveAt` has passed and whose
 * paid plans exist at the billing provider ({@link unsyncedCatalogueVersions}).
 * Later ones are scheduled; a held one waits, and the version before it stays
 * live. Null before any version is installed.
 */
export async function liveCatalogueVersion(db: Db, now: Date = new Date()) {
    const held = await unsyncedCatalogueVersions(db);
    return db.pricingCatalogVersion.findFirst({
        where: {
            goLiveAt: { lte: now },
            ...(held.length ? { version: { notIn: held } } : {}),
        },
        orderBy: { version: "desc" },
    });
}

/** Versions whose `goLiveAt` is still ahead, soonest first. */
export function scheduledCatalogueVersions(db: Db, now: Date = new Date()) {
    return db.pricingCatalogVersion.findMany({
        where: { goLiveAt: { gt: now } },
        orderBy: { goLiveAt: "asc" },
    });
}

/**
 * A catalogue plan's billable `Plan` row on the live version, for one cycle
 * (`catalog.<planId>`, KTD-2). Null before any version is live, or when the
 * live version has no such plan.
 */
export async function liveCataloguePlanRow(
    db: Db,
    planId: string,
    interval: "month" | "year" = "month",
    now: Date = new Date(),
) {
    const live = await liveCatalogueVersion(db, now);
    if (!live) return null;
    return db.plan.findUnique({
        where: {
            key_version_interval: {
                key: `${CATALOGUE_PLAN_KEY_PREFIX}${planId}`,
                version: live.version,
                interval,
            },
        },
        select: { id: true, key: true, version: true, active: true },
    });
}

export type StartOnFreePlanResult =
    | "started"
    /** It has a subscription row already; nothing written. */
    | "has-subscription"
    /** No live version offers the plan, or it is retired; nothing written. */
    | "no-plan";

/**
 * Give a business its Free subscription row (OQ-2, DEC-014): the given
 * catalogue plan's monthly row on the live version, ACTIVE, no provider.
 * With a row, "keep their terms" and moves have somewhere to live, and the
 * catalogue reads the business instead of the old free floor.
 *
 * The caller names the plan (`free`): this package stores what it is given
 * and carries no catalogue rules. Pass the onboarding transaction to make it
 * part of a sign-up; it never replaces a subscription that exists.
 */
export async function startOnFreePlan(
    db: Db,
    organizationId: string,
    options: { planId: string; now?: Date },
): Promise<StartOnFreePlanResult> {
    const now = options.now ?? new Date();
    const existing = await db.subscription.findUnique({
        where: { organizationId },
        select: { id: true },
    });
    if (existing) return "has-subscription";
    const row = await liveCataloguePlanRow(db, options.planId, "month", now);
    if (!row?.active) return "no-plan";
    await db.subscription.create({
        data: {
            organizationId,
            planId: row.id,
            status: "ACTIVE",
            billingCycle: "month",
        },
    });
    return "started";
}
