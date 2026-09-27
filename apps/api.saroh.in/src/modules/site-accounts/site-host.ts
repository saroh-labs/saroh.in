import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

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
 * HOOK — the business's public phone, for "Or call ‹Business› on ‹phone›"
 * when a code can't be sent (default 113).
 *
 * No such field exists yet: `BusinessProfile`, `Store` and `StoreSettings`
 * carry no phone, and the plans name "the business profile's public phone"
 * (plan G, G8) without a unit that adds it. Until a follow-up unit adds
 * the field and reads it here, this answers null and the sheet shows the
 * try-again line alone. Nothing else should guess a number.
 */
export function businessPublicPhone(_site: SiteHost): Promise<string | null> {
    return Promise.resolve(null);
}
