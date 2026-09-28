/**
 * E12 backfill — Class packs becomes its own module (default 44).
 *
 * Packs were part of Appointments until round 2. Once the API gates them on
 * CLASS_PACKS, a business keeps them only if two things exist: the rollout
 * flag, and its own CLASS_PACKS row. This writes both, so nobody who sold
 * packs loses them on the release.
 *
 * **The rollout flag.** `MODULE_CLASS_PACKS` is registered with the value
 * `MODULE_APPOINTMENTS` has today, and each business's Appointments override
 * is copied to it: packs stay visible exactly where they were. A flag that is
 * already registered is left alone, overrides and all — an operator set it.
 * Every write is recorded in `FeatureFlagAudit`, as the admin console's are.
 *
 * **The module rows.** Every business without a CLASS_PACKS row gets one:
 *
 * - it has a pack or a purchase, and Appointments isn't switched off →
 *   ENABLED;
 * - it has packs but switched Appointments off → DISABLED, because a module
 *   is never on while one it needs is off (the lifecycle's rule). Its packs
 *   were already out of reach, and turning Appointments back on then Class
 *   packs brings them back;
 * - no pack and no purchase → DISABLED. It turns them on from Bookings ›
 *   Services ("Also sell") or Settings › Modules.
 *
 * A business that already has a row keeps it: an explicit choice is never
 * overwritten. So it is idempotent: a second run writes nothing.
 *
 * Each business runs in its own transaction. No schema change goes with it
 * (`OrganizationModule.moduleKey` is a string), so it can run BEFORE the API
 * that gates packs on CLASS_PACKS is deployed, and should: with
 * `MODULE_ENFORCEMENT` on, that API refuses packs to any business without
 * the flag and the row.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/class-packs-module.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

export const CLASS_PACKS_FLAG = "MODULE_CLASS_PACKS";
const APPOINTMENTS_FLAG = "MODULE_APPOINTMENTS";
const ACTOR = "system:class-packs-backfill";

/** What the backfill knows about one business. */
export interface ClassPacksEvidence {
    organizationId: string;
    /** It has a pack or a purchase, in any state. */
    hasPacks: boolean;
    /** Its APPOINTMENTS row's status, or null for none (counts as on). */
    appointments: string | null;
    /** Its CLASS_PACKS row's status, or null for none yet. */
    existing: string | null;
}

export type ClassPacksDecision =
    /** Already has a row: left alone. */
    | "kept"
    /** Has packs and Appointments is on: ENABLED. */
    | "enabled"
    /** Has packs, but Appointments is switched off: DISABLED. */
    | "held-off"
    /** No pack and no purchase: DISABLED. */
    | "disabled";

/** The rule, pure, so it is tested without a database. */
export function decideClassPacks(e: ClassPacksEvidence): ClassPacksDecision {
    if (e.existing !== null) return "kept";
    if (!e.hasPacks) return "disabled";
    // A missing APPOINTMENTS row counts as on, as everywhere else.
    if (e.appointments !== null && e.appointments !== "ENABLED") {
        return "held-off";
    }
    return "enabled";
}

export interface ClassPacksFlagReport {
    /** The flag was registered by this run (false: it already existed). */
    registered: boolean;
    /** Its value for everyone, when this run registered it. */
    enabledByDefault: boolean | null;
    /** Business overrides copied from Appointments. */
    overridesCopied: number;
}

export interface ClassPacksModuleReport {
    flag: ClassPacksFlagReport;
    organizations: number;
    enabled: number;
    heldOff: number;
    disabled: number;
    kept: number;
}

/**
 * Register `MODULE_CLASS_PACKS` with Appointments' value, and copy
 * Appointments' business overrides. One transaction; nothing if the flag is
 * already registered.
 */
