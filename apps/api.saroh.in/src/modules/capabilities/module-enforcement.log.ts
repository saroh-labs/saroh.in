import { structuredLogger } from "../../common/logging/structured-logger";

/**
 * The log lines `ModuleEnforcementGuard` writes (#117), and how often.
 *
 * - `module_enforcement_would_refuse` (INFO) — `MODULE_ENFORCEMENT=shadow`:
 *   the request was let through, and would have been refused were
 *   enforcement on. The runbook's Shadow step reads these.
 * - `module_enforcement_refused` (WARN) — enforcement on, and the request was
 *   refused (403, or 404 for an actor who may not use the module).
 * - `module_enforcement_shadow_failed` (WARN) — shadow mode could not work
 *   out the answer (a lookup threw). The request was let through as before.
 *
 * Each line carries the module, the route's template (never the URL, which
 * holds ids and query strings), the organization id and the blocker codes —
 * no user, no names, no payload. The request's correlation id comes from the
 * structured logger.
 *
 * Volume: one line per (event, module, route, organization, blockers) per
 * window, however much traffic repeats it, and the next line says how many
 * were folded into it (`repeats`). The memory is bounded: past MAX_KEYS the
 * oldest key is forgotten, which can only mean one extra line later. What
 * volume means: a steady trickle of `would_refuse` is the list to investigate
 * before turning enforcement on; any `refused` after the flip that is not a
 * business with the module switched off is a bug.
 */

export type ModuleEnforcementEvent =
    | "module_enforcement_would_refuse"
    | "module_enforcement_refused"
    | "module_enforcement_shadow_failed";

export interface ModuleEnforcementLogFields {
    module: string;
    route: string;
    org?: string;
    blockers?: string[];
    status?: number;
}

/** One line per key per window. */
export const LOG_WINDOW_MS = 10 * 60 * 1000;
/** Keys remembered at once; the oldest goes first. */
export const MAX_KEYS = 2000;

interface Seen {
    at: number;
    repeats: number;
}

const seen = new Map<string, Seen>();

function keyOf(
    event: ModuleEnforcementEvent,
    f: ModuleEnforcementLogFields,
): string {
    return [
        event,
        f.module,
        f.route,
        f.org ?? "",
        (f.blockers ?? []).join(","),
    ].join("|");
}

/**
 * Write the line unless the same one was written inside the window. Returns
 * whether it was written (for tests).
 */
export function logModuleEnforcement(
    event: ModuleEnforcementEvent,
    fields: ModuleEnforcementLogFields,
    now: number = Date.now(),
): boolean {
    const key = keyOf(event, fields);
    const last = seen.get(key);
    if (last && now - last.at < LOG_WINDOW_MS) {
        last.repeats += 1;
        return false;
    }
    const repeats = last?.repeats ?? 0;
    // Re-insert so the Map's order stays oldest-first.
    seen.delete(key);
    seen.set(key, { at: now, repeats: 0 });
    while (seen.size > MAX_KEYS) {
        const oldest = seen.keys().next().value;
        if (oldest === undefined) break;
        seen.delete(oldest);
    }
    const line = { ...fields, repeats };
    if (event === "module_enforcement_would_refuse") {
        structuredLogger.info(event, line);
    } else {
        structuredLogger.warn(event, line);
    }
    return true;
}

/** Forget every key (tests). */
export function resetModuleEnforcementLog(): void {
    seen.clear();
}
