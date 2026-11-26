"use server";

import { writeAsOrgIfSent } from "@/lib/api/assert-active-org";

import {
    claimDomain as claimDomainApi,
    listSiteDomains as listSiteDomainsApi,
    removeDomain as removeDomainApi,
    verifyDomain as verifyDomainApi,
} from "./service";

/**
 * Server actions for a site's own domain (#200). Thin: the api authorizes
 * `domain:manage` and the plan's `customDomain` entitlement; these only carry
 * the session. A write from a React Query screen (Website › Settings) takes
 * the tab's business last (`writeAsOrgIfSent`), refusing a moved tab.
 */

export async function listSiteDomains(siteId: string) {
    return listSiteDomainsApi(siteId);
}

export async function claimDomain(
    siteId: string,
    hostname: string,
    orgId?: string,
) {
    return writeAsOrgIfSent(orgId, () => claimDomainApi(siteId, hostname));
}

export async function verifyDomain(domainId: string, orgId?: string) {
    return writeAsOrgIfSent(orgId, () => verifyDomainApi(domainId));
}

export async function removeDomain(domainId: string, orgId?: string) {
    return writeAsOrgIfSent(orgId, () => removeDomainApi(domainId));
}
