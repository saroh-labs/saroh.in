import { BadRequestException, Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    DefaultField,
    DefaultsEntry,
    Effective,
    ProductDefaults,
    Suggestion,
} from "./catalogue-defaults";
import {
    ALL_KEY,
    DEFAULT_FIELDS,
    EMPTY_ENTRY,
    effectiveFor,
    sameReturns,
    stillOnDefault,
    suggestFor,
} from "./catalogue-defaults";
import type {
    DefaultsEntryInput,
    SaveDefaultsDto,
    UndoDefaultsDto,
} from "./dto";
import type { OptionView } from "./options.service";
import { OptionsService } from "./options.service";

export interface CatalogueView {
    categories: {
        id: string;
        name: string;
        slug: string;
        parentId: string | null;
        productCount: number;
    }[];
    uncategorizedCount: number;
    options: OptionView[];
    defaults: {
        entries: Record<string, DefaultsEntry>;
        /** Per key and field: saved products still holding the default. */
        stillOnDefault: Record<string, Record<DefaultField, number>>;
        productCounts: Record<string, number>;
        suggestions: Suggestion[];
    };
    canWrite: boolean;
}

interface ProductSnapshot {
    id: string;
    howToUse: string | null;
    returnsMode: string;
    returnsText: string | null;
}

interface StockSnapshot {
    kind: "product" | "variant";
    id: string;
    lowStockAlert: number;
}

export interface DefaultsSaveResult {
    entries: Record<string, DefaultsEntry>;
    /** The rows as they were before, for Undo. */
    previous: (DefaultsEntry & { key: string })[];
    updatedCount: number;
    updated: { products: ProductSnapshot[]; stock: StockSnapshot[] };
}

/**
 * The settings page's read, and the Defaults tab's save. One read carries
 * categories with their product counts, options with what uses them, and the
 * defaults with how many saved products still hold each one — so the page
 * never adds up anything itself. The settings are the business's (#529):
 * the counts are over every storefront's products.
 */
@Injectable()
export class CatalogueService {
    constructor(private readonly options: OptionsService) {}

    async get(
        organizationId: string,
        canWrite: boolean,
    ): Promise<CatalogueView> {
        const [categories, uncategorizedCount, options] = await Promise.all([
            prisma.category.findMany({
                where: { organizationId },
                orderBy: { name: "asc" },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    parentId: true,
                    _count: { select: { products: true } },
                },
            }),
            prisma.product.count({
                where: { organizationId, categoryId: null },
            }),
            this.options.views(organizationId),
        ]);
        const entries = await this.entries(organizationId);
        const products = await this.productDefaults(organizationId);

        const keys = [ALL_KEY, ...categories.map((c) => c.id)];
        const still: Record<string, Record<DefaultField, number>> = {};
        const productCounts: Record<string, number> = {};
        const suggestions: Suggestion[] = [];
        for (const key of keys) {
            const inKey =
                key === ALL_KEY
                    ? products
                    : products.filter((p) => p.categoryId === key);
            productCounts[key] = inKey.length;
            const counts = { howToUse: 0, lowStockAlert: 0, returns: 0 };
            for (const p of inKey) {
                const eff = effectiveFor(entries, p.categoryId);
                for (const field of DEFAULT_FIELDS) {
                    if (stillOnDefault(p, eff, field)) counts[field] += 1;
                }
            }
            still[key] = counts;
            if (key !== ALL_KEY) {
                const own = entries[key] ?? EMPTY_ENTRY;
                const howTo = suggestFor(
                    key,
                    "howToUse",
                    inKey.map((p) => p.howToUse),
                    effectiveFor(entries, key).howToUse,
                );
                if (howTo) suggestions.push(howTo);
                const warn = suggestFor(
                    key,
                    "lowStockAlert",
                    inKey.flatMap((p) =>
                        p.lowStockAlerts.length ? [p.lowStockAlerts[0]] : [],
                    ),
                    own.lowStockAlert ??
                        effectiveFor(entries, key).lowStockAlert,
                );
                if (warn) suggestions.push(warn);
            }
        }

