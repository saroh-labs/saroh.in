import { rolledOutKeys } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";

import type { RoleCatalogue } from "./roles";

/**
 * The permissions that belong to one module and nothing else, by the start
 * of their action. A permission several parts of the business share (seeing
 * customers, storefronts, the media library) belongs to none, so it always
 * shows.
 */
const MODULE_OF_PREFIX: readonly (readonly [prefix: string, module: string])[] =
    [
        ["automation:", "AUTOMATIONS"],
        ["course:", "COURSES"],
        ["pack:", "CLASS_PACKS"],
        ["booking:", "APPOINTMENTS"],
        ["service:", "APPOINTMENTS"],
        ["order:", "COMMERCE"],
        ["inventory:", "COMMERCE"],
        ["discount:", "COMMERCE"],
        ["product-review:", "COMMERCE"],
        ["site:", "WEBSITE"],
        ["section:", "WEBSITE"],
        ["form:", "WEBSITE"],
        ["lead:", "CRM"],
        ["pipeline:", "CRM"],
        ["activity:", "CRM"],
        ["payment:", "PAYMENTS"],
        ["message:", "COMMUNICATIONS"],
        ["comms:", "COMMUNICATIONS"],
        ["analytics:", "INSIGHTS"],
    ];

/** The module a permission belongs to, or null when it isn't one module's. */
export function moduleOfAction(action: string): string | null {
    return MODULE_OF_PREFIX.find(([p]) => action.startsWith(p))?.[1] ?? null;
}

/**
 * The permission lists as the business may see them (DEC-073, DEC-057,
 * DEC-068): a module Saroh hasn't rolled out, or has no screen yet
 * (Automations), is never named, so neither are its permissions — no
 * "Manage automations" in the role editor or a person's extras. The same
 * `rolledOut` rule as every other surface decides.
 *
 * Only what is shown changes: a role or a person keeps a permission it
 * already holds, and the editor saves it back untouched. When the modules
 * couldn't be read, nothing is held back.
 */
export function shownCatalogue(
    catalogue: RoleCatalogue | null,
    modules: readonly ModuleView[] | null,
): RoleCatalogue | null {
    if (!catalogue || !modules || modules.length === 0) return catalogue;
    const shown = rolledOutKeys(modules);
    return {
        ...catalogue,
        capabilities: catalogue.capabilities.filter((c) => {
            const module = moduleOfAction(c.action);
            return module === null || shown.has(module);
        }),
    };
}
