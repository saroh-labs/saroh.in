import { NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { domainPlan } from "../billing/domain-plan.service";
import { publicSiteOnline } from "../organizations/organization-lifecycle.policy";
import { platformOrigin } from "./site-origin";

/**
 * What a paused domain answers (DEC-139).
 *
 * A business's own domain whose plan no longer includes one, 3 days after
 * that plan ended, stops showing the site. The lookup of its host
 * (`GET public/sites/by-hostname/:hostname`) then answers the 404 it gives
 * any host with no site, and adds where the site is:
 *
 *     { error: { statusCode: 404, details: { reason: "domain-paused", to } } }
 *
 * `to` is the site's Saroh address as an origin (`https://yourshop.saroh.app`).
 * The renderer sends the visitor to the same path there with a temporary
 * redirect, as it does for an old address that forwards (`site-moved.ts`).
 * Nothing but that origin is said: the visitor could follow the redirect
 * anyway, and no plan, limit or name of Saroh's is in it.
 *
 * Nothing is stored and nothing is removed: the `Domain` row stays
 * VERIFIED and its hostname stays with the host, so the moment the plan
 * includes a domain again this read serves the site as before.
 */

/** `details.reason` of the 404 a paused domain's host answers. */
export const DOMAIN_PAUSED_REASON = "domain-paused";

/**
 * The 404 for a verified domain that is paused now, or null when it isn't
 * (the usual case: nothing enforced, or a plan that includes a domain).
 * Null too when the site has no Saroh address to send a visitor to, is
 * deleted, or is offline with its business: there is nowhere to send
 * anyone, and the caller's own lookup says what a visitor should see.
 */
export async function domainPausedHere(domain: {
    organizationId: string;
    siteId: string;
}): Promise<NotFoundException | null> {
    if (!(await domainPlan.paused(domain.organizationId))) return null;
    const site = await runInOrgContext(domain.organizationId, () =>
        prisma.site.findFirst({
            where: {
                id: domain.siteId,
                organizationId: domain.organizationId,
                deletedAt: null,
            },
            select: {
                subdomain: true,
                organization: { select: { lifecycleStatus: true } },
            },
        }),
    );
    if (!site?.subdomain) return null;
    if (!publicSiteOnline(site.organization.lifecycleStatus)) return null;
    return new NotFoundException({
        message: "This domain isn't showing a site right now",
        details: {
            reason: DOMAIN_PAUSED_REASON,
            to: platformOrigin(site.subdomain),
        },
    });
}