        return {
            categories: categories.map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                parentId: c.parentId,
                productCount: c._count.products,
            })),
            uncategorizedCount,
            options,
            defaults: {
                entries,
                stillOnDefault: still,
                productCounts,
                suggestions,
            },
            canWrite,
        };
    }

    /**
     * Save the defaults. With `updateExisting`, every saved product whose
     * value for a changed field still equals the OLD default takes the new
     * one — a product with its own value is left alone. Returns the previous
     * rows and exactly what changed, so Undo restores both.
     */
    async saveDefaults(
        organizationId: string,
        dto: SaveDefaultsDto,
    ): Promise<DefaultsSaveResult> {
        await this.assertKeys(organizationId, dto.entries);
        const all = dto.entries.find((e) => e.key === ALL_KEY);
        if (
            all &&
            (all.lowStockAlert === null || all.lowStockAlert === undefined)
        ) {
            throw new BadRequestException({
                message: "All products needs a Warn at level.",
                field: "lowStockAlert",
            });
        }
        for (const e of dto.entries) {
            if (e.returnsMode === "OWN" && !e.returnsText) {
                throw new BadRequestException({
                    message: "Write the returns rule, or use the storefront's.",
                    field: "returnsText",
                });
            }
        }

        const before = await this.entries(organizationId);
        const after: Record<string, DefaultsEntry> = { ...before };
        for (const e of dto.entries) after[e.key] = toEntry(e);

        const updated = dto.updateExisting
            ? await this.productsToUpdate(organizationId, before, after)
            : { products: [], stock: [], next: [] as NextUpdate[] };

        await prisma.$transaction(async (tx) => {
            for (const e of dto.entries) {
                const data = toEntry(e);
                await tx.catalogueDefaults.upsert({
                    where: {
                        organizationId_key: { organizationId, key: e.key },
                    },
                    create: {
                        organizationId,
                        key: e.key,
                        categoryId: e.key === ALL_KEY ? null : e.key,
                        ...data,
                    },
                    update: data,
                });
            }
            for (const u of updated.next) {
                if (u.kind === "product") {
                    await tx.product.update({
                        where: { id: u.id },
                        data: u.data,
                    });
                } else {
                    // Either kind is a StockLevel row (#510).
                    await tx.stockLevel.update({
                        where: { id: u.id },
                        data: { lowStockAlert: u.lowStockAlert },
                    });
                }
            }
        });

        const touched = new Set([
            ...updated.products.map((p) => p.id),
            ...updated.next.map((u) => u.productId),
        ]);
        return {
            entries: after,
            previous: dto.entries.map((e) => ({
                key: e.key,
                ...(before[e.key] ?? EMPTY_ENTRY),
            })),
            updatedCount: touched.size,
            updated: { products: updated.products, stock: updated.stock },
        };
    }

    /** Undo of a save: the rows as they were, and the products as they were. */
    async undoDefaults(organizationId: string, dto: UndoDefaultsDto) {
        await this.assertKeys(organizationId, dto.entries);
        await prisma.$transaction(async (tx) => {
            for (const e of dto.entries) {
                const data = toEntry(e);
                await tx.catalogueDefaults.upsert({
                    where: {
                        organizationId_key: { organizationId, key: e.key },
                    },
                    create: {
                        organizationId,
                        key: e.key,
                        categoryId: e.key === ALL_KEY ? null : e.key,
                        ...data,
                    },
                    update: data,
                });
            }
            for (const p of dto.products) {
                await tx.product.updateMany({
                    where: { id: p.id, organizationId },
                    data: {
                        howToUse: p.howToUse ?? null,
                        returnsMode: p.returnsMode,
                        returnsText: p.returnsText ?? null,
                    },
                });
            }
            // Either kind is a StockLevel row (#510).
            for (const s of dto.stock) {
                await tx.stockLevel.updateMany({
                    where: { id: s.id, organizationId },
                    data: { lowStockAlert: s.lowStockAlert },
                });
            }
        });
        return { entries: await this.entries(organizationId) };
    }

    /** What a new product in `categoryId` starts with (the editor's prefill). */
    async effective(
        organizationId: string,
        categoryId: string | null,
    ): Promise<Effective> {
        return effectiveFor(await this.entries(organizationId), categoryId);
    }

    private async entries(
        organizationId: string,
    ): Promise<Record<string, DefaultsEntry>> {
        const rows = await prisma.catalogueDefaults.findMany({
            where: { organizationId },
            select: {
                key: true,
                howToUse: true,
                lowStockAlert: true,
                returnsMode: true,
                returnsText: true,
            },
        });
        const out: Record<string, DefaultsEntry> = {};
        for (const r of rows) {
            out[r.key] = {
                howToUse: r.howToUse,
                lowStockAlert: r.lowStockAlert,
                returnsMode: r.returnsMode,
                returnsText: r.returnsText,
            };
        }
        return out;
    }

    private async productDefaults(organizationId: string): Promise<
        (ProductDefaults & {
            stockRows: {
                kind: "productStock" | "variantStock";
                id: string;
                lowStockAlert: number;
            }[];
            returnsMode: string;
            returnsText: string | null;
        })[]
    > {
        const rows = await prisma.product.findMany({
            where: { organizationId, status: { not: "ARCHIVED" } },
            select: {
                id: true,
                categoryId: true,
                howToUse: true,
                returnsMode: true,
                returnsText: true,
                // Every storefront's shelf (#510).
                stockLevels: {
                    select: { id: true, lowStockAlert: true, variantId: true },
                    orderBy: { id: "asc" },
                },
            },
        });
        return rows.map((p) => {
            const variantRows = p.stockLevels.flatMap((r) =>
                r.variantId
                    ? [
                          {
                              kind: "variantStock" as const,
                              id: r.id,
                              lowStockAlert: r.lowStockAlert,
                          },
                      ]
                    : [],
            );
            // Per-variant products warn per variant; their product row holds
            // only old promises and its level is not the product's.
            const stockRows =
                variantRows.length > 0
                    ? variantRows
                    : p.stockLevels.map((r) => ({
                          kind: "productStock" as const,
                          id: r.id,
                          lowStockAlert: r.lowStockAlert,
                      }));
            return {
                id: p.id,
                categoryId: p.categoryId,
                howToUse: p.howToUse,
                returns: { mode: p.returnsMode, text: p.returnsText },
                returnsMode: p.returnsMode,
                returnsText: p.returnsText,
                lowStockAlerts: stockRows.map((r) => r.lowStockAlert),
                stockRows,
            };
        });
    }

    private async productsToUpdate(
        organizationId: string,
        before: Record<string, DefaultsEntry>,
        after: Record<string, DefaultsEntry>,
    ): Promise<{
        products: ProductSnapshot[];
        stock: StockSnapshot[];
        next: NextUpdate[];
    }> {
        const products = await this.productDefaults(organizationId);
        const snapshots: ProductSnapshot[] = [];
        const stock: StockSnapshot[] = [];
        const next: NextUpdate[] = [];
        for (const p of products) {
            const old = effectiveFor(before, p.categoryId);
            const now = effectiveFor(after, p.categoryId);
            const data: NextProductData = {};
            if (
                old.howToUse !== now.howToUse &&
                stillOnDefault(p, old, "howToUse")
            ) {
                data.howToUse = now.howToUse;
            }
            if (
                !sameReturns(old.returns, now.returns) &&
                stillOnDefault(p, old, "returns")
            ) {
                data.returnsMode = now.returns.mode;
                data.returnsText = now.returns.text;
            }
            if (Object.keys(data).length > 0) {
                snapshots.push({
                    id: p.id,
                    howToUse: p.howToUse,
                    returnsMode: p.returnsMode,
                    returnsText: p.returnsText,
                });
                next.push({ kind: "product", id: p.id, productId: p.id, data });
            }
            if (
                old.lowStockAlert !== now.lowStockAlert &&
                stillOnDefault(p, old, "lowStockAlert")
            ) {
                for (const row of p.stockRows) {
                    stock.push({
                        kind:
                            row.kind === "productStock" ? "product" : "variant",
                        id: row.id,
                        lowStockAlert: row.lowStockAlert,
                    });
                    next.push({
                        kind: row.kind,
                        id: row.id,
                        productId: p.id,
                        lowStockAlert: now.lowStockAlert,
                    });
                }
            }
        }
        return { products: snapshots, stock, next };
    }

    /** Every key is "all" or one of the business's categories. */
    private async assertKeys(
        organizationId: string,
        entries: DefaultsEntryInput[],
    ): Promise<void> {
        const ids = entries.map((e) => e.key).filter((k) => k !== ALL_KEY);
        if (ids.length === 0) return;
        const found = await prisma.category.count({
            where: { organizationId, id: { in: ids } },
        });
        if (found !== new Set(ids).size) {
            throw new BadRequestException({
                message: "Unknown category in the defaults",
                field: "entries",
            });
        }
    }
}

interface NextProductData {
    howToUse?: string | null;
    returnsMode?: string;
    returnsText?: string | null;
}

type NextUpdate =
    | { kind: "product"; id: string; productId: string; data: NextProductData }
    | {
          kind: "productStock" | "variantStock";
          id: string;
          productId: string;
          lowStockAlert: number;
      };

function toEntry(e: DefaultsEntryInput): DefaultsEntry {
    return {
        howToUse: e.howToUse ?? null,
        lowStockAlert: e.lowStockAlert ?? null,
        returnsMode: e.returnsMode ?? null,
        returnsText: e.returnsMode === "OWN" ? (e.returnsText ?? null) : null,
    };
}
