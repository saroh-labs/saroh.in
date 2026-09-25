import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

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
 * row is soft-deleted), so Undo brings back everything typed into it. The
 * fields are the business's (#529), asked of every storefront's products.
 */
@Injectable()
export class FieldsService {
    async views(organizationId: string): Promise<FieldView[]> {
        const fields = await prisma.productField.findMany({
            where: { organizationId, deletedAt: null },
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
            where: { store: { organizationId }, categoryId: { not: null } },
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
        organizationId: string,
        input: { name: string; type: FieldType },
    ): Promise<FieldView> {
        const name = input.name.trim();
        await this.assertName(organizationId, name);
        const position = await prisma.productField.count({
            where: { organizationId, deletedAt: null },
        });
        const field = await prisma.productField.create({
            data: {
                organizationId,
                name,
                type: input.type,
                position,
            },
            select: { id: true },
        });
        return this.one(organizationId, field.id);
    }

    async update(
        organizationId: string,
        fieldId: string,
        input: { name?: string; onShop?: boolean; categoryIds?: string[] },
    ): Promise<FieldView> {
        await this.requireField(organizationId, fieldId);
        if (input.name !== undefined) {
            await this.assertName(organizationId, input.name.trim(), fieldId);
        }
        if (input.categoryIds) {
            const found = await prisma.category.count({
                where: { organizationId, id: { in: input.categoryIds } },
            });
            if (found !== new Set(input.categoryIds).size) {
                throw new BadRequestException({
                    message: "A category in the list is not one of yours.",
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
        return this.one(organizationId, fieldId);
    }

    /** Soft: the field and its values come back with Undo. */
    async remove(organizationId: string, fieldId: string) {
        const field = await this.requireField(organizationId, fieldId);
        await prisma.productField.update({
            where: { id: fieldId },
            data: { deletedAt: new Date() },
        });
        return { id: field.id, name: field.name };
    }

    async restore(organizationId: string, fieldId: string) {
        const field = await prisma.productField.findFirst({
            where: { id: fieldId, organizationId, deletedAt: { not: null } },
            select: { id: true, name: true },
        });
        if (!field) throw new NotFoundException("Field not found");
        await this.assertName(organizationId, field.name, fieldId);
        await prisma.productField.update({
            where: { id: fieldId },
            data: { deletedAt: null },
        });
        return this.one(organizationId, fieldId);
    }

    private async one(
        organizationId: string,
        fieldId: string,
    ): Promise<FieldView> {
        const all = await this.views(organizationId);
        const found = all.find((f) => f.id === fieldId);
        if (!found) throw new NotFoundException("Field not found");
        return found;
    }

    private async assertName(
        organizationId: string,
        name: string,
        except?: string,
    ) {
        const others = await prisma.productField.findMany({
            where: {
                organizationId,
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

    private async requireField(organizationId: string, fieldId: string) {
        const field = await prisma.productField.findFirst({
            where: { id: fieldId, organizationId, deletedAt: null },
            select: { id: true, name: true },
        });
        if (!field) throw new NotFoundException("Field not found");
        return field;
    }
}

/** The fields a product's category asks for, with the product's values. */
export async function productFieldsFor(
    organizationId: string,
    productId: string,
    categoryId: string | null,
): Promise<ProductFieldDto[]> {
    if (!categoryId) return [];
    const fields = await prisma.productField.findMany({
        where: {
            organizationId,
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
 * Check custom field values without writing: every id is one of the
 * business's live fields and every value suits its type, "" or null clearing
 * it. Create runs it before the product exists, so a refused value never
 * leaves one behind; another business's field, or a deleted one, is refused.
 */
export async function checkProductFieldValues(
    organizationId: string,
    values: Record<string, string | null>,
): Promise<{ fieldId: string; value: string | null }[]> {
    const ids = Object.keys(values);
    if (ids.length === 0) return [];
    const fields = await prisma.productField.findMany({
        where: { organizationId, deletedAt: null, id: { in: ids } },
        select: { id: true, name: true, type: true },
    });
    if (fields.length !== ids.length) {
        throw new BadRequestException({
            message: "A field in the list is not one of yours.",
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
    organizationId: string,
    productId: string,
    values: Record<string, string | null>,
): Promise<void> {
    const cleaned = await checkProductFieldValues(organizationId, values);
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
