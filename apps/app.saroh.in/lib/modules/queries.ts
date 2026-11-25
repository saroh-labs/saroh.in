import type { ModuleView } from "@/lib/modules/schema";
import type { ConnectLocks } from "@/lib/providers/connect-lock";
import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

/**
 * Settings › Modules (DEC-259): what the business runs on, and what the
 * plan won't let it connect (UX-006). Client-safe: the key and the route;
 * the service is paired in `access.ts`. A `settings` read: a module turned
 * on or off calls `afterSettingsSave()`, which reads it and the shell again.
 */
export interface ModulesScreen {
    modules: ModuleView[];
    locks: ConnectLocks | null;
}

export const modulesRead = defineRead<ModulesScreen>()({
    key: (orgId) => domainKey("settings", orgId, "modules"),
    route: { path: "/api/modules", params: {} },
    tier: "settings",
});
