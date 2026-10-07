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

/**
 * The steps that are only "connect a provider" (none yet, or the one it had
 * disabled): on a plan that won't let it connect one, the lock is the
 * answer, never "Go to Providers" beside it (UX-017).
 */
const CONNECT_STEPS = new Set([
    "PAYMENTS_NO_PROVIDER",
    "PAYMENTS_PROVIDER_DISABLED",
    "COMMUNICATIONS_NO_PROVIDER",
    "COMMUNICATIONS_PROVIDER_DISABLED",
]);

const onlyConnectSteps = (module: ModuleView) =>
    module.blockers.length > 0 &&
    module.blockers.every((b) => CONNECT_STEPS.has(b.code));

export function rowPlanLock(
    module: ModuleView,
    locks: ConnectLocks | null,
): RowPlanLock | null {
    if (module.lifecycle !== "ENABLED") return null;
    const lock = connectLockFor(module.key, locks);
    if (!lock) return null;
    if (
        module.key === "COMMUNICATIONS" &&
        !(module.readiness === "SETUP_REQUIRED" && onlyConnectSteps(module))
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
 * The row as the list draws it: a Payments or Communications row whose only
 * step is a provider the plan won't let it connect (none yet, or an old
 * one disabled) reads as on and ready, so it is neither tagged "Finish
 * setup" nor sorted with the ones that need work, and never says "Go to
 * Providers" beside the plan's line (UX-017).
 */
export function asShown(
    module: ModuleView,
    lock: RowPlanLock | null,
): ModuleView {
    return lock &&
        module.readiness === "SETUP_REQUIRED" &&
        onlyConnectSteps(module)
        ? { ...module, readiness: "ACTIVE", blockers: [] }
        : module;
}
