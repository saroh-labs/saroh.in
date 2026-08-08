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
import { authorize } from "../organizations/organization-policy";
import type { ModuleKey } from "./module-registry";
import { MODULE_BY_KEY, MODULES } from "./module-registry";
import { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

@Injectable()
export class ModuleLifecycleService {
    constructor(
        private readonly readiness: ModuleReadinessRegistry,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    /** Enable a module for the Organization. Requires its dependencies enabled. */
    async enable(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<void> {
        authorize(ctx, "module:manage");
        const descriptor = this.descriptor(moduleKey);

        // Idempotent: enabling an already-enabled module is a no-op (no second
        // audit event).
        if ((await this.currentStatus(ctx, moduleKey)) === "ENABLED") return;

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
                throw new BadRequestException(
                    `Cannot enable ${moduleKey}: enable ${missing.join(", ")} first.`,
                );
            }
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
            await this.audit(tx, ctx, "organization.module.enabled", moduleKey);
        });
    }

    /** Disable a module. Blocked by dependents or unmet safe-deactivation. */
    async disable(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
    ): Promise<void> {
        authorize(ctx, "module:manage");
        this.descriptor(moduleKey);

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
            if (enabledDependents.length > 0) {
                throw new ConflictException(
                    `Cannot disable ${moduleKey}: disable ${enabledDependents
                        .map((d) => d.moduleKey)
                        .join(", ")} first.`,
                );
            }
        }

        // Safe-deactivation: never abandon public/financial obligations.
        const blockers = await this.readiness.deactivationBlockers(moduleKey, {
            organizationId: ctx.organizationId,
        });
        if (blockers.length > 0) {
            throw new ConflictException({
                error: "MODULE_DEACTIVATION_BLOCKED",
                message: `Cannot disable ${moduleKey} yet.`,
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
            );
        });
    }

    /** Archive a disabled module (retains history; hidden from normal use). */
    async archive(
        ctx: OrganizationContext,
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
            select: { status: true },
        });
        if (installation?.status === "ENABLED") {
            throw new ConflictException(
                `Disable ${moduleKey} before archiving it.`,
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
                `${moduleKey} cannot be selected per Project.`,
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
                `Enable ${moduleKey} for the Organization before selecting it for a Project.`,
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
            },
        });
    }
}
