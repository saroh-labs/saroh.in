import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { slugify } from "../stores/slug";
import { StoresService } from "../stores/stores.service";
import type { CreatePostDto, PostStatus, UpdatePostDto } from "./dto";

/**
 * Blog posts for a store's storefront. Authorization delegates to
 * StoresService (read = store access, write = canWrite). Slugs are unique per
 * store. A post's author is the caller's StoreMembers row when they have one;
 * a store owner is not a member, so owner-authored posts have a null author
 * (Post.authorId is optional). publishedAt is stamped the first time a post
 * goes PUBLISHED and preserved thereafter.
 */
@Injectable()
export class PostsService {
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        const posts = await prisma.post.findMany({
            where: { storeId },
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
                author: { select: { user: { select: { name: true } } } },
            },
        });
        return posts.map(({ author, ...p }) => ({
            ...p,
            author: author?.user.name ?? null,
        }));
    }

    async get(storeId: string, postId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        const post = await prisma.post.findFirst({
            where: { id: postId, storeId },
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
                author: { select: { user: { select: { name: true } } } },
            },
        });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        const { author, ...rest } = post;
        return { ...rest, author: author?.user.name ?? null };
    }

    async create(storeId: string, userId: string, dto: CreatePostDto) {
        await this.requireWrite(storeId, userId);
        const slug = slugify(dto.slug ?? dto.title);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the title",
                field: "slug",
            });
        }
        await this.assertSlugFree(storeId, slug);
        if (dto.categoryId) {
            await this.assertCategoryInStore(storeId, dto.categoryId);
        }

        const status = dto.status ?? "DRAFT";
        const authorId = await this.resolveAuthor(storeId, userId);

        try {
            const post = await prisma.post.create({
                data: {
                    storeId,
                    title: dto.title,
                    slug,
                    excerpt: dto.excerpt ?? null,
                    content: dto.content ?? "",
                    categoryId: dto.categoryId ?? null,
                    featured: dto.featured ?? false,
                    image: dto.image ?? null,
                    status,
                    publishedAt: status === "PUBLISHED" ? new Date() : null,
                    authorId,
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
        storeId: string,
        postId: string,
        userId: string,
        dto: UpdatePostDto,
    ) {
        await this.requireWrite(storeId, userId);
        const current = await prisma.post.findFirst({
            where: { id: postId, storeId },
            select: { slug: true, status: true, publishedAt: true },
        });
        if (!current) {
            throw new NotFoundException("Post not found");
        }

        const slug = slugify(dto.slug);
        if (current.slug !== slug) await this.assertSlugFree(storeId, slug);
        if (dto.categoryId) {
            await this.assertCategoryInStore(storeId, dto.categoryId);
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

    async remove(storeId: string, postId: string, userId: string) {
        await this.requireWrite(storeId, userId);
        const post = await prisma.post.findFirst({
            where: { id: postId, storeId },
            select: { id: true },
        });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        // Comments cascade-delete via Comment.post onDelete: Cascade.
        await prisma.post.delete({ where: { id: postId } });
        return { id: postId };
    }

    /** The caller's StoreMembers row id, or null if they're an owner (no row). */
    private async resolveAuthor(
        storeId: string,
        userId: string,
    ): Promise<string | null> {
        const member = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId } },
            select: { id: true },
        });
        return member?.id ?? null;
    }

    private async requireWrite(storeId: string, userId: string): Promise<void> {
        if (!(await this.stores.canWrite(storeId, userId))) {
            throw new NotFoundException("Store not found");
        }
    }

    private async assertSlugFree(storeId: string, slug: string): Promise<void> {
        const existing = await prisma.post.findUnique({
            where: { storeId_slug: { storeId, slug } },
            select: { id: true },
        });
        if (existing) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    private async assertCategoryInStore(
        storeId: string,
        categoryId: string,
    ): Promise<void> {
        const category = await prisma.postCategory.findFirst({
            where: { id: categoryId, storeId },
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
