/**
 * Module lifecycle commands (ADR-003 / #114, plan Task 3).
 *
 * enable / disable / archive an Organization module, and select / deselect a
 * module for a Project. Every command:
 *   - authorizes the actor (`module:manage`, i.e. OWNER/ADMIN);
 *   - validates the module key against the typed registry;
 *   - enforces hard dependencies (enable needs deps enabled; disable is blocked
 *     while an enabled module still depends on it);
 *   - enforces same-Organization ownership (a Project can only select its own
 *     Organization's module — also guaranteed by the DB compound FK);
 *   - runs the installation write and its audit event in ONE transaction.
 *
 * Disabling never deletes history; safe-deactivation blockers (e.g. open
 * Commerce orders) are consulted before a disable is allowed.
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ActivationEvents } from "../analytics/activation-events";
import { auditMetadata } from "../audit/audit.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { allows, authorize } from "../organizations/organization-policy";
import type { ModuleImpactView } from "./dto";
import type { ModuleKey } from "./module-registry";
import { MODULE_BY_KEY, moduleRolledOut, MODULES } from "./module-registry";
import { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

/** A transaction client, for work that must commit with a lifecycle change. */
export type ModuleTransaction = Parameters<
    Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * Extra work to run inside the lifecycle change's own transaction. The admin
 * console writes its ledger entry here, so an operator's module change and the
 * record of it commit together or not at all.
 */
export type AlsoInTransaction = (tx: ModuleTransaction) => Promise<void>;

@Injectable()
export class ModuleLifecycleService {
    constructor(
        private readonly readiness: ModuleReadinessRegistry,
        @Optional() private readonly db: typeof prisma = prisma,
        // Optional for the same reason `db` is: lifecycle is exercised in unit
        // tests without a container, and instrumentation must never be the
        // reason a capability cannot be switched on (#176).
        @Optional() private readonly activation?: ActivationEvents,
        // The rollout gate, for `impact` (DEC-057). Optional like the rest:
        // without it every module counts as rolled out.
        @Optional() private readonly flags?: FeatureFlagService,
    ) {}

