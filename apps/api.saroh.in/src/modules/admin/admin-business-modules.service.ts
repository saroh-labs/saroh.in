import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    AvailabilityBlocker,
    ModuleAvailability,
} from "../capabilities/module-availability.service";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { ModuleKey } from "../capabilities/module-registry";
import {
    MODULE_BY_KEY,
    moduleHidden,
    MODULES,
} from "../capabilities/module-registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { AdminPermission } from "./admin-permissions";

/** A module's true state for the business, as its owner meets it. */
export type ModuleStateWord = "on" | "off" | "locked";

/**
 * What clears the gate. `release`: turn the module's release on for this
 * business (a flag override). `switch-on`: switch it on for them (the
 * business's own setting, `PUT organizations/:id/modules/:moduleKey`).
 * `plan`: change their plan or give them the module (a catalogue override).
 * `merchant`: only the business can do it (setup in their app).
 */
export interface ModuleFix {
    kind: "release" | "switch-on" | "plan" | "merchant";
    label: string;
    /** The console permission the fix needs; absent when staff can't act. */
    permission?: AdminPermission;
    /** The release's flag, for a `release` fix (staff-only read). */
    flagKey?: string;
}

/** A module this one needs switched on first. Information, never a gate. */
export interface ModuleDependency {
    moduleKey: ModuleKey;
    label: string;
    on: boolean;
}

export interface BusinessModuleState {
    moduleKey: ModuleKey;
    label: string;
    state: ModuleStateWord;
    /** The code of the gate (or readiness step) in the way; null when none. */
    blocker: string | null;
    /** Why, in words; null when nothing is in the way. */
    reason: string | null;
    fix: ModuleFix | null;
    dependencies: ModuleDependency[];
}

export interface BusinessModulesState {
    organizationId: string;
    /** Whether PLAN_ENFORCEMENT is on for this business. */
    planLimitsEnforced: boolean;
    /** Once per business, never per row: "Plan limits not enforced yet". */
    note: string | null;
    modules: BusinessModuleState[];
}

export const PLAN_LIMITS_OFF_NOTE = "Plan limits not enforced yet";

/**
 * Each module's true state for one business (admin console U1, #989): the
 * answer the business's own workspace gets from `evaluate()`, with the gate
 * in the way named in words and the console action that clears it.
 *
 * It invents no gate of its own. Hidden modules (DEC-068) are left out
 * first, by the registry source `moduleRolledOut` reads; every other module
 * is evaluated as the business's OWNER role — fixed, holding every module's
 * required action — so the `authorized` gate passes the way it does for
 * the owner, and staff see what the owner sees. Staff are never members, so
 * there is no membership to judge them by; the console's own permission
 * (`organization:read`) is checked by the route.
 *
 * Dependencies are listed as information: `evaluate()` doesn't enforce them
 * (they are checked only when a module is switched on), so neither does
 * this. With the release off, the plan isn't computed (DEC-057 first), so a
 * module both release-off and outside the plan shows the release fix, and
 * Locked once the release is on.
 */
@Injectable()
export class AdminBusinessModulesService {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        private readonly flags: FeatureFlagService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    async state(organizationId: string): Promise<BusinessModulesState> {
        const org = await this.db.organization.findUnique({
            where: { id: organizationId },
            select: { id: true },
        });
        if (!org) throw new NotFoundException("Business not found");

        const keys = MODULES.map((m) => m.key).filter(
            (key) => !moduleHidden(key),
        );
        const [results, planLimitsEnforced] = await Promise.all([
            Promise.all(
                keys.map((moduleKey) =>
                    this.availability.evaluate({
                        organizationId,
                        moduleKey,
                        organizationRole: "OWNER",
                    }),
                ),
            ),
            this.flags.isEnabled(FlagKey.PLAN_ENFORCEMENT, organizationId),
        ]);

        const rows = results.map(toRow);
        const onByKey = new Map(rows.map((r) => [r.moduleKey, r.state]));
        for (const row of rows) {
            row.dependencies = (
                MODULE_BY_KEY.get(row.moduleKey)?.dependencies ?? []
            ).map((dep) => ({
                moduleKey: dep,
                label: MODULE_BY_KEY.get(dep)?.label ?? dep,
                on: onByKey.get(dep) === "on",
            }));
        }

        return {
            organizationId,
            planLimitsEnforced,
            note: planLimitsEnforced ? null : PLAN_LIMITS_OFF_NOTE,
            modules: rows,
        };
    }
}

/** One evaluation in words: state, the first gate in the way, its fix. */
export function toRow(a: ModuleAvailability): BusinessModuleState {
    const descriptor = MODULE_BY_KEY.get(a.key);
    const label = descriptor?.label ?? a.key;
    const base = { moduleKey: a.key, label, dependencies: [] };
    const first: AvailabilityBlocker | undefined =
        a.blockers.length > 0 ? a.blockers[0] : undefined;

    if (a.gatesPassed) {
        // Readiness only: they can use it; setup may still be theirs to do.
        return {
            ...base,
            state: "on",
            blocker: first?.code ?? null,
            reason: first ? (first.message ?? "Setup still to do") : null,
            fix: first
                ? { kind: "merchant", label: "Only they can finish this" }
                : null,
        };
    }

    const code = first?.code ?? "UNKNOWN";
    switch (code) {
        case "ROLLOUT_DISABLED":
            return {
                ...base,
                state: "off",
                blocker: code,
                reason: "Release off for everyone",
                fix: {
                    kind: "release",
                    label: "Turn on for this business…",
                    permission: AdminPermission.FlagsPublish,
                    flagKey: descriptor?.rolloutFlag,
                },
            };
        case "ORG_MODULE_DISABLED":
            return {
                ...base,
                state: "off",
                blocker: code,
                reason: "They switched it off",
                fix: {
                    kind: "switch-on",
                    label: "Switch on for them…",
                    permission: AdminPermission.OrganizationModulesWrite,
                },
            };
        case "ENTITLEMENT_REQUIRED":
            return {
                ...base,
                state: "locked",
                blocker: code,
                reason: "Not in their plan",
                fix: {
                    kind: "plan",
                    label: "Change plan or give the module…",
                    permission: AdminPermission.PricingOverride,
                },
            };
        case "PROJECT_MODULE_UNSELECTED":
            return {
                ...base,
                state: "off",
                blocker: code,
                reason: "Not chosen for this project",
                fix: { kind: "merchant", label: "Only they can choose it" },
            };
        case "UNAUTHORIZED":
            // Never for the owner role; said plainly if the registry changes.
            return {
                ...base,
                state: "off",
                blocker: code,
                reason: "Their owner's role can't reach it",
                fix: null,
            };
        default:
            return {
                ...base,
                state: "off",
                blocker: code,
                reason: first?.message ?? "Not available to them",
                fix: null,
            };
    }
}
