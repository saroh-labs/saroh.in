/**
 * Module availability composition (ADR-003 / #114, plan Task 3).
 *
 * Answers "can this actor use module X in this Organization/Project right now?"
 * by composing the four independent gates in a deterministic order, then — only
 * if every gate passes — the derived readiness. Returns a typed result (not a
 * boolean) so the shell and API can render precise, role-aware guidance.
 *
 * Gate order and user-facing precedence (plan §"Availability evaluation"):
 *   1. authorized   — UNAUTHORIZED (never shown as an upsell)
 *   2. rollout      — ROLLOUT_DISABLED (generic unavailable; leaks no flag)
 *   3. configured   — ORG_MODULE_DISABLED (OWNER/ADMIN → Settings → Modules)
 *   4. selected     — PROJECT_MODULE_UNSELECTED (OWNER/ADMIN → Project settings)
 *   5. entitled     — ENTITLEMENT_REQUIRED (only after the above pass)
 *   6. readiness    — setup/health blockers
 */
import { Injectable, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { can } from "../organizations/organization-policy";
import type {
    ModuleKey,
    ModuleLifecycle,
    ModuleReadiness,
} from "./module-registry";
import { MODULE_BY_KEY, MODULE_KEYS } from "./module-registry";
import { ModuleReadinessRegistry } from "./readiness/module-readiness.registry";

/** A single reason a module is unavailable or not fully ready. */
export interface AvailabilityBlocker {
    code: string;
    actionHref?: string;
    message?: string;
}

/** The effective availability of one module for one actor/context. */
export interface ModuleAvailability {
    key: ModuleKey;
    configured: boolean;
    selectedForProject: boolean;
    rolloutAllowed: boolean;
    entitled: boolean;
    authorized: boolean;
    readiness: ModuleReadiness;
    blockers: AvailabilityBlocker[];
}

/** Inputs to an availability evaluation. */
export interface AvailabilityInput {
    organizationId: string;
    moduleKey: ModuleKey;
    organizationRole: OrgRole;
    projectId?: string;
}

/**
 * The client-safe module view (API read model). Deliberately omits rollout-flag
 * keys, entitlement internals, and provider secrets.
 */
export interface ModuleView {
    key: ModuleKey;
    label: string;
    lifecycle: ModuleLifecycle;
    readiness: ModuleReadiness;
    selectedForProject: boolean;
    canManage: boolean;
    /** Hard enable-dependencies (server-owned; the client must not derive these). */
    dependencies: ModuleKey[];
    blockers: AvailabilityBlocker[];
}

const MODULES_SETTINGS_HREF = "/settings/modules";

@Injectable()
export class ModuleAvailabilityService {
    constructor(
        private readonly flags: FeatureFlagService,
        private readonly entitlements: EntitlementService,
        private readonly readiness: ModuleReadinessRegistry,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    /** Evaluate one module. */
    async evaluate(input: AvailabilityInput): Promise<ModuleAvailability> {
        const descriptor = MODULE_BY_KEY.get(input.moduleKey);
        if (!descriptor) {
            throw new Error(`unknown module: ${input.moduleKey}`);
        }

        const authorized = can(
            input.organizationRole,
            descriptor.requiredAction,
        );
        const canManage = can(input.organizationRole, "module:manage");

        const rolloutAllowed = await this.flags.isEnabled(
            descriptor.rolloutFlag,
            input.organizationId,
        );

        const installation = await this.db.organizationModule.findUnique({
            where: {
                organizationId_moduleKey: {
                    organizationId: input.organizationId,
                    moduleKey: input.moduleKey,
                },
            },
            select: { status: true },
        });
        const configured = installation?.status === "ENABLED";

        const selectedForProject = input.projectId
            ? (await this.db.projectModule.count({
                  where: {
                      organizationId: input.organizationId,
                      projectId: input.projectId,
                      organizationModule: { moduleKey: input.moduleKey },
                  },
              })) > 0
            : true;

        const entitled = descriptor.entitlementKey
            ? await this.entitlements.can(
                  input.organizationId,
                  descriptor.entitlementKey,
              )
            : true;

        const gates = {
            key: input.moduleKey,
            configured,
            selectedForProject,
            rolloutAllowed,
            entitled,
            authorized,
        };

        // Blockers in strict precedence order.
        const blockers: AvailabilityBlocker[] = [];
        if (!authorized) blockers.push({ code: "UNAUTHORIZED" });
        if (!rolloutAllowed) blockers.push({ code: "ROLLOUT_DISABLED" });
        if (!configured)
            blockers.push({
                code: "ORG_MODULE_DISABLED",
                actionHref: canManage ? MODULES_SETTINGS_HREF : undefined,
            });
        if (!selectedForProject)
            blockers.push({
                code: "PROJECT_MODULE_UNSELECTED",
                actionHref:
                    canManage && input.projectId
                        ? `/projects/${input.projectId}/settings/modules`
                        : undefined,
            });
        if (!entitled) blockers.push({ code: "ENTITLEMENT_REQUIRED" });

        if (blockers.length > 0) {
            return { ...gates, readiness: "DISABLED", blockers };
        }

        // All gates pass — derive readiness.
        const readiness = await this.readiness.evaluate(input.moduleKey, {
            organizationId: input.organizationId,
            projectId: input.projectId,
        });
        return {
            ...gates,
            readiness: readiness.readiness,
            blockers: readiness.blockers.map((b) => ({
                code: b.code,
                actionHref: b.actionHref,
                message: b.message,
            })),
        };
    }

    /** Evaluate every module — the read model the product shell consumes. */
    async evaluateAll(
        input: Omit<AvailabilityInput, "moduleKey">,
    ): Promise<ModuleAvailability[]> {
        return Promise.all(
            MODULE_KEYS.map((moduleKey) =>
                this.evaluate({ ...input, moduleKey }),
            ),
        );
    }

    /**
     * The client-safe catalog + effective state for every module — what
     * `GET /organizations/:id/modules` returns. Enriches availability with the
     * registry label and the persisted lifecycle.
     */
    async listViews(
        input: Omit<AvailabilityInput, "moduleKey">,
    ): Promise<ModuleView[]> {
        const [availabilities, installations] = await Promise.all([
            this.evaluateAll(input),
            this.db.organizationModule.findMany({
                where: { organizationId: input.organizationId },
                select: { moduleKey: true, status: true },
            }),
        ]);
        const lifecycleByKey = new Map(
            installations.map((i) => [i.moduleKey, i.status]),
        );
        const canManage = can(input.organizationRole, "module:manage");

        return availabilities.map((a) => ({
            key: a.key,
            label: MODULE_BY_KEY.get(a.key)?.label ?? a.key,
            lifecycle: (lifecycleByKey.get(a.key) ??
                "DISABLED") as ModuleLifecycle,
            readiness: a.readiness,
            selectedForProject: a.selectedForProject,
            canManage,
            dependencies: [...(MODULE_BY_KEY.get(a.key)?.dependencies ?? [])],
            blockers: a.blockers,
        }));
    }

    /** The client-safe view for a single module (returned after a mutation). */
    async view(input: AvailabilityInput): Promise<ModuleView> {
        const [availability, installation] = await Promise.all([
            this.evaluate(input),
            this.db.organizationModule.findUnique({
                where: {
                    organizationId_moduleKey: {
                        organizationId: input.organizationId,
                        moduleKey: input.moduleKey,
                    },
                },
                select: { status: true },
            }),
        ]);
        return {
            key: availability.key,
            label:
                MODULE_BY_KEY.get(availability.key)?.label ?? availability.key,
            lifecycle: (installation?.status ?? "DISABLED") as ModuleLifecycle,
            readiness: availability.readiness,
            selectedForProject: availability.selectedForProject,
            canManage: can(input.organizationRole, "module:manage"),
            dependencies: [
                ...(MODULE_BY_KEY.get(availability.key)?.dependencies ?? []),
            ],
            blockers: availability.blockers,
        };
    }
}
