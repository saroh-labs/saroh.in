/**
 * Plans catalogue U5 — grandfather existing businesses onto a plan until a
 * date (KTD-7, R10).
 *
 * Every business that joined before the release and isn't already on a plan
 * of its own gets one time-bound `plan` override (`EntitlementOverride` with
 * kind `plan`, key `plan`, `planKey` such as `grow`, `expiresAt` = the date
 * the owner sets). `EntitlementService` reads a live plan override ahead of
 * the subscription's plan, so these businesses keep that plan until the date
 * passes; new sign-ups start on Free. The end date and the joined-before
 * cutoff are arguments, never defaults: the cutoff is what keeps a business
 * that signs up after the release from being grandfathered by a re-run.
 *
 * Who is left alone (the pure rule, {@link decideGrandfather}):
 *
 * - joined on or after the cutoff — a new sign-up starts on Free;
 * - deleted (`deletedRetainedAt` set);
 * - on a plan of its own: a subscription that isn't CANCELLED, on any plan
 *   other than Free. Legacy `business` and `pro` resolve as Grow already
 *   (`LEGACY_PLAN_KEYS` in `@saroh/pricing-catalog`), and a paying business
 *   is never put on a plan by a backfill;
 * - already has a live plan override (unrevoked, open-ended or not yet
 *   ended) — an earlier run's, or one staff set. So a second run writes
 *   nothing, and it never stacks on a staff decision.
 *
 * Each business runs in its own transaction, locking its Organization row
 * first so two runs at once can't both write. Each override comes with one
 * entry in the business's audit stream. `dryRun` decides the same way and
 * writes nothing.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/pricing-grandfather.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

/** Who the overrides and audit entries name, as other backfills do. */
export const GRANDFATHER_ACTOR = "system:pricing-grandfather";

/**
 * The plan keys that mean Free: legacy `free` and the catalogue's own
 * `catalog.free`. Mirrors `LEGACY_PLAN_KEYS` / `catalogPlanIdForKey` in
 * `@saroh/pricing-catalog`, which this package doesn't import (it never
 * carries catalogue rules); the API's spec checks the two agree.
 */
export const FREE_PLAN_KEYS: readonly string[] = ["free", "catalog.free"];

/** What the backfill knows about one business. */
export interface GrandfatherEvidence {
    createdAt: Date;
    deleted: boolean;
    /** Its subscription, or null for none. */
    subscription: { status: string; planKey: string } | null;
    /** It has a live plan override now. */
    hasLivePlanOverride: boolean;
}

export type GrandfatherDecision =
    | "grandfather"
    /** Joined on or after the cutoff: a new sign-up, on Free. */
    | "joined-after"
    | "deleted"
    /** A live subscription on a plan other than Free. */
    | "on-a-plan"
    | "already-overridden";

/** The rule, pure, so it is tested without a database. */
export function decideGrandfather(
    e: GrandfatherEvidence,
    joinedBefore: Date,
): GrandfatherDecision {
    if (e.createdAt.getTime() >= joinedBefore.getTime()) return "joined-after";
    if (e.deleted) return "deleted";
    if (
        e.subscription &&
        e.subscription.status !== "CANCELLED" &&
        !FREE_PLAN_KEYS.includes(e.subscription.planKey)
    ) {
        return "on-a-plan";
    }
    if (e.hasLivePlanOverride) return "already-overridden";
    return "grandfather";
}

export interface GrandfatherOptions {
    /** The catalogue plan id they keep, e.g. `grow`. */
    planKey: string;
    /** When the override ends: the date the owner sets. Must be in the future. */
    until: Date;
    /** Only businesses created before this are grandfathered (the release). */
    joinedBefore: Date;
    /** Decide and count, write nothing. */
    dryRun?: boolean;
    /** Defaults to the clock; tests pin it. */
    now?: Date;
}

