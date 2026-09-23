import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { slugify } from "../stores/slug";
import { StoresService } from "../stores/stores.service";
import type {
    CreateCategoryDto,
    MergeCategoryDto,
    RenameCategoryDto,
    RestoreCategoryDto,
    UpdateCategoryDto,
} from "./dto";

/**
 * What a merge or delete changed, handed back so Undo can reverse exactly
 * that: the category as it was, where its products went, and which ones.
 */
export interface CategoryRemoval {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    /** The category the products moved to; null = Uncategorized. */
    movedTo: string | null;
    productIds: string[];
    /** Its own defaults, which went with it; null when it had none. */
    defaults: CategoryDefaultsSnapshot | null;
    /** Custom fields that were shown for it; their links went with it. */
    fieldIds: string[];
}

export interface CategoryDefaultsSnapshot {
    howToUse: string | null;
    lowStockAlert: number | null;
    returnsMode: string | null;
    returnsText: string | null;
}

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
        const organizationId = await this.requireWrite(storeId, userId);
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        // The name first: "already a category called Serums" is the answer a
        // merchant can act on; a clashing address follows from it.
        await this.assertNameFree(storeId, dto.name);
        await this.assertSlugFree(storeId, slug);
        if (dto.parentId) await this.assertParentInStore(storeId, dto.parentId);

        try {
            const category = await prisma.category.create({
                data: {
                    storeId,
                    organizationId,
                    name: dto.name,
                    slug,
                    parentId: dto.parentId ?? null,
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

    /**
     * Rename in place. Products in it change with it; the slug stays, so
     * nothing that links to the category breaks. A name another category
     * already has (in any case) is refused — that is what Merge is for.
     */
    async rename(
        storeId: string,
        categoryId: string,
        userId: string,
        dto: RenameCategoryDto,
    ): Promise<{ id: string; name: string; previousName: string }> {
        await this.requireWrite(storeId, userId);
        const current = await this.requireCategory(storeId, categoryId);
        await this.assertNameFree(storeId, dto.name, categoryId);
        await prisma.category.update({
            where: { id: categoryId },
            data: { name: dto.name },
        });
        return { id: categoryId, name: dto.name, previousName: current.name };
    }

    /**
     * Move every product to another category (or Uncategorized) and remove
     * this one. Returns what moved, for Undo.
     */
    async merge(
        storeId: string,
        categoryId: string,
        userId: string,
        dto: MergeCategoryDto,
    ): Promise<CategoryRemoval> {
        await this.requireWrite(storeId, userId);
        const intoId = dto.intoId ?? null;
        if (intoId === categoryId) {
            throw new BadRequestException({
                message: "Pick another category to merge into.",
                field: "intoId",
            });
        }
        if (intoId) await this.requireCategory(storeId, intoId);
        return this.removeInto(storeId, categoryId, intoId);
    }

    /** Delete a category; its products move to Uncategorized, untouched. */
    async remove(
        storeId: string,
        categoryId: string,
        userId: string,
    ): Promise<CategoryRemoval> {
        await this.requireWrite(storeId, userId);
        return this.removeInto(storeId, categoryId, null);
    }

    /**
     * Undo a merge or delete: recreate the category with its name and
     * address, and move back the products that moved — only those still in
     * the place the change put them, so a later edit is never overwritten.
     */
    async restore(
        storeId: string,
        userId: string,
        dto: RestoreCategoryDto,
    ): Promise<{ id: string; moved: number }> {
        const organizationId = await this.requireWrite(storeId, userId);
        await this.assertNameFree(storeId, dto.name);
        await this.assertSlugFree(storeId, dto.slug);
        if (dto.parentId) await this.assertParentInStore(storeId, dto.parentId);
        return prisma.$transaction(async (tx) => {
            const category = await tx.category.create({
                data: {
                    storeId,
                    organizationId,
                    name: dto.name,
                    slug: dto.slug,
                    parentId: dto.parentId ?? null,
                },
            });
            // The custom fields shown for it, where each still exists here.
            if (dto.fieldIds && dto.fieldIds.length > 0) {
                const fields = await tx.productField.findMany({
                    where: {
                        storeId,
                        deletedAt: null,
                        id: { in: dto.fieldIds },
                    },
                    select: { id: true },
                });
                await tx.productFieldCategory.createMany({
                    data: fields.map((f) => ({
                        fieldId: f.id,
                        categoryId: category.id,
                    })),
                    skipDuplicates: true,
                });
            }
            if (dto.defaults && organizationId) {
                await tx.catalogueDefaults.create({
                    data: {
                        storeId,
                        organizationId,
                        key: category.id,
                        categoryId: category.id,
                        howToUse: dto.defaults.howToUse ?? null,
                        lowStockAlert: dto.defaults.lowStockAlert ?? null,
                        returnsMode: dto.defaults.returnsMode ?? null,
                        returnsText: dto.defaults.returnsText ?? null,
                    },
                });
            }
            const moved = await tx.product.updateMany({
                where: {
                    storeId,
                    id: { in: dto.productIds },
                    categoryId: dto.movedTo ?? null,
                },
                data: { categoryId: category.id },
            });
            return { id: category.id, moved: moved.count };
        });
    }

    private async removeInto(
        storeId: string,
        categoryId: string,
        intoId: string | null,
    ): Promise<CategoryRemoval> {
        const category = await prisma.category.findFirst({
            where: { id: categoryId, storeId },
            select: {
                id: true,
                name: true,
                slug: true,
                parentId: true,
                _count: { select: { children: true, discountReach: true } },
                fields: { select: { fieldId: true } },
                defaults: {
                    select: {
                        howToUse: true,
                        lowStockAlert: true,
                        returnsMode: true,
                        returnsText: true,
                    },
                    take: 1,
                },
            },
        });
        if (!category) {
            throw new NotFoundException("Category not found");
        }
        if (category._count.children > 0) {
            throw new ConflictException(
                "Move or delete the sub-categories first",
            );
        }
        // A discount code that reaches this category would silently stop
        // reaching anything; say so rather than break it.
        if (category._count.discountReach > 0) {
            const n = category._count.discountReach;
            throw new ConflictException(
                `${n === 1 ? "A discount code applies" : `${n} discount codes apply`} to ${category.name}. Change ${n === 1 ? "it" : "them"} in Discounts first.`,
            );
        }
        const products = await prisma.product.findMany({
            where: { storeId, categoryId },
            select: { id: true },
        });
        const productIds = products.map((p) => p.id);
        await prisma.$transaction([
            prisma.product.updateMany({
                where: { storeId, categoryId },
                data: { categoryId: intoId },
            }),
            prisma.category.delete({ where: { id: categoryId } }),
        ]);
        return {
            id: category.id,
            name: category.name,
            slug: category.slug,
            parentId: category.parentId,
            movedTo: intoId,
            productIds,
            defaults: category.defaults[0] ?? null,
            fieldIds: category.fields.map((f) => f.fieldId),
        };
    }

    private async requireCategory(storeId: string, categoryId: string) {
        const category = await prisma.category.findFirst({
            where: { id: categoryId, storeId },
            select: { id: true, name: true },
        });
        if (!category) {
            throw new NotFoundException("Category not found");
        }
        return category;
    }

    /** Names are unique per store, ignoring case ("Serums" = "serums"). */
    private async assertNameFree(
        storeId: string,
        name: string,
        exceptId?: string,
    ): Promise<void> {
        const clash = await prisma.category.findFirst({
            where: {
                storeId,
                name: { equals: name, mode: "insensitive" },
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
            select: { name: true },
        });
        if (clash) {
            throw new ConflictException({
                message: exceptId
                    ? "That name is taken — use Merge to combine them."
                    : `There is already a category called ${clash.name}.`,
                field: "name",
            });
        }
    }

    /**
     * Assert write access AND return the owning Organization id, so every
     * create in this service can stamp `organizationId` (#173). Returning it
     * here rather than looking it up at each call site makes the stamp hard to
     * forget: the guard you must call already hands you the value.
     */
    private async requireWrite(
        storeId: string,
        userId: string,
    ): Promise<string | null> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (writable === null) {
            throw new NotFoundException("Store not found");
        }
        return writable.organizationId;
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
