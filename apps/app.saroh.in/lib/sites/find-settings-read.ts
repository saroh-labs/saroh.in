"use server";

import { resolveActiveOrganization } from "@/lib/organizations/service";
import type {
    OrganizationSettings,
    SiteContactView,
} from "@/lib/organizations/settings-service";
import {
    readOrganizationSettings,
    readSiteContact,
} from "@/lib/organizations/settings-service";
import { getSite } from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";
import { siteAddressOf } from "@/lib/sites/share-links";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import type { VisitedLocation } from "@/lib/stores/storefronts";
import { listVisitedLocations } from "@/lib/stores/storefronts";

/**
 * What the editor's Find (U46c) opens in a sheet without leaving the
 * editor: Contact and social, and the web address, read as Website ›
 * Settings reads them (`(tabs)/settings/page.tsx`), so the sheet draws the
 * same rows and edits in the same sheets.
 */
export interface FindContactRead {
    contact: SiteContactView | null;
    business: OrganizationSettings | null;
    locations: VisitedLocation[] | null;
    canEditLocations: boolean;
}

export async function readFindContact(): Promise<FindContactRead> {
    const [contact, settings] = await Promise.all([
        readSiteContact(),
        readOrganizationSettings().catch(() => null),
    ]);
    const business = settings?.ok ? settings.data : null;
    const [visited, organization] = business
        ? await Promise.all([
              listVisitedLocations(),
              resolveActiveOrganization().catch(() => null),
          ])
        : [null, null];
    return {
        contact,
        business,
        locations: visited?.state === "ok" ? visited.locations : null,
        canEditLocations: organization?.actions
            ? organization.actions.includes("store:write")
            : organization?.role === "OWNER" || organization?.role === "ADMIN",
    };
}

export interface FindAddressRead {
    address: SiteAddress | null;
    live: boolean;
    canChangeAddress: boolean;
}

/** The site's web address; null when the site couldn't be read. */
export async function readFindAddress(
    siteId: string,
): Promise<FindAddressRead | null> {
    const [site, webAddress] = await Promise.all([
        getSite(siteId).catch(() => null),
        readWebAddressLinks(),
    ]);
    if (!site) return null;
    return {
        address: siteAddressOf(site, webAddress, RENDERER_APEX),
        live: Boolean(site.currentPublication),
        canChangeAddress:
            webAddress?.canChange === true &&
            webAddress.address === site.subdomain,
    };
}
