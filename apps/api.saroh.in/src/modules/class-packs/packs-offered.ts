import { prisma } from "@saroh/database";

import { MODULE_BY_KEY } from "../capabilities/module-registry";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";

/**
 * Whether a business offers class packs to its own customers on its site
 * (round-2 A11): Saroh has rolled Class packs out (DEC-057 — a module Saroh
 * has switched off is never shown) **and** the business has it on (E12).
 *
 * Stricter than `classPacksOn`, which counts a missing module row as on for
 * the desk's sales: a customer is only offered what the business has
 * actually turned on, as the account area reads every module
 * (`account-home.service.ts`).
 */
export async function packsOffered(
    organizationId: string,
    flags: Pick<FeatureFlagService, "isEnabled"> = new FeatureFlagService(),
): Promise<boolean> {
    const descriptor = MODULE_BY_KEY.get("CLASS_PACKS");
    if (!descriptor) return false;
    const [rolledOut, installed] = await Promise.all([
        flags.isEnabled(descriptor.rolloutFlag, organizationId),
        prisma.organizationModule.findFirst({
            where: {
                organizationId,
                moduleKey: "CLASS_PACKS",
                status: "ENABLED",
            },
            select: { id: true },
        }),
    ]);
    return rolledOut && installed !== null;
}
