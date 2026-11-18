import { ForbiddenException, Logger } from "@nestjs/common";
import { catalogueModulesFor } from "@saroh/pricing-catalog";

import { registryModuleIncluded } from "./catalogue-access";
import { CatalogueAccessService } from "./catalogue-access.service";
import { planMeter } from "./metering.service";
import { MODULE_LOCKED, moduleLocked } from "./plan-limit-errors";

/** The paid-only modules a write asks about, with the words a refusal uses. */
const NAMES = { COURSES: "Courses", CLASS_PACKS: "Class packs" } as const;
export type PaidModule = keyof typeof NAMES;

const logger = new Logger("ModulePlan");

/** Shared, as `planMeter`'s own reader is: one bare service, no DI. */
export const modulePlanAccess = new CatalogueAccessService();

/**
 * 403 `MODULE_LOCKED` when the business's plan leaves a paid-only module off
 * (05-P-02, 04-F10): making a course, adding a session or an enrolment;
 * making, publishing, bringing back or selling a class pack. Asked by the
 * service itself, so it holds whatever `MODULE_ENFORCEMENT` says, and
 * through the same access read as every plan check: behind
 * `PLAN_ENFORCEMENT`, failing open (logged) when the plan can't be read
 * (OQ-4). A version with no row for the module gives it to paid plans only
 * (`PAID_ONLY_REGISTRY`). What already exists goes on: reads, edits,
 * archiving, extending a customer's pack and using one on a booking are
 * never asked here (ADR-003).
 */
export async function assertPlanIncludesModule(
    organizationId: string,
    module: PaidModule,
    now: Date = new Date(),
): Promise<void> {
    if (!(await planMeter.enforcing(organizationId))) return;
    let access;
    try {
        access = await modulePlanAccess.resolve(organizationId, now);
    } catch (err) {
        logger.warn(
            `plan_meter_unresolved org=${organizationId} module=${module} error=${err instanceof Error ? err.name : "unknown"}`,
        );
        return;
    }
    if (access.source !== "catalogue") return;
    if (
        registryModuleIncluded(
            access.catalog,
            access.modules,
            module,
            access.planId,
        )
    ) {
        return;
    }
    const rows = catalogueModulesFor(module);
    const row = access.modules.find((m) => rows.includes(m.moduleId));
    if (row) throw moduleLocked(row);
    // The version has no row to name: say it plainly, pointing at no plan.
    throw new ForbiddenException({
        message: `${NAMES[module]} isn't in your ${access.planName} plan.`,
        details: {
            code: MODULE_LOCKED,
            moduleId: rows[0] ?? module,
            plan: { id: access.planId, name: access.planName },
            upgradeTo: null,
        },
    });
}
