import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { StoresService } from "../stores/stores.service";
import type { FieldType } from "./field-rules";
import { checkFieldValue, FIELD_TYPES, fieldNameProblem } from "./field-rules";

export interface FieldView {
    id: string;
    name: string;
    type: FieldType;
    onShop: boolean;
    position: number;
    categoryIds: string[];
    /** Products in those categories — the ones that ask for it. */
    productCount: number;
}

/** A field as one product holds it: asked of its category, with its value. */
export interface ProductFieldDto {
    id: string;
    name: string;
    type: FieldType;
    onShop: boolean;
    value: string | null;
}

const asType = (t: string): FieldType =>
    (FIELD_TYPES as readonly string[]).includes(t) ? (t as FieldType) : "TEXT";

/**
 * Custom fields (#482): things a product records beyond the standard
 * details, asked of the products in the categories each names. Team only
 * unless switched on for the shop. A deleted field keeps its values (the
 * row is soft-deleted), so Undo brings back everything typed into it.
 */
@Injectable()
export class FieldsService {
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string): Promise<FieldView[]> {
        await this.stores.getForUser(storeId, userId);
        return this.views(storeId);
    }

    async views(storeId: string): Promise<FieldView[]> {
        const fields = await prisma.productField.findMany({
            where: { storeId, deletedAt: null },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
                id: true,
                name: true,
                type: true,
                onShop: true,
                position: true,
                categories: { select: { categoryId: true } },
            },
        });
        const counts = await prisma.product.groupBy({
            by: ["categoryId"],
            where: { storeId, categoryId: { not: null } },
            _count: { _all: true },
        });
        const inCategory = new Map<string, number>();
        for (const c of counts) {
            if (c.categoryId) inCategory.set(c.categoryId, c._count._all);
        }
        return fields.map((f) => {
            const categoryIds = f.categories.map((c) => c.categoryId);
            return {
                id: f.id,
                name: f.name,
                type: asType(f.type),
                onShop: f.onShop,
                position: f.position,
                categoryIds,
                productCount: categoryIds.reduce(
                    (n, id) => n + (inCategory.get(id) ?? 0),
                    0,
                ),
            };
        });
    }

    async create(
        storeId: string,
        userId: string,
        input: { name: string; type: FieldType },
    ): Promise<FieldView> {
        const organizationId = await this.requireOrg(storeId, userId);
        const name = input.name.trim();
        await this.assertName(storeId, name);
        const position = await prisma.productField.count({
            where: { storeId, deletedAt: null },
        });
        const field = await prisma.productField.create({
            data: {
                storeId,
                organizationId,
                name,
                type: input.type,
                position,
            },
            select: { id: true },
        });
        return this.one(storeId, field.id);
    }

    async update(
        storeId: string,
        fieldId: string,
        userId: string,
        input: { name?: string; onShop?: boolean; categoryIds?: string[] },
    ): Promise<FieldView> {
        await this.requireOrg(storeId, userId);
        await this.requireField(storeId, fieldId);
        if (input.name !== undefined) {
            await this.assertName(storeId, input.name.trim(), fieldId);
        }
        if (input.categoryIds) {
            const found = await prisma.category.count({
                where: { storeId, id: { in: input.categoryIds } },
            });
            if (found !== new Set(input.categoryIds).size) {
                throw new BadRequestException({
                    message:
                        "A category in the list is not in this storefront.",
                    field: "categoryIds",
                });
            }
        }
        await prisma.$transaction(async (tx) => {
            if (input.name !== undefined || input.onShop !== undefined) {
                await tx.productField.update({
                    where: { id: fieldId },
                    data: {
                        ...(input.name !== undefined
                            ? { name: input.name.trim() }
                            : {}),
                        ...(input.onShop !== undefined
                            ? { onShop: input.onShop }
                            : {}),
                    },
                });
            }
            if (input.categoryIds) {
                await tx.productFieldCategory.deleteMany({
                    where: { fieldId },
                });
                await tx.productFieldCategory.createMany({
                    data: [...new Set(input.categoryIds)].map((categoryId) => ({
                        fieldId,
                        categoryId,
                    })),
                });
            }
        });
        return this.one(storeId, fieldId);
    }

    /** Soft: the field and its values come back with Undo. */
    async remove(storeId: string, fieldId: string, userId: string) {
        await this.requireOrg(storeId, userId);
        const field = await this.requireField(storeId, fieldId);
        await prisma.productField.update({
            where: { id: fieldId },
            data: { deletedAt: new Date() },
        });
        return { id: field.id, name: field.name };
    }

    async restore(storeId: string, fieldId: string, userId: string) {
        await this.requireOrg(storeId, userId);
        const field = await prisma.productField.findFirst({
            where: { id: fieldId, storeId, deletedAt: { not: null } },
            select: { id: true, name: true },
        });
        if (!field) throw new NotFoundException("Field not found");
        await this.assertName(storeId, field.name, fieldId);
        await prisma.productField.update({
            where: { id: fieldId },
            data: { deletedAt: null },
        });
        return this.one(storeId, fieldId);
    }

    private async one(storeId: string, fieldId: string): Promise<FieldView> {
        const all = await this.views(storeId);
        const found = all.find((f) => f.id === fieldId);
        if (!found) throw new NotFoundException("Field not found");
        return found;
    }

    private async assertName(storeId: string, name: string, except?: string) {
        const others = await prisma.productField.findMany({
            where: {
                storeId,
                deletedAt: null,
                ...(except ? { id: { not: except } } : {}),
            },
            select: { name: true },
        });
        const problem = fieldNameProblem(
            name,
            others.map((o) => o.name),
        );
        if (problem) {
            throw new BadRequestException({ message: problem, field: "name" });
        }
    }

    private async requireField(storeId: string, fieldId: string) {
        const field = await prisma.productField.findFirst({
            where: { id: fieldId, storeId, deletedAt: null },
            select: { id: true, name: true },
        });
        if (!field) throw new NotFoundException("Field not found");
        return field;
    }

    private async requireOrg(storeId: string, userId: string): Promise<string> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (!writable) {
            throw new ForbiddenException(
                "Your role can't change product settings.",
            );
        }
        if (!writable.organizationId) {
            throw new BadRequestException(
                "This storefront belongs to no business.",
            );
        }
        return writable.organizationId;
    }
}

