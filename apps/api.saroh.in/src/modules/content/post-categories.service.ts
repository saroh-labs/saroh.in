import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { slugify } from "../stores/slug";
import { StoresService } from "../stores/stores.service";
import type { CreatePostCategoryDto, UpdatePostCategoryDto } from "./dto";

/**
 * Blog post categories — a flat list per store (no hierarchy, unlike product
 * Categories). Authorization delegates to StoresService. Deleting a category
 * detaches its posts (Post.categoryId is optional) rather than blocking.
 */
@Injectable()
export class PostCategoriesService {
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        return prisma.postCategory.findMany({
            where: { storeId },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                slug: true,
                _count: { select: { posts: true } },
            },
        });
    }

    async create(storeId: string, userId: string, dto: CreatePostCategoryDto) {
        await this.requireWrite(storeId, userId);
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        await this.assertSlugFree(storeId, slug);
        try {
            const category = await prisma.postCategory.create({
                data: { storeId, name: dto.name, slug },
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
        storeId: string,
        categoryId: string,
        userId: string,
        dto: UpdatePostCategoryDto,
    ) {
        await this.requireWrite(storeId, userId);
        const current = await prisma.postCategory.findFirst({
            where: { id: categoryId, storeId },
            select: { slug: true },
        });
        if (!current) {
            throw new NotFoundException("Category not found");
        }
        const slug = slugify(dto.slug);
        if (current.slug !== slug) await this.assertSlugFree(storeId, slug);
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
    async remove(storeId: string, categoryId: string, userId: string) {
        await this.requireWrite(storeId, userId);
        const category = await prisma.postCategory.findFirst({
            where: { id: categoryId, storeId },
            select: { id: true },
        });
        if (!category) {
            throw new NotFoundException("Category not found");
        }
        await prisma.$transaction([
            prisma.post.updateMany({
                where: { storeId, categoryId },
                data: { categoryId: null },
            }),
            prisma.postCategory.delete({ where: { id: categoryId } }),
        ]);
        return { id: categoryId };
    }

    private async requireWrite(storeId: string, userId: string): Promise<void> {
        if (!(await this.stores.canWrite(storeId, userId))) {
            throw new NotFoundException("Store not found");
        }
    }

    private async assertSlugFree(storeId: string, slug: string): Promise<void> {
        const existing = await prisma.postCategory.findUnique({
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
}
