import "server-only";

import { readMyEmailSetup } from "@/lib/communications/email-setup-service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { connectLocksOf } from "@/lib/providers/connect-lock";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";

import type { ModulesScreen } from "./queries";
import { modulesRead } from "./queries";
import { listModules } from "./service";

/**
 * Modules: everyone in the business may look (the switches are drawn for
 * whoever may not change them); the API decides `canManage` per row.
 */
export async function mayReadModules(): Promise<boolean> {
    return !!(await activeOrganizationOnce());
}

export const modulesServer: ServerRead<
    Parameters<typeof modulesRead.options>[1],
    ModulesScreen
> = {
    read: modulesRead,
    service: async () => {
        // The plan and Email's own answer, best-effort (UX-006, DEC-091).
        const [modules, access, emailSetup] = await Promise.all([
            listModules(),
            billingAccessOrNull(),
            readMyEmailSetup().catch(() => null),
        ]);
        return { modules, locks: connectLocksOf(access, emailSetup) };
    },
};
