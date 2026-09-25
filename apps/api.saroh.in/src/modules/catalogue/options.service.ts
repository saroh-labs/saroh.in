import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { StoresService } from "../stores/stores.service";
import type {
    AddOptionValueDto,
    CreateOptionDto,
    RenameOptionDto,
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
 * Store-wide variant options ("Size", "Shade") and their values. A product
 * picks one option; its variants each pick a value. Names and values are
 * unique ignoring case. Anything in use says so rather than disappearing:
 * an option a product uses cannot be deleted, a value a variant uses cannot
 * be removed. Deletes hand back what they removed, for Undo.
 */
@Injectable()
export class OptionsService {
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string): Promise<OptionView[]> {
        await this.stores.getForUser(storeId, userId);
        return this.views(storeId);
    }

    async views(storeId: string): Promise<OptionView[]> {
        const options = await prisma.productOption.findMany({
            where: { storeId },
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

    async create(storeId: string, userId: string, dto: CreateOptionDto) {
        const organizationId = await this.requireOrg(storeId, userId);
        await this.assertNameFree(storeId, dto.name);
        const values = uniqueValues(dto.values ?? []);
        const last = await prisma.productOption.findFirst({
            where: { storeId },
            orderBy: { position: "desc" },
            select: { position: true },
        });
        const option = await prisma.productOption.create({
            data: {
                storeId,
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
        storeId: string,
        optionId: string,
        userId: string,
        dto: RenameOptionDto,
    ) {
        await this.requireOrg(storeId, userId);
        const option = await this.requireOption(storeId, optionId);
        await this.assertNameFree(storeId, dto.name, optionId);
        await prisma.productOption.update({
            where: { id: optionId },
            data: { name: dto.name },
        });
        return { id: optionId, name: dto.name, previousName: option.name };
    }

    /** Refused while a product chooses by it; returns what it was, for Undo. */
    async remove(storeId: string, optionId: string, userId: string) {
        await this.requireOrg(storeId, userId);
        const option = await prisma.productOption.findFirst({
            where: { id: optionId, storeId },
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
                message: `Used by ${used} ${used === 1 ? "product" : "products"} — change their variants first.`,
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
        storeId: string,
        optionId: string,
        userId: string,
        dto: AddOptionValueDto,
    ) {
        const organizationId = await this.requireOrg(storeId, userId);
        await this.requireOption(storeId, optionId);
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
        storeId: string,
        optionId: string,
        valueId: string,
        userId: string,
    ) {
        await this.requireOrg(storeId, userId);
        await this.requireOption(storeId, optionId);
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
                message: `${value.value} is used by a variant, so it can't be removed — change the variant first.`,
                field: "valueId",
            });
        }
        await prisma.productOptionValue.delete({ where: { id: valueId } });
        return { id: valueId, value: value.value };
    }

    private async requireOrg(storeId: string, userId: string): Promise<string> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (writable === null) throw new NotFoundException("Store not found");
        if (!writable.organizationId) {
            throw new BadRequestException(
                "This storefront is not attached to a business, so it can't have options.",
            );
        }
        return writable.organizationId;
    }

    private async requireOption(storeId: string, optionId: string) {
        const option = await prisma.productOption.findFirst({
            where: { id: optionId, storeId },
            select: { id: true, name: true },
        });
        if (!option) throw new NotFoundException("Option not found");
        return option;
    }

    private async assertNameFree(
        storeId: string,
        name: string,
        exceptId?: string,
    ): Promise<void> {
        const clash = await prisma.productOption.findFirst({
            where: {
                storeId,
                name: { equals: name, mode: "insensitive" },
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
            select: { name: true },
        });
        if (clash) {
            throw new ConflictException({
                message: `There is already an option called ${clash.name}.`,
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
