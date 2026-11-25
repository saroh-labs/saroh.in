import "server-only";

import { pausedLocationIds } from "@/lib/billing/paused";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { pausedOrNull } from "@/lib/saroh-billing/service";

import { readLocationDetails, readLocationRoster } from "./location-reads";
import { readSiteSelling } from "./location-selling";
import type {
    LocationAsk,
    LocationsAsk,
    LocationsView,
    LocationView,
} from "./queries";
import { locationRead, locationsRead } from "./queries";
import {
    getStorefront,
    getStorefrontAllowance,
    listStorefronts,
} from "./storefronts";

/**
 * Locations' reads on the server (DEC-259): what `/api/locations` and
 * `/api/locations/[storeId]` answer with.
 */

/**
 * Who reads Locations: anyone in the open business, as the page asks only
 * for the session. The API decides what each role is shown on every read.
 */
export async function mayReadLocations(): Promise<boolean> {
    return (await activeOrganizationOnce()) !== null;
}

export const locationsServer: ServerRead<LocationsAsk, LocationsView> = {
    read: locationsRead,
    service: async () => {
        const [storefronts, allowance, selling, paused] = await Promise.all([
            listStorefronts(),
            // Unreadable offers New and lets the API decide.
            getStorefrontAllowance().catch(() => null),
            readSiteSelling(),
            pausedOrNull(),
        ]);
        return {
            storefronts,
            limit: allowance?.limit ?? null,
            site: selling.known ? selling.site : undefined,
            notTakingOrders: pausedLocationIds(paused),
        };
    },
};

/**
 * One location: its settings (a 404 when not this business's), and beside
 * them its description and logo and its roster, each failing on its own.
 */
export const locationServer: ServerRead<LocationAsk, LocationView> = {
    read: locationRead,
    service: async ({ storeId }) => {
        const [settings, details, roster] = await Promise.all([
            getStorefront(storeId),
            readLocationDetails(storeId),
            readLocationRoster(storeId),
        ]);
        return settings && { settings, details, roster };
    },
};
