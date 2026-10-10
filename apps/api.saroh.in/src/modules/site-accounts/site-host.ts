import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { businessPublicPhoneOf } from "../organizations/business-phone";
import { SITE_ONLINE_ORGANIZATION } from "../organizations/organization-lifecycle.policy";
import { siteHostMode } from "../sites/site-host-mode";
import { normaliseHost } from "./site-relay";

/**
 * The published site, and so the business, a relayed host belongs to
 * (round-2 plan A, A2). The organization always comes from here, never from
 * the request (`backend-auth-and-access.md`).
 *
 * The lookup is the renderer's own (`apps/saroh.app/lib/publication.ts`,
 * `getPublicationForHost`): a VERIFIED custom hostname bound to a site
 * first, then the host's first label as a platform subdomain, so the API
 * answers for exactly the site the visitor was shown. Only a live site with
 * a current publication counts; anything else is a 404.
 */
export interface SiteHost {
    siteId: string;
    organizationId: string;
    host: string;
    businessName: string;
    /** When the business was created: a new business gets lower ceilings. */
    businessCreatedAt: Date;
}

function subdomainOf(host: string): string | null {
    const labels = host.split(".");
    if (labels.length <= 1) return null;
    const first = labels[0];
    if (!first || first === "www") return null;
    return first;
}

function notFound(): never {
    throw new NotFoundException("No published site at this address");
}

export async function resolveSiteHost(rawHost: string): Promise<SiteHost> {
    const host = normaliseHost(rawHost);
    // A test release's host is never a live site's (DEC-071, KTD-7): nothing
    // relayed from it signs anyone in or reaches an account.
    if ((await siteHostMode(host)).mode === "test") notFound();
    const domain = await prisma.domain.findUnique({
        where: { hostname: host },
        select: { status: true, siteId: true },
    });
    let where: Prisma.SiteWhereInput;
    if (domain?.status === "VERIFIED" && domain.siteId) {
        where = { id: domain.siteId };
    } else {
        const subdomain = subdomainOf(host);
        if (!subdomain) notFound();
        where = { subdomain };
    }
    const site = await prisma.site.findFirst({
        where: {
            ...where,
            deletedAt: null,
            currentPublicationId: { not: null },
            // Offline with its business (#921): nobody signs in to it.
            organization: SITE_ONLINE_ORGANIZATION,
        },
        select: {
            id: true,
            organizationId: true,
            organization: { select: { name: true, createdAt: true } },
        },
    });
    if (!site) notFound();
    return {
        siteId: site.id,
        organizationId: site.organizationId,
        host,
        businessName: site.organization.name,
        businessCreatedAt: site.organization.createdAt,
    };
}

/**
 * The business's public phone, for "Or call ‹Business› on ‹phone›" when a
 * code can't be sent (default 113), in E.164; null when the business has set
 * none (DEC-053), and the sheet then shows the try-again line alone.
 *
 * Read from the site's own business, which the host resolved — never a
 * number taken from anywhere else (a Contact block, a member), which would
 * publish something the merchant never offered here. Read live on each
 * call, so a number removed in Settings › Business stops showing at once.
 * Runs inside the caller's `runInOrgContext`.
 */
export function businessPublicPhone(site: SiteHost): Promise<string | null> {
    return businessPublicPhoneOf(site.organizationId);
}
