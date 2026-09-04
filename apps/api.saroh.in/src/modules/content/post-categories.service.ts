import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { slugify } from "../stores/slug";
import type { CreatePostCategoryDto, UpdatePostCategoryDto } from "./dto";

/**
 * Post categories — a flat list per SITE (ADR-004, #209), no hierarchy, unlike
 * product Categories. Authorization is the site's, like the posts they group.
 * Deleting a category detaches its posts (Post.categoryId is optional) rather
 * than blocking.
 */
@Injectable()
export class PostCategoriesService {
    async list(ctx: OrganizationContext, siteId: string) {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);
        return prisma.postCategory.findMany({
            where: { siteId },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                slug: true,
                _count: { select: { posts: true } },
            },
        });
    }

    async create(
        ctx: OrganizationContext,
        siteId: string,
        dto: CreatePostCategoryDto,
    ) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        await this.assertSlugFree(siteId, slug);
        try {
            const category = await prisma.postCategory.create({
                data: { siteId, name: dto.name, slug },
            });
            return { id: category.id };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    async update(
        ctx: OrganizationContext,
        siteId: string,
        categoryId: string,
        dto: UpdatePostCategoryDto,
    ) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const current = await prisma.postCategory.findFirst({
            where: { id: categoryId, siteId },
            select: { slug: true },
        });
        if (!current) {
            throw new NotFoundException("Category not found");
        }
        const slug = slugify(dto.slug);
        if (current.slug !== slug) await this.assertSlugFree(siteId, slug);
        try {
            await prisma.postCategory.update({
                where: { id: categoryId },
                data: { name: dto.name, slug },
            });
            return { id: categoryId };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** Delete a category; its posts are detached (categoryId set null). */
    async remove(ctx: OrganizationContext, siteId: string, categoryId: string) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const category = await prisma.postCategory.findFirst({
            where: { id: categoryId, siteId },
            select: { id: true },
        });
        if (!category) {
            throw new NotFoundException("Category not found");
        }
        await prisma.$transaction([
            prisma.post.updateMany({
                where: { siteId, categoryId },
                data: { categoryId: null },
            }),
            prisma.postCategory.delete({ where: { id: categoryId } }),
        ]);
        return { id: categoryId };
    }

    /** Prove the site belongs to the ctx org, or 404. */
    private async assertSiteInOrg(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<void> {
        const site = await prisma.site.findFirst({
            where: {
                id: siteId,
                organizationId: ctx.organizationId,
                deletedAt: null,
            },
            select: { id: true },
        });
        if (!site) {
            throw new NotFoundException(`Site "${siteId}" not found`);
        }
    }

    private async assertSlugFree(siteId: string, slug: string): Promise<void> {
        const existing = await prisma.postCategory.findUnique({
            where: { siteId_slug: { siteId, slug } },
            select: { id: true },
        });
        if (existing) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }
}
