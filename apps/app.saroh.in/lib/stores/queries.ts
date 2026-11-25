import { z } from "zod";

import type { Invitation, Member } from "@/lib/members/service";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { SiteSelling } from "@/lib/sites/sells-from";

import type { LocationDetails } from "./location-details";
import type { StorefrontSettings, StorefrontSummary } from "./storefronts";

/**
 * Sell › Locations' reads (DEC-259): the list of locations, and one
 * location's page. Client-safe: the keys and the routes; the services are
 * paired in `access.ts`. Both are `settings` reads: they change only
 * through this page's own saves, which read them again.
 */

/** Every Locations read of a business. */
export const storesKeys = (orgId: string): DomainKey =>
    domainKey("stores", orgId);

/** What the list of locations draws, beside the gates the page holds. */
export interface LocationsView {
    storefronts: StorefrontSummary[];
    /** The plan's ceiling; null when it couldn't be read (New is offered). */
    limit: number | null;
    /**
     * The website each selling line reads (DEC-069): null with no website,
     * left out when it couldn't be read (then no line is shown).
     */
    site?: SiteSelling | null;
    /** Past the plan's locations limit (#800): stopped taking orders. */
    notTakingOrders: string[];
}

export const locationsRead = defineRead<LocationsView>()({
    key: (orgId) => domainKey("stores", orgId, "list"),
    route: { path: "/api/locations", params: {} },
    tier: "settings",
});

export type LocationsAsk = Parameters<typeof locationsRead.options>[1];

/** Who works at a location, as the API lists them. */
export interface LocationRoster {
    members: Member[];
    invitations: Invitation[];
}

/** One location's page: its settings and, each tolerant, its details and roster. */
export interface LocationView {
    settings: StorefrontSettings;
    /** Left out when they couldn't be read; so is their row. */
    details?: LocationDetails;
    /** Null when it couldn't be read: the People tab says so. */
    roster: LocationRoster | null;
}

export const locationRead = defineRead<LocationView>()({
    key: (orgId, { storeId }) =>
        domainKey("stores", orgId, "location", storeId),
    route: {
        path: "/api/locations/[storeId]",
        params: { storeId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "settings",
});

export type LocationAsk = Parameters<typeof locationRead.options>[1];