export async function registerClassPacksFlag(
    prisma: PrismaClient,
): Promise<ClassPacksFlagReport> {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.featureFlag.findUnique({
            where: { key: CLASS_PACKS_FLAG },
            select: { id: true },
        });
        if (existing) {
            return {
                registered: false,
                enabledByDefault: null,
                overridesCopied: 0,
            };
        }
        const appointments = await tx.featureFlag.findUnique({
            where: { key: APPOINTMENTS_FLAG },
            select: {
                enabledByDefault: true,
                overrides: {
                    select: { organizationId: true, enabled: true },
                    orderBy: { organizationId: "asc" },
                },
            },
        });
        const enabledByDefault = appointments?.enabledByDefault ?? false;
        await tx.featureFlag.create({
            data: {
                key: CLASS_PACKS_FLAG,
                description:
                    "Saroh-side rollout switch for the CLASS_PACKS module.",
                enabledByDefault,
            },
        });
        await tx.featureFlagAudit.create({
            data: {
                flagKey: CLASS_PACKS_FLAG,
                organizationId: null,
                previousValue: null,
                newValue: enabledByDefault,
                actorUserId: ACTOR,
                reason: `Class packs became its own module (E12): registered with ${APPOINTMENTS_FLAG}'s value for everyone`,
            },
        });
        const overrides = appointments?.overrides ?? [];
        for (const o of overrides) {
            await tx.featureFlagOverride.create({
                data: {
                    flagKey: CLASS_PACKS_FLAG,
                    organizationId: o.organizationId,
                    enabled: o.enabled,
                },
            });
            await tx.featureFlagAudit.create({
                data: {
                    flagKey: CLASS_PACKS_FLAG,
                    organizationId: o.organizationId,
                    previousValue: null,
                    newValue: o.enabled,
                    actorUserId: ACTOR,
                    reason: `Class packs became its own module (E12): copied from this business's ${APPOINTMENTS_FLAG} override`,
                },
            });
        }
        return {
            registered: true,
            enabledByDefault,
            overridesCopied: overrides.length,
        };
    });
}

/** Write one business's CLASS_PACKS row, if it has none. */
async function backfillOne(
    prisma: PrismaClient,
    organizationId: string,
): Promise<ClassPacksDecision> {
    return prisma.$transaction(async (tx) => {
        const where = { organizationId };
        const [packs, purchases, rows] = await Promise.all([
            tx.classPack.count({ where }),
            tx.packPurchase.count({ where }),
            tx.organizationModule.findMany({
                where: {
                    organizationId,
                    moduleKey: { in: ["APPOINTMENTS", "CLASS_PACKS"] },
                },
                select: { moduleKey: true, status: true },
            }),
        ]);
        const status = (key: string) =>
            rows.find((r) => r.moduleKey === key)?.status ?? null;
        const decision = decideClassPacks({
            organizationId,
            hasPacks: packs + purchases > 0,
            appointments: status("APPOINTMENTS"),
            existing: status("CLASS_PACKS"),
        });
        if (decision === "kept") return decision;

        const on = decision === "enabled";
        // `skipDuplicates`: a row written meanwhile (someone switched it in
        // Settings) wins, and this run then records nothing.
        const created = await tx.organizationModule.createMany({
            data: [
                {
                    organizationId,
                    moduleKey: "CLASS_PACKS",
                    status: on ? "ENABLED" : "DISABLED",
                    enabledAt: on ? new Date() : null,
                    // System backfill — no human actor.
                    enabledByUserId: null,
                },
            ],
            skipDuplicates: true,
        });
        if (created.count === 0) return "kept";
        await tx.auditEvent.create({
            data: {
                action: "organization.modules.backfill",
                actorUserId: ACTOR,
                organizationId,
                outcome: "SUCCESS",
                metadata: {
                    evidence: decision === "disabled" ? [] : ["CLASS_PACKS"],
                    enabled: on ? ["CLASS_PACKS"] : [],
                },
            },
        });
        return decision;
    });
}

/** The flag, then every business's row. Safe to run more than once. */
export async function backfillClassPacksModule(
    prisma: PrismaClient,
): Promise<ClassPacksModuleReport> {
    const flag = await registerClassPacksFlag(prisma);
    const organizations = await prisma.organization.findMany({
        select: { id: true },
        orderBy: { id: "asc" },
    });
    const report: ClassPacksModuleReport = {
        flag,
        organizations: organizations.length,
        enabled: 0,
        heldOff: 0,
        disabled: 0,
        kept: 0,
    };
    for (const org of organizations) {
        const decision = await backfillOne(prisma, org.id);
        if (decision === "enabled") report.enabled += 1;
        else if (decision === "held-off") report.heldOff += 1;
        else if (decision === "disabled") report.disabled += 1;
        else report.kept += 1;
    }
    return report;
}