/** The fields a product's category asks for, with the product's values. */
export async function productFieldsFor(
    storeId: string,
    productId: string,
    categoryId: string | null,
): Promise<ProductFieldDto[]> {
    if (!categoryId) return [];
    const fields = await prisma.productField.findMany({
        where: {
            storeId,
            deletedAt: null,
            categories: { some: { categoryId } },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
            id: true,
            name: true,
            type: true,
            onShop: true,
            values: { where: { productId }, select: { value: true } },
        },
    });
    return fields.map((f) => ({
        id: f.id,
        name: f.name,
        type: asType(f.type),
        onShop: f.onShop,
        value: f.values[0]?.value ?? null,
    }));
}

/**
 * A product's values, from the section PATCH: each checked against its
 * field's type, "" or null clearing it. A field from another storefront, or
 * a deleted one, is refused.
 */
/**
 * Check custom field values without writing: every id is one of this
 * storefront's live fields and every value suits its type. Create runs it
 * before the product exists, so a refused value never leaves one behind.
 */
export async function checkProductFieldValues(
    storeId: string,
    values: Record<string, string | null>,
): Promise<{ fieldId: string; value: string | null }[]> {
    const ids = Object.keys(values);
    if (ids.length === 0) return [];
    const fields = await prisma.productField.findMany({
        where: { storeId, deletedAt: null, id: { in: ids } },
        select: { id: true, name: true, type: true },
    });
    if (fields.length !== ids.length) {
        throw new BadRequestException({
            message: "A field in the list is not one of this storefront's.",
            field: "customFields",
        });
    }
    return fields.map((f) => {
        const check = checkFieldValue(asType(f.type), f.name, values[f.id]);
        if (!check.ok) {
            throw new BadRequestException({
                message: check.error,
                field: "customFields",
            });
        }
        return { fieldId: f.id, value: check.value };
    });
}

export async function saveProductFieldValues(
    storeId: string,
    productId: string,
    organizationId: string,
    values: Record<string, string | null>,
): Promise<void> {
    const cleaned = await checkProductFieldValues(storeId, values);
    if (cleaned.length === 0) return;
    await prisma.$transaction(
        cleaned.map(({ fieldId, value }) =>
            value === null
                ? prisma.productFieldValue.deleteMany({
                      where: { productId, fieldId },
                  })
                : prisma.productFieldValue.upsert({
                      where: { productId_fieldId: { productId, fieldId } },
                      create: { productId, fieldId, organizationId, value },
                      update: { value },
                  }),
        ),
    );
}
