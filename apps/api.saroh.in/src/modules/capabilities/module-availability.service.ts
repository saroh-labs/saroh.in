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
import type { ModuleKey, ModuleReadiness } from "./module-registry";
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
}