export interface GrandfatherReport {
    organizations: number;
    /** Overrides written (or, in a dry run, that would be). */
    grandfathered: number;
    joinedAfter: number;
    deleted: number;
    onAPlan: number;
    alreadyOverridden: number;
    dryRun: boolean;
}

/** Throw on options that would write something nobody meant. */
export function assertGrandfatherOptions(o: GrandfatherOptions): void {
    const now = o.now ?? new Date();
    if (!/^[a-z][a-z0-9-]*$/.test(o.planKey)) {
        throw new Error(
            `"${o.planKey}" is not a catalogue plan id (lower-case, e.g. grow).`,
        );
    }
    if (Number.isNaN(o.until.getTime()) || o.until <= now) {
        throw new Error("The end date must be a valid date in the future.");
    }
    if (Number.isNaN(o.joinedBefore.getTime()) || o.joinedBefore > now) {
        throw new Error(
            "The joined-before cutoff must be a valid date, not in the future.",
        );
    }
}

function liveOverrideWhere(now: Date) {
    return {
        kind: "plan",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
}

/** Every business, decided and (unless a dry run) written. Safe to re-run. */
export async function backfillPricingGrandfather(
    prisma: PrismaClient,
    options: GrandfatherOptions,
): Promise<GrandfatherReport> {
    assertGrandfatherOptions(options);
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const report: GrandfatherReport = {
        organizations: 0,
        grandfathered: 0,
        joinedAfter: 0,
        deleted: 0,
        onAPlan: 0,
        alreadyOverridden: 0,
        dryRun,
    };
    const organizations = await prisma.organization.findMany({
        select: { id: true },
        orderBy: { id: "asc" },
    });
    report.organizations = organizations.length;

    for (const { id } of organizations) {
        const decision = await prisma.$transaction(async (tx) => {
            // One run at a time per business: the second waits, then sees
            // the first one's override. A dry run reads without locking.
            if (!dryRun) {
                await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${id} FOR UPDATE`;
            }
            const org = await tx.organization.findUniqueOrThrow({
                where: { id },
                select: {
                    createdAt: true,
                    deletedRetainedAt: true,
                    subscription: {
                        select: {
                            status: true,
                            plan: { select: { key: true } },
                        },
                    },
                },
            });
            const live = await tx.entitlementOverride.count({
                where: { organizationId: id, ...liveOverrideWhere(now) },
            });
            const d = decideGrandfather(
                {
                    createdAt: org.createdAt,
                    deleted: org.deletedRetainedAt !== null,
                    subscription: org.subscription
                        ? {
                              status: org.subscription.status,
                              planKey: org.subscription.plan.key,
                          }
                        : null,
                    hasLivePlanOverride: live > 0,
                },
                options.joinedBefore,
            );
            if (d !== "grandfather" || dryRun) return d;

            const reason = `Joined before plans launched: kept on ${options.planKey} until ${options.until.toISOString().slice(0, 10)}.`;
            const override = await tx.entitlementOverride.create({
                data: {
                    organizationId: id,
                    kind: "plan",
                    key: "plan",
                    planKey: options.planKey,
                    expiresAt: options.until,
                    reason,
                    grantedByUserId: GRANDFATHER_ACTOR,
                },
                select: { id: true },
            });
            await tx.auditEvent.create({
                data: {
                    action: "organization.plan.grandfathered",
                    actorUserId: GRANDFATHER_ACTOR,
                    organizationId: id,
                    targetType: "entitlement_override",
                    targetId: override.id,
                    outcome: "SUCCESS",
                    metadata: {
                        planKey: options.planKey,
                        until: options.until.toISOString(),
                    },
                },
            });
            return d;
        });
        switch (decision) {
            case "grandfather":
                report.grandfathered += 1;
                break;
            case "joined-after":
                report.joinedAfter += 1;
                break;
            case "deleted":
                report.deleted += 1;
                break;
            case "on-a-plan":
                report.onAPlan += 1;
                break;
            case "already-overridden":
                report.alreadyOverridden += 1;
                break;
        }
    }
    return report;
}
