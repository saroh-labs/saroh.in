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
 * Store one published version and its `Plan` rows. Pass a transaction client
 * to make it part of a publish; on its own client it still writes both or
 * neither. A version number already taken is the unique index's error.
 */
export async function writeCatalogueVersion(
    db: Db,
    input: CatalogueVersionInput,
): Promise<{ versionId: string; planIds: string[] }> {
    for (const r of input.planRows) {
        if (r.version !== input.version) {
            throw new Error(
                `Plan row ${r.key}/${r.interval} is for version ${r.version}, not ${input.version}`,
            );
        }
    }
    const write = async (tx: TransactionClient) => {
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
    };
    return "$transaction" in db
        ? (db as PrismaClient).$transaction(write)
        : write(db as TransactionClient);
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
