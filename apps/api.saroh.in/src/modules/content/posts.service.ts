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
import type { CreatePostDto, PostStatus, UpdatePostDto } from "./dto";

/**
 * A site's writing (ADR-004, #209).
 *
 * Posts used to hang off a Store, so a business with a website and no shop
 * could not write at all. They belong to the SITE they are published on, and
 * authorization is the site's: `site:read` to read, `section:write` to write —
 * the same rules as the pages a post sits beside, rather than a second set
 * reached through StoresService.
 *
 * Slugs are unique per site. The author is the User who wrote it. `publishedAt`
 * is stamped the first time a post goes PUBLISHED and preserved thereafter;
 * publishing to the public reads through a snapshot and is not built yet
 * (ADR-004 §3).
 */
@Injectable()
export class PostsService {
    async list(ctx: OrganizationContext, siteId: string) {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);
        const posts = await prisma.post.findMany({
            where: { siteId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                status: true,
                featured: true,
                image: true,
                publishedAt: true,
                createdAt: true,
                category: { select: { id: true, name: true } },
                author: { select: { name: true } },
            },
        });
        return posts.map(({ author, ...p }) => ({
            ...p,
            author: author?.name ?? null,
        }));
    }

    async get(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "site:read");
        await this.assertSiteInOrg(ctx, siteId);
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: {
                id: true,
                title: true,
                slug: true,
                excerpt: true,
                content: true,
                categoryId: true,
                featured: true,
                image: true,
                status: true,
                publishedAt: true,
                createdAt: true,
                author: { select: { name: true } },
            },
        });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        const { author, ...rest } = post;
        return { ...rest, author: author?.name ?? null };
    }

    async create(ctx: OrganizationContext, siteId: string, dto: CreatePostDto) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const slug = slugify(dto.slug ?? dto.title);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the title",
                field: "slug",
            });
        }
        await this.assertSlugFree(siteId, slug);
        if (dto.categoryId) {
            await this.assertCategoryOnSite(siteId, dto.categoryId);
        }

        const status = dto.status ?? "DRAFT";

        try {
            const post = await prisma.post.create({
                data: {
                    siteId,
                    title: dto.title,
                    slug,
                    excerpt: dto.excerpt ?? null,
                    content: dto.content ?? "",
                    categoryId: dto.categoryId ?? null,
                    featured: dto.featured ?? false,
                    image: dto.image ?? null,
                    status,
                    publishedAt: status === "PUBLISHED" ? new Date() : null,
                    authorId: ctx.userId,
                },
            });
            return { id: post.id };
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
        postId: string,
        dto: UpdatePostDto,
    ) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const current = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { slug: true, status: true, publishedAt: true },
        });
        if (!current) {
            throw new NotFoundException("Post not found");
        }

        const slug = slugify(dto.slug);
        if (current.slug !== slug) await this.assertSlugFree(siteId, slug);
        if (dto.categoryId) {
            await this.assertCategoryOnSite(siteId, dto.categoryId);
        }

        const status: PostStatus = dto.status ?? (current.status as PostStatus);

        try {
            await prisma.post.update({
                where: { id: postId },
                data: {
                    title: dto.title,
                    slug,
                    excerpt: dto.excerpt ?? null,
                    content: dto.content ?? "",
                    categoryId: dto.categoryId ?? null,
                    featured: dto.featured ?? false,
                    image: dto.image ?? null,
                    status,
                    // Stamp publishedAt on the first PUBLISHED; keep it after.
                    publishedAt:
                        status === "PUBLISHED"
                            ? (current.publishedAt ?? new Date())
                            : current.publishedAt,
                },
            });
            return { id: postId };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    async remove(ctx: OrganizationContext, siteId: string, postId: string) {
        authorize(ctx, "section:write");
        await this.assertSiteInOrg(ctx, siteId);
        const post = await prisma.post.findFirst({
            where: { id: postId, siteId },
            select: { id: true },
        });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        // Comments cascade-delete via Comment.post onDelete: Cascade.
        await prisma.post.delete({ where: { id: postId } });
        return { id: postId };
    }

    /**
     * Prove the site belongs to the ctx org, or 404 — a 404 rather than a 403
     * so a caller cannot probe which sites exist in another organization.
     */
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
        const existing = await prisma.post.findUnique({
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

    private async assertCategoryOnSite(
        siteId: string,
        categoryId: string,
    ): Promise<void> {
        const category = await prisma.postCategory.findFirst({
            where: { id: categoryId, siteId },
            select: { id: true },
        });
        if (!category) {
            throw new BadRequestException({
                message: "Unknown category",
                field: "categoryId",
            });
        }
    }
}
