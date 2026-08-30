import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { slugify } from "../stores/slug";
import { StoresService } from "../stores/stores.service";
import type { CreateProductDto, ProductStatus, UpdateProductDto } from "./dto";
import { serializeProduct, serializeProductDetail } from "./serialize";

/**
 * Product catalog data layer. Authorization is delegated to StoresService so
 * the same membership rules apply everywhere: reads require store access
 * (getForUser throws 404 for non-members — no existence leak), writes require
 * canWrite (owner or a write-capable member). Prices are Decimal in the DB and
 * serialize to strings over HTTP (money stays exact).
 */
@Injectable()
export class ProductsService {
    constructor(private readonly stores: StoresService) {}

    /** Catalog for a store the caller can access, optionally filtered by status. */
    async list(storeId: string, userId: string, status?: ProductStatus) {
        await this.stores.getForUser(storeId, userId); // assert read access
        const products = await prisma.product.findMany({
            where: { storeId, ...(status ? { status } : {}) },
            orderBy: { createdAt: "desc" },
            include: { category: { select: { id: true, name: true } } },
        });
        return products.map(serializeProduct);
    }

    /** A single product with variants + inventory; 404 if no store access. */
    async get(storeId: string, productId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        const product = await prisma.product.findFirst({
            where: { id: productId, storeId },
            include: {
                category: { select: { id: true, name: true } },
                variants: { orderBy: { createdAt: "asc" } },
                inventory: true,
            },
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
        return serializeProductDetail(product);
    }

    async create(storeId: string, userId: string, dto: CreateProductDto) {
        const organizationId = await this.requireWrite(storeId, userId);
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        await this.assertSlugFree(storeId, slug);
        await this.assertCategoryInStore(storeId, dto.categoryId);

        try {
            const product = await prisma.product.create({
                data: {
                    storeId,
                    organizationId,
                    name: dto.name,
                    slug,
                    description: dto.description ?? null,
                    image: dto.image ?? null,
                    categoryId: dto.categoryId ?? null,
                    price: dto.price,
                    currency: dto.currency ?? "USD",
                    status: dto.status ?? "DRAFT",
                },
            });
            return { id: product.id };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    async update(
        storeId: string,
        productId: string,
        userId: string,
        dto: UpdateProductDto,
    ) {
        await this.requireWrite(storeId, userId);
        const current = await prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { slug: true },
        });
        if (!current) {
            throw new NotFoundException("Product not found");
        }
        const slug = slugify(dto.slug);
        if (current.slug !== slug) {
            await this.assertSlugFree(storeId, slug);
        }
        await this.assertCategoryInStore(storeId, dto.categoryId ?? undefined);

        try {
            await prisma.product.update({
                where: { id: productId },
                data: {
                    name: dto.name,
                    slug,
                    description: dto.description ?? null,
                    image: dto.image ?? null,
                    categoryId: dto.categoryId ?? null,
                    price: dto.price,
                    currency: dto.currency ?? "USD",
                    ...(dto.status ? { status: dto.status } : {}),
                },
            });
            return { id: productId };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** Delete a product; variants + inventory cascade (schema onDelete: Cascade). */
    async remove(storeId: string, productId: string, userId: string) {
        await this.requireWrite(storeId, userId);
        const product = await prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true },
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
        await prisma.product.delete({ where: { id: productId } });
        return { id: productId };
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

    /** Assert the caller can read the store AND the product lives in it. */
    async assertProductReadable(
        storeId: string,
        productId: string,
        userId: string,
    ): Promise<void> {
        await this.stores.getForUser(storeId, userId);
        await this.assertProductInStore(storeId, productId);
    }

    /** Assert the caller can write the store AND the product lives in it. */
    async assertProductWritable(
        storeId: string,
        productId: string,
        userId: string,
    ): Promise<string | null> {
        const organizationId = await this.requireWrite(storeId, userId);
        await this.assertProductInStore(storeId, productId);
        return organizationId;
    }

    private async assertProductInStore(
        storeId: string,
        productId: string,
    ): Promise<void> {
        const product = await prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true },
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
    }

    /** Product slugs are unique per store (@@unique([storeId, slug])). */
    private async assertSlugFree(storeId: string, slug: string): Promise<void> {
        const existing = await prisma.product.findUnique({
            where: { storeId_slug: { storeId, slug } },
        });
        if (existing) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** A category attached to a product must belong to the same store. */
    private async assertCategoryInStore(
        storeId: string,
        categoryId?: string | null,
    ): Promise<void> {
        if (!categoryId) return;
        const category = await prisma.category.findFirst({
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