    /**
     * What turning a module off touches, with real counts (F13): the module's
     * own lines and those of every module that goes off with it, and the
     * blockers that would refuse it. Reading it needs `module:read`; each
     * count needs its own read, and without it the line says what stops
     * without a number. A module Saroh hasn't rolled out is not there to
     * ask about (DEC-057): 404, as for an unknown key.
     */
    async impact(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<ModuleImpactView> {
        authorize(ctx, "module:read");
        this.descriptor(moduleKey);
        if (!(await this.rolledOut(ctx, moduleKey))) {
            throw new NotFoundException("Unknown module");
        }

        const rows = await this.db.organizationModule.findMany({
            where: { organizationId: ctx.organizationId },
            select: { moduleKey: true, status: true },
        });
        const enabled = new Set(
            rows.filter((r) => r.status === "ENABLED").map((r) => r.moduleKey),
        );
        // What goes off with it: the modules that are on and need it,
        // directly or through another, a module before what it needs — the
        // order the app turns them off in. One Saroh hasn't rolled out is
        // hidden, so it isn't named (DEC-057).
        const goesWith: ModuleKey[] = [];
        const seen = new Set<ModuleKey>([moduleKey]);
        const visit = async (of: ModuleKey): Promise<void> => {
            for (const m of MODULES) {
                if (seen.has(m.key) || !m.dependencies.includes(of)) continue;
                seen.add(m.key);
                await visit(m.key);
                if (enabled.has(m.key) && (await this.rolledOut(ctx, m.key)))
                    goesWith.push(m.key);
            }
        };
        await visit(moduleKey);

        const input = {
            organizationId: ctx.organizationId,
            may: (a: Parameters<typeof allows>[1]) => allows(ctx, a),
        };
        const offOrder = [...goesWith, moduleKey];
        const [items, blockers] = await Promise.all([
            Promise.all(
                [moduleKey, ...goesWith].map((k) =>
                    this.readiness.deactivationImpact(k, input),
                ),
            ),
            Promise.all(
                offOrder.map((k) =>
                    this.readiness.deactivationBlockers(k, input),
                ),
            ),
        ]);
        return {
            moduleKey,
            enabled: enabled.has(moduleKey),
            goesWith,
            items: items.flat(),
            blockers: blockers.flat(),
        };
    }

    private async rolledOut(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<boolean> {
        // Hidden (DEC-068) reads as not rolled out, whatever the flag.
        return moduleRolledOut(this.flags, moduleKey, ctx.organizationId);
    }

    /**
     * Enable a module for the Organization. Requires its dependencies enabled.
     * True when this call switched it on; false when it was already on and
     * nothing ran — `alsoInTransaction` included (the setup payload, DEC-068,
     * relies on that to apply nothing twice).
     */
    async enable(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
        alsoInTransaction?: AlsoInTransaction,
    ): Promise<boolean> {
        authorize(ctx, "module:manage");
        const descriptor = this.descriptor(moduleKey);

        // Idempotent: enabling an already-enabled module is a no-op (no second
        // audit event).
        if ((await this.currentStatus(ctx, moduleKey)) === "ENABLED")
            return false;

        await this.assertMayTurnOn(ctx, moduleKey);

        await this.db.$transaction(async (tx) => {
            await tx.organizationModule.upsert({
                where: {
                    organizationId_moduleKey: {
                        organizationId: ctx.organizationId,
                        moduleKey,
                    },
                },
                create: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                    status: "ENABLED",
                    enabledAt: new Date(),
                    enabledByUserId: ctx.userId,
                },
                update: {
                    status: "ENABLED",
                    enabledAt: new Date(),
                    enabledByUserId: ctx.userId,
                    disabledAt: null,
                    disabledByUserId: null,
                },
            });
            await this.audit(
                tx,
                ctx,
                "organization.module.enabled",
                moduleKey,
                undefined,
                { module: descriptor.label, enabled: true },
            );
            await alsoInTransaction?.(tx);
        });

        // After the commit, so only a module that really is enabled is counted.
        // `moduleEnabled` swallows its own errors — the same tradeoff the audit
        // write makes, for the same reason.
        await this.activation?.moduleEnabled(ctx.organizationId, moduleKey);
        return true;
    }

    /**
     * The refusals turning a module on meets before anything is written:
     * not rolled out (or hidden), or a module it needs is off. Public so
     * the setup payload (DEC-068) refuses in the same words, and before it
     * validates or plans anything.
     */
    async assertMayTurnOn(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<void> {
        const descriptor = this.descriptor(moduleKey);

        // Saroh hasn't rolled it out to this business (DEC-057): it is never
        // shown, so it is never turned on — by the business or an operator,
        // who meets the rules the owner does. The module's name, never the
        // flag or a code.
        if (!(await this.rolledOut(ctx, moduleKey))) {
            throw new BadRequestException(
                `${descriptor.label} isn't available for your business yet.`,
            );
        }

        // Hard dependencies must already be ENABLED.
        if (descriptor.dependencies.length > 0) {
            const deps = await this.db.organizationModule.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    moduleKey: { in: [...descriptor.dependencies] },
                    status: "ENABLED",
                },
                select: { moduleKey: true },
            });
            const enabled = new Set(deps.map((d) => d.moduleKey));
            const missing = descriptor.dependencies.filter(
                (d) => !enabled.has(d),
            );
            if (missing.length > 0) {
                // A sentence a merchant can act on, in the modules' own names
                // ("Class packs needs Appointments. Turn on Appointments
                // first."), not the registry's keys.
                const needs = missing
                    .map((d) => MODULE_BY_KEY.get(d)?.label ?? d)
                    .join(" and ");
                throw new BadRequestException(
                    `${descriptor.label} needs ${needs}. Turn on ${needs} first.`,
                );
            }
        }
    }

    /**
     * Disable a module. Blocked by dependents or unmet safe-deactivation.
     *
     * A dependent Saroh hasn't rolled out (DEC-057) doesn't block it: the
     * business can't see it, so it can't be named in the confirmation nor
     * turned off first, and switching a module off never switches off
     * another without naming it (F13, DEC-067). It keeps its own setting,
     * as a hidden module does, and its dependency gate holds it unavailable
     * until what it needs is back on.
     */
    async disable(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
        alsoInTransaction?: AlsoInTransaction,
    ): Promise<void> {
        authorize(ctx, "module:manage");
        const descriptor = this.descriptor(moduleKey);

        // Idempotent: only an ENABLED module transitions to DISABLED. Disabling
        // an already-disabled/archived/absent module is a no-op.
        if ((await this.currentStatus(ctx, moduleKey)) !== "ENABLED") return;

        // Reverse dependency: no ENABLED module may still depend on this one.
        const dependentKeys = MODULES.filter((m) =>
            m.dependencies.includes(moduleKey),
        ).map((m) => m.key);
        if (dependentKeys.length > 0) {
            const enabledDependents = await this.db.organizationModule.findMany(
                {
                    where: {
                        organizationId: ctx.organizationId,
                        moduleKey: { in: dependentKeys },
                        status: "ENABLED",
                    },
                    select: { moduleKey: true },
                },
            );
            const blocking: typeof enabledDependents = [];
            for (const d of enabledDependents) {
                if (await this.rolledOut(ctx, d.moduleKey as ModuleKey)) {
                    blocking.push(d);
                }
            }
            if (blocking.length > 0) {
                const on = blocking
                    .map(
                        (d) =>
                            MODULE_BY_KEY.get(d.moduleKey as ModuleKey)
                                ?.label ?? d.moduleKey,
                    )
                    .join(" and ");
                throw new ConflictException(
                    `${on} ${blocking.length === 1 ? "needs" : "need"} ${descriptor.label}. Turn off ${on} first.`,
                );
            }
        }

        // Safe-deactivation: never abandon public/financial obligations.
        const blockers = await this.readiness.deactivationBlockers(moduleKey, {
            organizationId: ctx.organizationId,
            may: (a) => allows(ctx, a),
        });
        if (blockers.length > 0) {
            throw new ConflictException({
                error: "MODULE_DEACTIVATION_BLOCKED",
                // The module's name, never its key: this can reach a
                // merchant when a refusal comes without its own sentence
                // (DEC-057).
                message: `${descriptor.label} can't be turned off yet.`,
                blockers,
            });
        }

        await this.db.$transaction(async (tx) => {
            await tx.organizationModule.upsert({
                where: {
                    organizationId_moduleKey: {
                        organizationId: ctx.organizationId,
                        moduleKey,
                    },
                },
                create: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                    status: "DISABLED",
                    disabledAt: new Date(),
                    disabledByUserId: ctx.userId,
                },
                update: {
                    status: "DISABLED",
                    disabledAt: new Date(),
                    disabledByUserId: ctx.userId,
                },
            });
            await this.audit(
                tx,
                ctx,
                "organization.module.disabled",
                moduleKey,
                undefined,
                { module: descriptor.label, enabled: false },
            );
            await alsoInTransaction?.(tx);
        });
    }

    /** Archive a disabled module (retains history; hidden from normal use). */
    async archive(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<void> {
        authorize(ctx, "module:manage");
        const { label } = this.descriptor(moduleKey);

        const installation = await this.db.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                },
            },
            select: { status: true },
        });
        if (installation?.status === "ENABLED") {
            throw new ConflictException(
                `Turn ${label} off before archiving it.`,
            );
        }

        await this.db.$transaction(async (tx) => {
            await tx.organizationModule.upsert({
                where: {
                    organizationId_moduleKey: {
                        organizationId: ctx.organizationId,
                        moduleKey,
                    },
                },
                create: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                    status: "ARCHIVED",
                },
                update: { status: "ARCHIVED" },
            });
            await this.audit(
                tx,
                ctx,
                "organization.module.archived",
                moduleKey,
            );
        });
    }

    /** Select an enabled, project-selectable module for a Project. */
    async selectForProject(
        ctx: OrganizationContext,
        projectId: string,
        moduleKey: ModuleKey,
    ): Promise<void> {
        authorize(ctx, "module:manage");
        const descriptor = this.descriptor(moduleKey);
        if (!descriptor.projectSelectable) {
            throw new BadRequestException(
                `${descriptor.label} can't be chosen per project.`,
            );
        }

        // The Project must belong to this Organization.
        const project = await this.db.project.findFirst({
            where: { id: projectId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!project) {
            throw new NotFoundException("Project not found");
        }

        // The module must be ENABLED for the Organization.
        const installation = await this.db.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                },
            },
            select: { id: true, status: true },
        });
        if (installation?.status !== "ENABLED") {
            throw new BadRequestException(
                `Turn on ${descriptor.label} for the business before adding it to a project.`,
            );
        }

        await this.db.$transaction(async (tx) => {
            await tx.projectModule.upsert({
                where: {
                    projectId_organizationModuleId: {
                        projectId,
                        organizationModuleId: installation.id,
                    },
                },
                create: {
                    organizationId: ctx.organizationId,
                    projectId,
                    organizationModuleId: installation.id,
                },
                update: {},
            });
            await this.audit(
                tx,
                ctx,
                "organization.module.project.selected",
                moduleKey,
                projectId,
            );
        });
    }

    /** Deselect a module from a Project (Organization enablement is unchanged). */
    async deselectForProject(
        ctx: OrganizationContext,
        projectId: string,
        moduleKey: ModuleKey,
    ): Promise<void> {
        authorize(ctx, "module:manage");
        this.descriptor(moduleKey);

        const installation = await this.db.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                },
            },
            select: { id: true },
        });
        if (!installation) return;

        await this.db.$transaction(async (tx) => {
            await tx.projectModule.deleteMany({
                where: {
                    projectId,
                    organizationModuleId: installation.id,
                    organizationId: ctx.organizationId,
                },
            });
            await this.audit(
                tx,
                ctx,
                "organization.module.project.deselected",
                moduleKey,
                projectId,
            );
        });
    }

    /** The persisted lifecycle status, or null when no row exists yet. */
    private async currentStatus(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<string | null> {
        const row = await this.db.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: ctx.organizationId,
                    moduleKey,
                },
            },
            select: { status: true },
        });
        return row?.status ?? null;
    }

    private descriptor(moduleKey: ModuleKey) {
        const descriptor = MODULE_BY_KEY.get(moduleKey);
        if (!descriptor) {
            throw new ForbiddenException(`Unknown module: ${moduleKey}`);
        }
        return descriptor;
    }

    private async audit(
        tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        ctx: OrganizationContext,
        action: string,
        moduleKey: ModuleKey,
        projectId?: string,
        // Switching on or off names the module as the business reads it
        // ("Payments"), so Settings › Activity can say which (#509).
        metadata?: { module: string; enabled: boolean },
    ): Promise<void> {
        await tx.auditEvent.create({
            data: {
                action,
                actorUserId: ctx.userId,
                organizationId: ctx.organizationId,
                projectId: projectId ?? null,
                targetType: "module",
                targetId: moduleKey,
                outcome: "SUCCESS",
                // An operator's switch is Saroh support's in Activity.
                metadata: auditMetadata(ctx.roleKey, metadata),
            },
        });
    }
}
