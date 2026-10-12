import { prisma, runInOrgContext } from "@saroh/database";

import { domainPlan } from "../billing/domain-plan.service";
import { rendererHost } from "./site-origin";

/**
 * The host a published site is primarily served at: its verified custom
 * domain when it has one (the oldest, as `siteOriginOf` picks), else its
 * Saroh address on the renderer's apex. Null when it has neither. A domain
 * its plan has paused (DEC-139) shows no site, so the Saroh address is the
 * primary one until the plan includes a domain again.
 *
 * One site answers on both. The renderer names this one as canonical on
 * every page, so search engines index one address, and lands a QR code's
 * short link here, so a customer signed in on the business's own domain
 * stays signed in. Never throws: a read that fails falls back to the Saroh
 * address, which always serves the site.
 */
export async function primaryHostOf(site: {
    id: string;
    organizationId: string;
    subdomain: string | null;
}): Promise<string | null> {
    const platform = site.subdomain
        ? `${site.subdomain}.${rendererHost()}`
        : null;
    try {
        const domain = await runInOrgContext(site.organizationId, () =>
            prisma.domain.findFirst({
                where: {
                    organizationId: site.organizationId,
                    siteId: site.id,
                    status: "VERIFIED",
                },
                orderBy: { verifiedAt: "asc" },
                select: { hostname: true },
            }),
        );
        const own = domain?.hostname.trim().toLowerCase() ?? "";
        if (own === "") return platform;
        return platform && (await domainPlan.paused(site.organizationId))
            ? platform
            : own;
    } catch {
        return platform;
    }
}
