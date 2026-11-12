import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { MediaService } from "../media/media.service";
import { authorize } from "../organizations/organization-policy";
import type { ShareSize, ShareStyle } from "./cards/card-model";
import type { SharePostInputDto } from "./dto";

/**
 * A business's own posts (#1378, plan 2026-11-12-003 U6): Create post's
 * "Your own post", a headline, its own photo or both, saved so the site
 * can draw its picture (`/public/share/own/<id>/image`).
 *
 * Who may: whoever may edit the website (`section:write`, Owner and Admin),
 * under the Website module, as the editor is. The words are the
 * merchant's: capped here and in the database, and only ever drawn as text.
 */

export interface SharePostView {
    id: string;
    headline: string | null;
    mediaId: string | null;
    style: ShareStyle;
    size: ShareSize;
    caption: string;
    linkPath: string;
    /** The picture's address on the API, for the share sheet. */
    imagePath: string;
    createdAt: string;
    updatedAt: string;
}

/** A bound on one business's list, not a plan limit. */
export const SHARE_POSTS_LISTED = 200;

const SELECT = {
    id: true,
    headline: true,
    mediaId: true,
    style: true,
    size: true,
    caption: true,
    linkPath: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.SharePostSelect;

type Row = Prisma.SharePostGetPayload<{ select: typeof SELECT }>;

function view(row: Row): SharePostView {
    return {
        ...row,
        style: row.style as ShareStyle,
        size: row.size as ShareSize,
        imagePath: `/public/share/own/${row.id}/image`,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

const notFound = () => new NotFoundException("That post isn't here");

@Injectable()
export class SharePostsService {
    constructor(private readonly media: MediaService) {}

    async list(ctx: OrganizationContext): Promise<SharePostView[]> {
        authorize(ctx, "section:write");
        const rows = await prisma.sharePost.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: SHARE_POSTS_LISTED,
            select: SELECT,
        });
        return rows.map(view);
    }

    async get(ctx: OrganizationContext, id: string): Promise<SharePostView> {
        authorize(ctx, "section:write");
        return view(await this.row(ctx, id));
    }

    async create(
        ctx: OrganizationContext,
        dto: SharePostInputDto,
    ): Promise<SharePostView> {
        authorize(ctx, "section:write");
        const data = await this.checked(ctx, dto, null);
        const row = await prisma.sharePost.create({
            data: {
                organizationId: ctx.organizationId,
                createdByUserId: ctx.userId,
                ...data,
            },
            select: SELECT,
        });
        return view(row);
    }

    /** Only what is sent changes. */
    async update(
        ctx: OrganizationContext,
        id: string,
        dto: SharePostInputDto,
    ): Promise<SharePostView> {
        authorize(ctx, "section:write");
        const current = await this.row(ctx, id);
        const data = await this.checked(ctx, dto, current);
        const updated = await prisma.sharePost.updateMany({
            where: { id, organizationId: ctx.organizationId },
            data,
        });
        if (updated.count === 0) throw notFound();
        return view(await this.row(ctx, id));
    }

    async remove(ctx: OrganizationContext, id: string): Promise<void> {
        authorize(ctx, "section:write");
        const removed = await prisma.sharePost.deleteMany({
            where: { id, organizationId: ctx.organizationId },
        });
        if (removed.count === 0) throw notFound();
    }

    /** Another business's post is a 404, as one that doesn't exist. */
    private async row(ctx: OrganizationContext, id: string): Promise<Row> {
        const row = await prisma.sharePost.findFirst({
            where: { id, organizationId: ctx.organizationId },
            select: SELECT,
        });
        if (!row) throw notFound();
        return row;
    }

    /**
     * What to write: the photo must be the business's own and finished
     * uploading, and the post must keep a headline or a photo, or its
     * picture would be blank.
     */
    private async checked(
        ctx: OrganizationContext,
        dto: SharePostInputDto,
        current: Row | null,
    ) {
        if (dto.mediaId) {
            await this.media.readyObject(ctx.organizationId, dto.mediaId);
        }
        const headline =
            dto.headline === undefined ? current?.headline : dto.headline;
        const mediaId =
            dto.mediaId === undefined ? current?.mediaId : dto.mediaId;
        if (!headline && !mediaId) {
            throw new BadRequestException("Add a headline or a photo");
        }
        return {
            ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
            ...(dto.mediaId !== undefined ? { mediaId: dto.mediaId } : {}),
            ...(dto.style ? { style: dto.style } : {}),
            ...(dto.size ? { size: dto.size } : {}),
            ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
            ...(dto.linkPath ? { linkPath: dto.linkPath } : {}),
        };
    }
}
