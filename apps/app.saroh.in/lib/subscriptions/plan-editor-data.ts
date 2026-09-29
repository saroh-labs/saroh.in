import { modulesOrUnknown } from "@/lib/modules/guard";

import { plansShowClasses } from "./plan-cards";
import type { Plan } from "./service";
import { getAutopayOffer, listPlans } from "./service";

/**
 * What the Plan Editor's pages read beside the plan itself (D7). Server-only.
 *
 * - the other plans' names, for a clash seen as it is typed (a name is free
 *   among plans that aren't archived, D1, drafts included);
 * - whether the business sells classes (Appointments on, default 31), read
 *   from the module projection as Plan Detail reads it;
 * - the currency a new plan is shown in: the API makes it the business's,
 *   and the newest plan's is the best guess before the first save;
 * - whether the business offers autopay (D14), so "how it's paid" promises
 *   it only then; a failed or older read is not offered.
 */
export async function planEditorContext(planId: string | null): Promise<{
    takenNames: string[];
    withClasses: boolean;
    currency: string;
    /** This plan as the list reads it: who is on it, what it brings in. */
    plan: Plan | null;
    autopayOffered: boolean;
}> {
    const [plans, modules, autopay] = await Promise.all([
        listPlans({ drafts: true }),
        modulesOrUnknown(),
        getAutopayOffer(),
    ]);
    const appointments = modules
        ? modules.some(
              (m) => m.key === "APPOINTMENTS" && m.readiness !== "DISABLED",
          )
        : null;
    const mine = plans.filter((p) => p.id === planId);
    return {
        takenNames: plans
            .filter((p) => p.id !== planId && p.status !== "ARCHIVED")
            .map((p) => p.name),
        withClasses: plansShowClasses(appointments, mine.length ? mine : plans),
        currency:
            [...plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                ?.currency ?? "INR",
        plan: mine[0] ?? null,
        autopayOffered: autopay?.offered ?? false,
    };
}
