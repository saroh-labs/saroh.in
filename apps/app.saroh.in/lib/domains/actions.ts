"use server";

import {
    claimDomain as claimDomainApi,
    listSiteDomains as listSiteDomainsApi,
    removeDomain as removeDomainApi,
    verifyDomain as verifyDomainApi,
} from "./service";

/**
 * Server actions for a site's own domain (#200). Thin: the api authorizes
 * `domain:manage` and the plan's `customDomain` entitlement; these only carry
 * the session.
 */

export async function listSiteDomains(siteId: string) {
    return listSiteDomainsApi(siteId);
}

export async function claimDomain(siteId: string, hostname: string) {
    return claimDomainApi(siteId, hostname);
}

export async function verifyDomain(domainId: string) {
    return verifyDomainApi(domainId);
}

export async function removeDomain(domainId: string) {
    return removeDomainApi(domainId);
}
