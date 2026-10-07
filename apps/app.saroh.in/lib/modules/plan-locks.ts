import type { ConnectLocks } from "@/lib/providers/connect-lock";
import { connectLockFor, connectLockLine } from "@/lib/providers/connect-lock";

import type { ModuleView } from "./schema";

/**
 * Settings › Modules on a plan that won't let the business connect a
 * provider (DEC-091, UX-006): what each such row says, up front, instead of
 * "Finish setup" and a Connect that leads to a key form the API refuses.
 *
 * - Payments, on: the offline kind; how customers pay and the plan that
 *   takes payment online, with See plans. The API already reads it as
 *   ready on such a plan (UX-017).
 * - Communications, on with nothing connected: connecting your own email
 *   comes with the plan, not a setup step left — so no "Finish setup" tag
 *   and no Connect.
 *
 * Unread locks (`null`) change nothing.
 */
export interface RowPlanLock {
    line: string;
    cta: string;
    href: string;
}

const NO_PROVIDER = "COMMUNICATIONS_NO_PROVIDER";

export function rowPlanLock(
    module: ModuleView,
    locks: ConnectLocks | null,
): RowPlanLock | null {
    if (module.lifecycle !== "ENABLED") return null;
    const lock = connectLockFor(module.key, locks);
    if (!lock) return null;
    if (
        module.key === "COMMUNICATIONS" &&
        !(
            module.readiness === "SETUP_REQUIRED" &&
            module.blockers[0]?.code === NO_PROVIDER
        )
    ) {
        return null;
    }
    return {
        line: connectLockLine(module.key, lock),
        cta: lock.cta,
        href: lock.href,
    };
}

/**
 * The row as the list draws it: a Communications row whose only step is a
 * provider the plan won't let it connect reads as on and ready, so it is
 * neither tagged "Finish setup" nor sorted with the ones that need work.
 */
export function asShown(
    module: ModuleView,
    lock: RowPlanLock | null,
): ModuleView {
    return lock && module.readiness === "SETUP_REQUIRED"
        ? { ...module, readiness: "ACTIVE", blockers: [] }
        : module;
}
