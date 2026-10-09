import { prisma } from "@saroh/database";

import { hostingView } from "../domains/domain-hosting-sync";
import { domainHostingOn } from "../domains/domain-hosting.provider";
import { platformOrigin } from "../sites/site-origin";

const SITE_ROWS = 50;

/** One web address a business's site answers on, as an origin. */
export interface PresenceAddress {
    /** Its web address on the renderer, or its own domain. */
    kind: "web-address" | "own-domain";
    url: string;
}

/** One of a business's sites, as its customers can reach it. */
export interface PresenceSite {
    id: string;
    name: string;
    /** Whether a publication is live on it. */
    published: boolean;
    /** Where it is live: empty while nothing is published. */
    addresses: PresenceAddress[];
}

/** A payment provider connection, in yes-or-no terms. Never a key. */
export interface PresencePayment {
    /** "RAZORPAY" | "CASHFREE". */
    provider: string;
    connected: boolean;
    /** The provider refused its keys on a live call (UX-012). */
    needsAttention: boolean;
}

/** What the business's customers can reach, for "What they see" (9 Oct). */
export interface OrganizationPresence {
    sites: PresenceSite[];
    payments: PresencePayment[];
}

interface SiteRecord {
    id: string;
    name: string;
    subdomain: string | null;
    currentPublicationId: string | null;
}

interface DomainRecord {
    hostname: string;
    siteId: string | null;
    status: string;
    hostingStatus: string | null;
    hostingError: string | null;
    hostingCheckedAt: Date | null;
}

interface ProviderRecord {
    provider: string;
    status: string;
    attentionReason: string | null;
}

/**
 * CROSS-TENANT READ, behind the business page's support session: where each
 * of one business's sites is live, and whether a payment provider is
 * connected. Reads no credential column: a provider comes back as its name
 * and two yes-or-no answers.
 *
 * A site's addresses are the ones `siteOriginOf` builds on (the renderer's
 * web address for its subdomain) plus each own domain the domains module's
 * `hostingView` calls LIVE (#859), so the page never shows a domain as live
 * that the workspace's domain screen doesn't.
 */
export async function organizationPresence(
    organizationId: string,
    hostingOn: boolean = domainHostingOn(),
): Promise<OrganizationPresence> {
    const [sites, domains, providers] = await Promise.all([
        prisma.site.findMany({
            where: { organizationId, deletedAt: null },
            select: {
                id: true,
                name: true,
                subdomain: true,
                currentPublicationId: true,
            },
            orderBy: { createdAt: "asc" },
            take: SITE_ROWS,
        }),
        prisma.domain.findMany({
            where: { organizationId, status: "VERIFIED" },
            select: {
                hostname: true,
                siteId: true,
                status: true,
                hostingStatus: true,
                hostingError: true,
                hostingCheckedAt: true,
            },
            orderBy: { verifiedAt: "asc" },
        }),
        prisma.merchantPaymentProvider.findMany({
            where: { organizationId },
            select: { provider: true, status: true, attentionReason: true },
            orderBy: { createdAt: "asc" },
        }),
    ]);
    return presenceOf({ sites, domains, providers, hostingOn });
}

/** The presence from its rows. Pure, so the words around it can be tested. */
export function presenceOf(input: {
    sites: SiteRecord[];
    domains: DomainRecord[];
    providers: ProviderRecord[];
    hostingOn: boolean;
}): OrganizationPresence {
    return {
        sites: input.sites.map((site) => {
            const published = site.currentPublicationId !== null;
            const own = input.domains
                .filter(
                    (domain) =>
                        domain.siteId === site.id &&
                        hostingView(domain, input.hostingOn).state === "LIVE",
                )
                .map((domain): PresenceAddress => ({
                    kind: "own-domain",
                    url: `https://${domain.hostname}`,
                }));
            const web: PresenceAddress[] = site.subdomain
                ? [{ kind: "web-address", url: platformOrigin(site.subdomain) }]
                : [];
            return {
                id: site.id,
                name: site.name,
                published,
                addresses: published ? [...own, ...web] : [],
            };
        }),
        payments: input.providers.map((row) => ({
            provider: row.provider,
            connected: row.status === "CONNECTED",
            needsAttention: row.attentionReason !== null,
        })),
    };
}
