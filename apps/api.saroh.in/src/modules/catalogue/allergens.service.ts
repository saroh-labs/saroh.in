import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { StoresService } from "../stores/stores.service";

export const ALLERGEN_NAME_MAX = 30;

/** What a food business adds in one step; a store starts with none. */
export const COMMON_FOOD_ALLERGENS = [
    "Gluten",
    "Milk",
    "Eggs",
    "Nuts",
    "Peanuts",
    "Sesame",
    "Soy",
    "Mustard",
];

export interface AllergenView {
    id: string;
    name: string;
    contains: number;
    mayContain: number;
}

export interface ProductAllergensDto {
    contains: { id: string; name: string }[];
    mayContain: { id: string; name: string }[];
}

/**
 * A storefront's allergen list (#483): what the editor offers under
 * "Contains" and "May contain", named as customers will read it. One a
 * product lists can't be removed — the refusal says how many list it.
 */
@Injectable()
export class AllergensService {
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string): Promise<AllergenView[]> {
        await this.stores.getForUser(storeId, userId);
        return this.views(storeId);
    }

    async views(storeId: string): Promise<AllergenView[]> {
        const rows = await prisma.storeAllergen.findMany({
            where: { storeId },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: {
                id: true,
                name: true,
                products: { select: { kind: true } },
            },
        });
        return rows.map((a) => ({
            id: a.id,
            name: a.name,
            contains: a.products.filter((p) => p.kind === "CONTAINS").length,
            mayContain: a.products.filter((p) => p.kind === "MAY_CONTAIN")
                .length,
        }));
    }

    /** One name, or several (the common list); duplicates are refused. */
    async add(
        storeId: string,
        userId: string,
        names: string[],
    ): Promise<AllergenView[]> {
        const organizationId = await this.requireOrg(storeId, userId);
        const existing = await prisma.storeAllergen.findMany({
            where: { storeId },
            select: { name: true },
        });
        const taken = new Set(existing.map((a) => a.name.toLowerCase()));
        const clean: string[] = [];
        for (const raw of names) {
            const name = raw.trim();
            if (!name) {
                throw new BadRequestException({
                    message: "An allergen needs a name.",
                    field: "name",
                });
            }
            if (name.length > ALLERGEN_NAME_MAX) {
                throw new BadRequestException({
                    message: `Keep it under ${ALLERGEN_NAME_MAX} characters.`,
                    field: "name",
                });
            }
            if (taken.has(name.toLowerCase())) {
                // Adding the common list over a partial one skips the ones
                // already there; one typed by hand says so.
                if (names.length === 1) {
                    throw new ConflictException({
                        message: `${name} is already on the list.`,
                        field: "name",
                    });
                }
                continue;
            }
            taken.add(name.toLowerCase());
            clean.push(name);
        }
        const start = existing.length;
        await prisma.storeAllergen.createMany({
            data: clean.map((name, i) => ({
                storeId,
                organizationId,
                name,
                position: start + i,
            })),
        });
        return this.views(storeId);
    }

    async remove(storeId: string, allergenId: string, userId: string) {
        await this.requireOrg(storeId, userId);
        const allergen = await prisma.storeAllergen.findFirst({
            where: { id: allergenId, storeId },
            select: {
                id: true,
                name: true,
                _count: { select: { products: true, contactNotes: true } },
            },
        });
        if (!allergen) throw new NotFoundException("Allergen not found");
        const used = allergen._count.products;
        if (used > 0) {
            throw new ConflictException({
                message: `${allergen.name} is on ${used} ${used === 1 ? "product" : "products"} — take it off them first.`,
                field: "allergenId",
            });
        }
        // A customer's allergy is never dropped in passing (U8): the notes
        // that name it are edited first, by someone who reads them.
        const noted = allergen._count.contactNotes;
        if (noted > 0) {
            throw new ConflictException({
                message: `${allergen.name} is in ${noted} customer ${noted === 1 ? "note" : "notes"} — take it off them first.`,
                field: "allergenId",
            });
        }
        await prisma.storeAllergen.delete({ where: { id: allergenId } });
        return { id: allergen.id, name: allergen.name };
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

/** A product's allergens, split the way the shop says them. */
export async function productAllergensFor(
    productId: string,
): Promise<ProductAllergensDto> {
    const rows = await prisma.productAllergen.findMany({
        where: { productId },
        orderBy: { allergen: { position: "asc" } },
        select: { kind: true, allergen: { select: { id: true, name: true } } },
    });
    return {
        contains: rows
            .filter((r) => r.kind === "CONTAINS")
            .map((r) => r.allergen),
        mayContain: rows
            .filter((r) => r.kind === "MAY_CONTAIN")
            .map((r) => r.allergen),
    };
}

/** Every id is on this storefront's list; checked before anything is written. */
export async function checkProductAllergens(
    storeId: string,
    input: { contains?: string[]; mayContain?: string[] },
): Promise<void> {
    const ids = [...(input.contains ?? []), ...(input.mayContain ?? [])];
    if (ids.length === 0) return;
    const found = await prisma.storeAllergen.count({
        where: { storeId, id: { in: ids } },
    });
    if (found !== new Set(ids).size) {
        throw new BadRequestException({
            message:
                "An allergen in the list is not on this storefront's list.",
            field: "allergens",
        });
    }
}

/**
 * The section PATCH's `contains` / `mayContain`: allergen ids of this
 * storefront. Each list given replaces that kind; one allergen can't be in
 * both (Contains wins over May contain).
 */
export async function saveProductAllergens(
    storeId: string,
    productId: string,
    organizationId: string,
    input: { contains?: string[]; mayContain?: string[] },
): Promise<void> {
    if (!input.contains && !input.mayContain) return;
    await checkProductAllergens(storeId, input);
    const contains = new Set(input.contains ?? []);
    await prisma.$transaction(async (tx) => {
        for (const [kind, list] of [
            ["CONTAINS", input.contains],
            ["MAY_CONTAIN", input.mayContain],
        ] as const) {
            if (!list) continue;
            await tx.productAllergen.deleteMany({ where: { productId, kind } });
            const keep = [...new Set(list)].filter(
                (id) => kind === "CONTAINS" || !contains.has(id),
            );
            // The other kind may already hold one of these; the new list wins.
            await tx.productAllergen.deleteMany({
                where: { productId, allergenId: { in: keep } },
            });
            await tx.productAllergen.createMany({
                data: keep.map((allergenId) => ({
                    productId,
                    allergenId,
                    organizationId,
                    kind,
                })),
            });
        }
    });
}
