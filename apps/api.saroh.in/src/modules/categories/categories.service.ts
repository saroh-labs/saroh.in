import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { slugify } from "../stores/slug";
import { StoresService } from "../stores/stores.service";
import type { CreateCategoryDto, UpdateCategoryDto } from "./dto";

/**
 * Product categories with a parent/child hierarchy. Authorization delegates to
 * StoresService (read = store access, write = canWrite). Cycles are rejected on
 * update; a category with children can't be deleted.
 */
@Injectable()
export class CategoriesService {
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        return prisma.category.findMany({
            where: { storeId },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                slug: true,
                parentId: true,
                _count: { select: { products: true, children: true } },
            },
        });
    }

    async create(storeId: string, userId: string, dto: CreateCategoryDto) {
        await this.requireWrite(storeId, userId);
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        await this.assertSlugFree(storeId, slug);
        if (dto.parentId) await this.assertParentInStore(storeId, dto.parentId);

        try {
            const category = await prisma.category.create({
                data: {
                    storeId,
                    name: dto.name,
                    slug,
                    parentId: dto.parentId || null,
                },
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
        dto: UpdateCategoryDto,
    ) {
        await this.requireWrite(storeId, userId);
        const current = await prisma.category.findFirst({
            where: { id: categoryId, storeId },
            select: { slug: true },
        });
        if (!current) {
            throw new NotFoundException("Category not found");
        }
        const slug = slugify(dto.slug);
        if (current.slug !== slug) await this.assertSlugFree(storeId, slug);

        const parentId = dto.parentId ?? null;
        if (parentId) {
            if (parentId === categoryId) {
                throw new BadRequestException({
                    message: "A category can't be its own parent",
                    field: "parentId",
                });
            }
            await this.assertParentInStore(storeId, parentId);
            await this.assertNoCycle(storeId, categoryId, parentId);
        }

        try {
            await prisma.category.update({
                where: { id: categoryId },
                data: { name: dto.name, slug, parentId },
            });
            return { id: categoryId };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** Delete a category. Blocked if it has children; products are detached. */
    async remove(storeId: string, categoryId: string, userId: string) {
        await this.requireWrite(storeId, userId);
        const category = await prisma.category.findFirst({
            where: { id: categoryId, storeId },
            select: { _count: { select: { children: true } } },
        });
        if (!category) {
            throw new NotFoundException("Category not found");
        }
        if (category._count.children > 0) {
            throw new ConflictException(
                "Move or delete the sub-categories first",
            );
        }
        // Detach products, then delete (Product.categoryId is optional).
        await prisma.$transaction([
            prisma.product.updateMany({
                where: { storeId, categoryId },
                data: { categoryId: null },
            }),
            prisma.category.delete({ where: { id: categoryId } }),
        ]);
        return { id: categoryId };
    }

    private async requireWrite(storeId: string, userId: string): Promise<void> {
        if (!(await this.stores.canWrite(storeId, userId))) {
            throw new NotFoundException("Store not found");
        }
    }

    private async assertSlugFree(storeId: string, slug: string): Promise<void> {
        const existing = await prisma.category.findUnique({
            where: { storeId_slug: { storeId, slug } },
        });
        if (existing) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    private async assertParentInStore(
        storeId: string,
        parentId: string,
    ): Promise<void> {
        const parent = await prisma.category.findFirst({
            where: { id: parentId, storeId },
            select: { id: true },
        });
        if (!parent) {
            throw new BadRequestException({
                message: "Unknown parent category",
                field: "parentId",
            });
        }
    }

    /** Walk up from the proposed parent; if we reach `categoryId`, it's a cycle. */
    private async assertNoCycle(
        storeId: string,
        categoryId: string,
        parentId: string,
    ): Promise<void> {
        let cursor: string | null = parentId;
        const seen = new Set<string>();
        while (cursor) {
            if (cursor === categoryId) {
                throw new BadRequestException({
                    message: "That move would create a category loop",
                    field: "parentId",
                });
            }
            if (seen.has(cursor)) break; // pre-existing loop guard
            seen.add(cursor);
            const node: { parentId: string | null } | null =
                await prisma.category.findFirst({
                    where: { id: cursor, storeId },
                    select: { parentId: true },
                });
            cursor = node?.parentId ?? null;
        }
    }
}
