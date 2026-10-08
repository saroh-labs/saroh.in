/**
 * Plans catalogue U12 — give every business without a subscription its Free
 * subscription row (OQ-2, accepted: DEC-014's "every org has a plan").
 *
 * New businesses get the row at sign-up (the onboarding transaction); this
 * gives one to the businesses that signed up before that. With a row, the
 * catalogue reads the business (`CatalogueAccessService`) instead of the old
 * `FREE_ENTITLEMENTS` floor, and "keep their terms" or a move has somewhere
 * to live.
 *
 * Safe whichever order it runs in with the U5 grandfather backfill: a
 * business that joined before the grandfather cutoff is given a row only
 * once it has a live plan override (it was grandfathered), so a run before
 * grandfathering can never put an existing business on Free. Who is left
 * alone ({@link decideFreeRow}):
 *
 * - it has a subscription row, on any plan, in any state;
 * - deleted (`deletedRetainedAt` set);
 * - joined before the cutoff and has no live plan override: not grandfathered
 *   yet, so it keeps the free floor until it is.
 *
 * Each business runs in its own transaction, locking its Organization row
 * first; each row comes with one entry in the business's audit stream.
 * `dryRun` decides the same way and writes nothing.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/pricing-free-subscriptions.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

import { liveCataloguePlanRow, startOnFreePlan } from "../pricing-catalogue";

/** Who the audit entries name, as other backfills do. */
export const FREE_ROWS_ACTOR = "system:pricing-free-subscriptions";

export interface FreeRowEvidence {
    createdAt: Date;
    deleted: boolean;
    hasSubscription: boolean;
    hasLivePlanOverride: boolean;
}

export type FreeRowDecision =
    | "start"
    | "has-subscription"
    | "deleted"
    /** Joined before the cutoff with no plan override: grandfather it first. */
    | "not-grandfathered";

/** The rule, pure, so it is tested without a database. */
export function decideFreeRow(
    e: FreeRowEvidence,
    grandfatheredBefore: Date,
): FreeRowDecision {
    if (e.hasSubscription) return "has-subscription";
    if (e.deleted) return "deleted";
    if (
        e.createdAt.getTime() < grandfatheredBefore.getTime() &&
        !e.hasLivePlanOverride
    ) {
        return "not-grandfathered";
    }
    return "start";
}

export interface FreeRowsOptions {
    /** The catalogue's Free plan id, e.g. `free`. */
    planId: string;
    /** The grandfather backfill's `--joined-before` (the release). */
    grandfatheredBefore: Date;
    dryRun?: boolean;
    now?: Date;
    /**
     * Read only the businesses with no subscription row (the go-live job,
     * #839): the report then counts no `hasSubscription`, and stays cheap on
     * an instance where every business already has its row.
     */
    onlyWithoutSubscription?: boolean;
}

export interface FreeRowsReport {
    organizations: number;
    /** Rows written (or, in a dry run, that would be). */
    started: number;
    hasSubscription: number;
    deleted: number;
    notGrandfathered: number;
    dryRun: boolean;
}

/** Every business, decided and (unless a dry run) written. Safe to re-run. */
export async function backfillFreeSubscriptions(
    prisma: PrismaClient,
    options: FreeRowsOptions,
): Promise<FreeRowsReport> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    if (Number.isNaN(options.grandfatheredBefore.getTime())) {
        throw new Error("The grandfather cutoff must be a valid date.");
    }
    const row = await liveCataloguePlanRow(
        prisma,
        options.planId,
        "month",
        now,
    );
    if (!row?.active) {
        throw new Error(
            `No live catalogue version offers "${options.planId}" monthly: publish one first.`,
        );
    }
    const report: FreeRowsReport = {
        organizations: 0,
        started: 0,
        hasSubscription: 0,
        deleted: 0,
        notGrandfathered: 0,
        dryRun,
    };
    const organizations = await prisma.organization.findMany({
        where: options.onlyWithoutSubscription
            ? { subscription: null, deletedRetainedAt: null }
            : undefined,
        select: { id: true },
        orderBy: { id: "asc" },
    });
    report.organizations = organizations.length;

    for (const { id } of organizations) {
        const decision = await prisma.$transaction(async (tx) => {
            if (!dryRun) {
                await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id} FOR UPDATE`;
            }
            const org = await tx.organization.findUniqueOrThrow({
                where: { id },
                select: {
                    createdAt: true,
                    deletedRetainedAt: true,
                    subscription: { select: { id: true } },
                },
            });
            const overrides = await tx.entitlementOverride.count({
                where: {
                    organizationId: id,
                    kind: "plan",
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
            });
            const d = decideFreeRow(
                {
                    createdAt: org.createdAt,
                    deleted: org.deletedRetainedAt !== null,
                    hasSubscription: org.subscription !== null,
                    hasLivePlanOverride: overrides > 0,
                },
                options.grandfatheredBefore,
            );
            if (d !== "start" || dryRun) return d;
            const started = await startOnFreePlan(tx, id, {
                planId: options.planId,
                now,
            });
            if (started !== "started") return "has-subscription";
            await tx.auditEvent.create({
                data: {
                    action: "organization.plan.started",
                    actorUserId: FREE_ROWS_ACTOR,
                    organizationId: id,
                    targetType: "subscription",
                    targetId: id,
                    outcome: "SUCCESS",
                    metadata: { planKey: row.key, version: row.version },
                },
            });
            return d;
        });
        switch (decision) {
            case "start":
                report.started += 1;
                break;
            case "has-subscription":
                report.hasSubscription += 1;
                break;
            case "deleted":
                report.deleted += 1;
                break;
            case "not-grandfathered":
                report.notGrandfathered += 1;
                break;
        }
    }
    return report;
}

/**
 * When the catalogue first existed on this instance: the first version's
 * publish (its row's `createdAt`). Null before any version is written.
 */
export async function catalogueStartedAt(
    prisma: Pick<PrismaClient, "pricingCatalogVersion">,
): Promise<Date | null> {
    const first = await prisma.pricingCatalogVersion.findFirst({
        orderBy: { version: "asc" },
        select: { createdAt: true },
    });
    return first?.createdAt ?? null;
}

/**
 * Give their Free row to the businesses sign-up couldn't (#839): those that
 * joined once the catalogue existed but while no version was live (a first
 * version scheduled, or waiting on the billing provider), so the onboarding
 * transaction found no plan to put them on. Run at every go-live.
 *
 * The cutoff is the first version's publish, never "now": a business that
 * joined before the catalogue existed is an existing business, given a row
 * only once it has a live plan override (grandfathered, or an operator's),
 * exactly as {@link backfillFreeSubscriptions} decides. Null when no version
 * is live or the live one doesn't offer `planId` monthly; nothing written.
 */
export async function startMissingFreeRows(
    prisma: PrismaClient,
    options: { planId: string; now?: Date },
): Promise<FreeRowsReport | null> {
    const now = options.now ?? new Date();
    const row = await liveCataloguePlanRow(
        prisma,
        options.planId,
        "month",
        now,
    );
    if (!row?.active) return null;
    const startedAt = await catalogueStartedAt(prisma);
    if (!startedAt) return null;
    return backfillFreeSubscriptions(prisma, {
        planId: options.planId,
        grandfatheredBefore: startedAt,
        now,
        onlyWithoutSubscription: true,
    });
}
