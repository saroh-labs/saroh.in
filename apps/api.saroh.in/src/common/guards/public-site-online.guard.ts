import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { publicSiteOnline } from "../../modules/organizations/organization-lifecycle.policy";

interface PublicSiteRequest {
    params?: Record<string, string | undefined>;
    query?: Record<string, unknown>;
}

/**
 * A deleted business's website is offline (#921), and so is every public
 * read keyed by its site: the shop, services, plans, packs, checkout, posts,
 * head, footer and visits. On every `public/sites` controller (and the
 * services one, which takes the site in its query); a source scan in
 * `organization-lifecycle.policy.spec.ts` checks none is left without it.
 *
 * It answers only for a site it finds: a route with no `siteId`, or an id
 * no site has, passes through to the handler, whose own 404 stands. A site
 * whose business is offline is a 404, as if it had never been published.
 * Read on every call, never cached, like the lifecycle gate.
 */
@Injectable()
export class PublicSiteOnlineGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<PublicSiteRequest>();
        const siteId = request.params?.siteId ?? request.query?.siteId;
        if (typeof siteId !== "string" || siteId.length === 0) return true;
        const site = await prisma.site.findUnique({
            where: { id: siteId },
            select: { organization: { select: { lifecycleStatus: true } } },
        });
        if (site && !publicSiteOnline(site.organization.lifecycleStatus)) {
            throw new NotFoundException("No published site found");
        }
        return true;
    }
}
