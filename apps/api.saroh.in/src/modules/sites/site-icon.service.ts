import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { MediaService } from "../media/media.service";
import { authorize } from "../organizations/organization-policy";
import { assertSiteInOrg } from "./site-access";
import type { SiteIconView } from "./site-icon";
import { siteIconProblem, siteIconView } from "./site-icon";

/** What a save of the icon answers. */
export interface SiteIconSaved {
    id: string;
    icon: SiteIconView;
}

/**
 * Setting and removing a site's own icon (DEC-121), in Website › Settings.
 *
 * `site:update`, as the rest of Search and sharing. Draft state, like the
 * share image: the write does not publish, so the live site keeps the icon
 * it has until the next publish, which is also what tells the page cache
 * (`putLive`). The business comes from the request's context, and the image
 * must be one that business uploaded to its library.
 */
@Injectable()
export class SiteIconService {
    constructor(private readonly media: MediaService) {}

    /**
     * Set or replace the icon with a library object: READY, this business's,
     * and an icon's type and size ({@link siteIconProblem}). Its address is
     * taken now, as the business logo's is. Replacing leaves the old image
     * in the library.
     */
    async set(
        ctx: OrganizationContext,
        siteId: string,
        mediaId: string,
    ): Promise<SiteIconSaved> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);
        const media = await this.media.readyObject(ctx.organizationId, mediaId);
        const problem = siteIconProblem(media);
        if (problem) {
            throw new BadRequestException({
                message: problem,
                details: { field: "icon" },
            });
        }
        if (!media.url) {
            throw new BadRequestException({
                message:
                    "Uploaded, but storage is not set up to serve images yet, so the icon cannot show.",
                details: { field: "icon" },
            });
        }
        return this.write(ctx, siteId, {
            iconMediaId: media.id,
            iconUrl: media.url,
        });
    }

    /**
     * Take the site's own icon off. The image stays in the library; from the
     * next publish the site shows the business logo, or the plain tile.
     */
    async remove(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<SiteIconSaved> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);
        return this.write(ctx, siteId, { iconMediaId: null, iconUrl: null });
    }

    private async write(
        ctx: OrganizationContext,
        siteId: string,
        data: { iconMediaId: string | null; iconUrl: string | null },
    ): Promise<SiteIconSaved> {
        // Scoped again on the write: the business is the context's.
        await prisma.site.updateMany({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            data,
        });
        return {
            id: siteId,
            icon: await siteIconView(ctx.organizationId, data),
        };
    }
}
