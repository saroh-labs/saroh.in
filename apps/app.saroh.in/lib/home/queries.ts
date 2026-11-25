import type { HomeSetup } from "@/components/home/dashboard/home-setup";
import type { MomentView } from "@/lib/moments/keys";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { InvoiceJobFacts } from "./first-run";
import type { HomeModel } from "./service";

/**
 * Home's reads (DEC-259). Client-safe: keys and routes only; the services
 * that answer them are paired in `access.ts`.
 */

/** Every Home read of a business: what a save on Home invalidates. */
export const homeKeys = (orgId: string): DomainKey => domainKey("home", orgId);

/**
 * Home as the screen draws it: the API's aggregate, and what Home says
 * from it (DEC-259: Home loads in the browser, so these are read beside
 * it, never by the page). Nothing of them on a Reviewer's Home.
 */
export interface HomeScreen extends HomeModel {
    /** The first order or booking, in its first day (wave G); business Home. */
    moment: MomentView | null;
    /**
     * One new feature (release visibility U14), while nothing else holds
     * the message slot; the container also waits while Finish setup leads.
     */
    news: MomentView | null;
    /** "Invoice a client" (DEC-070), while nothing is on; else absent. */
    invoicing?: InvoiceJobFacts;
}

/** Home's one aggregate: Needs you, Today, the tiles, How it's going. */
export const homeRead = defineRead<HomeScreen>()({
    key: (orgId) => domainKey("home", orgId, "home"),
    route: { path: "/api/home", params: {} },
});

/** "Finish setup" (F8): owners and admins only, so a read of its own. */
export const homeSetupRead = defineRead<HomeSetup>()({
    key: (orgId) => domainKey("home", orgId, "setup"),
    route: { path: "/api/home/setup", params: {} },
});
