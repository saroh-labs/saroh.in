import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { enqueuePageRevalidation } from "../sites/page-cache-revalidate";
import type {
    AddOptionValueDto,
    CreateOptionDto,
    RenameOptionDto,
    RenameOptionValueDto,
    ReorderOptionValuesDto,
} from "./dto";

export interface OptionView {
    id: string;
    name: string;
    position: number;
    /** Products that choose their variants by this option. */
    productCount: number;
    values: { id: string; value: string; variantCount: number }[];
}

/**
 * The business's variant options ("Size", "Shade") and their values (#529). A product
 * picks one option; its variants each pick a value. Names and values are
 * unique ignoring case. Anything in use says so rather than disappearing:
 * an option a product uses cannot be deleted, a value a variant uses cannot
 * be removed — but it can be renamed (every variant that uses it changes
 * with it) and put in another place. Deletes, renames and moves hand back
 * what they changed, for Undo.
 */
@Injectable()
export class OptionsService {
    async views(organizationId: string): Promise<OptionView[]> {
        const options = await prisma.productOption.findMany({
            where: { organizationId },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
                id: true,
                name: true,
                position: true,
                _count: { select: { products: true } },
                values: {
                    orderBy: { position: "asc" },
                    select: {
                        id: true,
                        value: true,
                        _count: { select: { variants: true } },
                    },
                },
            },
        });
        return options.map((o) => ({
            id: o.id,
            name: o.name,
            position: o.position,
            productCount: o._count.products,
            values: o.values.map((v) => ({
                id: v.id,
                value: v.value,
                variantCount: v._count.variants,
            })),
        }));
    }

    async create(organizationId: string, dto: CreateOptionDto) {
        await this.assertNameFree(organizationId, dto.name);
        const values = uniqueValues(dto.values ?? []);
        const last = await prisma.productOption.findFirst({
            where: { organizationId },
            orderBy: { position: "desc" },
            select: { position: true },
        });
        const option = await prisma.productOption.create({
            data: {
                organizationId,
                name: dto.name,
                position: (last?.position ?? -1) + 1,
                values: {
                    create: values.map((value, position) => ({
                        value,
                        position,
                        organizationId,
                    })),
                },
            },
            select: { id: true },
        });
        return { id: option.id };
    }

    async rename(
        organizationId: string,
        optionId: string,
        dto: RenameOptionDto,
    ) {
        const option = await this.requireOption(organizationId, optionId);
        await this.assertNameFree(organizationId, dto.name, optionId);
        await prisma.productOption.update({
            where: { id: optionId },
            data: { name: dto.name },
        });
        return { id: optionId, name: dto.name, previousName: option.name };
    }

    /** Refused while a product chooses by it; returns what it was, for Undo. */
    async remove(organizationId: string, optionId: string) {
        const option = await prisma.productOption.findFirst({
            where: { id: optionId, organizationId },
            select: {
                id: true,
                name: true,
                _count: { select: { products: true } },
                values: {
                    orderBy: { position: "asc" },
                    select: { value: true },
                },
            },
        });
        if (!option) throw new NotFoundException("Option not found");
        const used = option._count.products;
        if (used > 0) {
            throw new ConflictException({
                message: `Used by ${used} ${used === 1 ? "product" : "products"}. Change their variants first.`,
                field: "optionId",
            });
        }
        await prisma.productOption.delete({ where: { id: optionId } });
        return {
            id: optionId,
            name: option.name,
            values: option.values.map((v) => v.value),
        };
    }

    async addValue(
        organizationId: string,
        optionId: string,
        dto: AddOptionValueDto,
    ) {
        await this.requireOption(organizationId, optionId);
        const clash = await prisma.productOptionValue.findFirst({
            where: {
                optionId,
                value: { equals: dto.value, mode: "insensitive" },
            },
            select: { value: true },
        });
        if (clash) {
            throw new ConflictException({
                message: `${clash.value} is already a value of this option.`,
                field: "value",
            });
        }
        const last = await prisma.productOptionValue.findFirst({
            where: { optionId },
            orderBy: { position: "desc" },
            select: { position: true },
        });
        const value = await prisma.productOptionValue.create({
            data: {
                optionId,
                organizationId,
                value: dto.value,
                position: (last?.position ?? -1) + 1,
            },
            select: { id: true, value: true },
        });
        return value;
    }

    /** Refused while a variant uses it; returns the value, for Undo. */
    async removeValue(
        organizationId: string,
        optionId: string,
        valueId: string,
    ) {
        await this.requireOption(organizationId, optionId);
        const value = await prisma.productOptionValue.findFirst({
            where: { id: valueId, optionId },
            select: {
                id: true,
                value: true,
                _count: { select: { variants: true } },
            },
        });
        if (!value) throw new NotFoundException("Value not found");
        if (value._count.variants > 0) {
            throw new ConflictException({
                message: `${value.value} is used by a variant, so it can't be removed. Change the variant first.`,
                field: "valueId",
            });
        }
        await prisma.productOptionValue.delete({ where: { id: valueId } });
        return { id: valueId, value: value.value };
    }

    /**
     * A value's new name, on every variant that uses it: a variant's title
     * is its value's words (`variant-rows.ts`), so the variants follow, and
     * their products' pages are told (#863). A case-only change of itself is
     * allowed; another value's name is refused.
     */
    async renameValue(
        organizationId: string,
        optionId: string,
        valueId: string,
        dto: RenameOptionValueDto,
    ) {
        await this.requireOption(organizationId, optionId);
        const value = await prisma.productOptionValue.findFirst({
            where: { id: valueId, optionId },
            select: { id: true, value: true },
        });
        if (!value) throw new NotFoundException("Value not found");
        const clash = await prisma.productOptionValue.findFirst({
            where: {
                optionId,
                id: { not: valueId },
                value: { equals: dto.value, mode: "insensitive" },
            },
            select: { value: true },
        });
        if (clash) {
            throw new ConflictException({
                message: `${clash.value} already exists.`,
                field: "value",
            });
        }
        const variants = await prisma.$transaction(async (tx) => {
            await tx.productOptionValue.update({
                where: { id: valueId },
                data: { value: dto.value },
            });
            const used = await tx.productVariant.findMany({
                where: { optionValueId: valueId },
                select: { productId: true },
            });
            await tx.productVariant.updateMany({
                where: { optionValueId: valueId },
                data: { title: dto.value },
            });
            const productIds = [...new Set(used.map((v) => v.productId))];
            if (productIds.length > 0) {
                // Their titles show on the products' pages.
                await enqueuePageRevalidation(tx, {
                    cause: "product",
                    productIds,
                    organizationId,
                });
            }
            return used.length;
        });
        return {
            id: valueId,
            value: dto.value,
            previousValue: value.value,
            variantCount: variants,
        };
    }

    /**
     * The order customers pick values in. `valueIds` is every value of the
     * option, once; returns the order it had, for Undo.
     */
    async reorderValues(
        organizationId: string,
        optionId: string,
        dto: ReorderOptionValuesDto,
    ) {
        await this.requireOption(organizationId, optionId);
        const values = await prisma.productOptionValue.findMany({
            where: { optionId },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: { id: true },
        });
        const ids = new Set(values.map((v) => v.id));
        const given = new Set(dto.valueIds);
        if (
            given.size !== dto.valueIds.length ||
            given.size !== ids.size ||
            dto.valueIds.some((id) => !ids.has(id))
        ) {
            throw new BadRequestException({
                message:
                    "The values changed while you were sorting. Open the option again.",
                field: "valueIds",
            });
        }
        await prisma.$transaction(
            dto.valueIds.map((id, position) =>
                prisma.productOptionValue.update({
                    where: { id },
                    data: { position },
                }),
            ),
        );
        return {
            id: optionId,
            valueIds: dto.valueIds,
            previousValueIds: values.map((v) => v.id),
        };
    }

    private async requireOption(organizationId: string, optionId: string) {
        const option = await prisma.productOption.findFirst({
            where: { id: optionId, organizationId },
            select: { id: true, name: true },
        });
        if (!option) throw new NotFoundException("Option not found");
        return option;
    }

    private async assertNameFree(
        organizationId: string,
        name: string,
        exceptId?: string,
    ): Promise<void> {
        const clash = await prisma.productOption.findFirst({
            where: {
                organizationId,
                name: { equals: name, mode: "insensitive" },
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
            select: { name: true },
        });
        if (clash) {
            throw new ConflictException({
                message: `${clash.name} already exists.`,
                field: "name",
            });
        }
    }
}

/** Trimmed, blanks dropped, and each value once ignoring case. */
function uniqueValues(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
        const v = raw.trim();
        if (!v || seen.has(v.toLowerCase())) continue;
        seen.add(v.toLowerCase());
        out.push(v);
    }
    return out;
}
