import type { HomeSetup } from "@/components/home/dashboard/home-setup";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { HomeModel } from "./service";

/**
 * Home's reads (DEC-259). Client-safe: keys and routes only; the services
 * that answer them are paired in `access.ts`.
 */

/** Every Home read of a business: what a save on Home invalidates. */
export const homeKeys = (orgId: string): DomainKey => domainKey("home", orgId);

/** Home's one aggregate: Needs you, Today, the tiles, How it's going. */
export const homeRead = defineRead<HomeModel>()({
    key: (orgId) => domainKey("home", orgId, "home"),
    route: { path: "/api/home", params: {} },
});

/** "Finish setup" (F8): owners and admins only, so a read of its own. */
export const homeSetupRead = defineRead<HomeSetup>()({
    key: (orgId) => domainKey("home", orgId, "setup"),
    route: { path: "/api/home/setup", params: {} },
});
