/**
 * #529 backfill — catalogue settings move to the business (ADR-010).
 *
 * Categories, options, custom fields, catalogue defaults and allergens were
 * kept per storefront. A business now has one list of each, so where two of
 * its storefronts both have "Breads" (by slug) or "Size" (by name), they
 * become one, and everything that named the one that goes is re-pointed:
 * products, discount categories, field categories, defaults, sub-categories,
 * variants' option values, product and customer-note allergens.
 *
 * What does not merge:
 * - categories under different parents (a "Tops" under Men and one under
 *   Women stay two);
 * - a category a live discount code names — merging it would let the code
 *   reach another storefront's products;
 * - custom fields of different types.
 * Each of those keeps its own row, renamed with its storefront's name so the
 * business can tell them apart, and is listed in the report. So is every
 * value a merge threw away (a default the first storefront's row overrode, a
 * field's differing "show on shop") and every storefront whose SKU pattern
 * differed from the one the business kept (the migration copied the oldest).
 *
 * Idempotent: a second run finds nothing to merge or rename and changes
 * nothing. Each business runs in its own transaction.
 *
 * It reads and writes only columns that exist before and after
 * `20261001100000_catalogue_settings_to_business`, so it can run on either
 * side of that migration (the migration refuses to run while duplicates
 * remain).
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/catalogue-settings.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

import type { TransactionClient } from "../transaction";

type Kind = "category" | "option" | "field" | "allergen";

export interface CatalogueBackfillReport {
    /** Businesses looked at. */
    organizations: number;
    merged: {
        kind: Kind;
        organizationId: string;
        name: string;
        into: string;
        from: string[];
    }[];
    keptApart: {
        kind: Kind;
        organizationId: string;
        id: string;
        was: { name: string; slug?: string };
        now: { name: string; slug?: string };
        reason:
            | "different-parent"
            | "live-discount"
            | "different-type"
            | "same-name";
    }[];
    /** Values a merge overrode: the first storefront's row won. */
    discarded: {
        organizationId: string;
        what: string;
        value: string;
        from: string;
    }[];
    skuPatterns: {
        organizationId: string;
        storeId: string;
        pattern: string | null;
        suggest: boolean;
    }[];
}

interface Ranked {
    id: string;
    storeId: string | null;
    createdAt: Date;
}

/** The first storefront's row first; rows made at the business before any. */
function byStoreOrder<T extends Ranked>(rank: Map<string, number>) {
    return (a: T, b: T) =>
        (a.storeId ? (rank.get(a.storeId) ?? 1e9) : -1) -
            (b.storeId ? (rank.get(b.storeId) ?? 1e9) : -1) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id);
}

const key = (s: string) => s.trim().toLowerCase();

function groupBy<T>(rows: T[], by: (row: T) => string): T[][] {
    const out = new Map<string, T[]>();
    for (const r of rows) out.set(by(r), [...(out.get(by(r)) ?? []), r]);
    return Array.from(out.values());
}

export async function backfillCatalogueSettings(
    db: PrismaClient,
    now: Date = new Date(),
): Promise<CatalogueBackfillReport> {
    const report: CatalogueBackfillReport = {
        organizations: 0,
        merged: [],
        keptApart: [],
        discarded: [],
        skuPatterns: [],
    };
    const orgs = await db.organization.findMany({
        select: { id: true },
        orderBy: { id: "asc" },
    });
    for (const org of orgs) {
        report.organizations += 1;
        await db.$transaction(
            async (tx) => {
                const stores = await tx.store.findMany({
                    where: { organizationId: org.id },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    select: { id: true, name: true, slug: true },
                });
                const ctx: OrgRun = {
                    tx,
                    organizationId: org.id,
                    rank: new Map(stores.map((s, i) => [s.id, i])),
                    stores: new Map(stores.map((s) => [s.id, s])),
                    report,
                    now,
                };
                await mergeCategories(ctx);
                await mergeDefaults(ctx);
                await mergeOptions(ctx);
                await mergeFields(ctx);
                await mergeAllergens(ctx);
                await reportSkuPatterns(ctx);
            },
            { timeout: 120_000 },
        );
    }
    return report;
}

interface OrgRun {
    tx: TransactionClient;
    organizationId: string;
    rank: Map<string, number>;
    stores: Map<string, { id: string; name: string; slug: string }>;
    report: CatalogueBackfillReport;
    now: Date;
}

function storeName(ctx: OrgRun, storeId: string | null): string {
    return (
        (storeId ? ctx.stores.get(storeId)?.name : undefined) ??
        "earlier storefront"
    );
}

// ---- Categories ----

interface CategoryRow extends Ranked {
    name: string;
    slug: string;
    parentId: string | null;
}

async function categoriesOf(ctx: OrgRun): Promise<CategoryRow[]> {
    const rows = await ctx.tx.category.findMany({
        where: { organizationId: ctx.organizationId },
        select: {
            id: true,
            storeId: true,
            createdAt: true,
            name: true,
            slug: true,
            parentId: true,
        },
    });
    return rows.sort(byStoreOrder(ctx.rank));
}

/**
 * Same slug, same parent, no live discount code naming either: one
 * category. Parents first, so their children then share a parent and merge
 * in the next pass.
 */
async function mergeCategories(ctx: OrgRun): Promise<void> {
    const live = await ctx.tx.discountCategory.findMany({
        where: {
            category: { organizationId: ctx.organizationId },
            discount: { OR: [{ endsAt: null }, { endsAt: { gt: ctx.now } }] },
        },
        select: { categoryId: true },
    });
    const covered = new Set(live.map((d) => d.categoryId));

    for (let pass = 0; pass < 50; pass++) {
        const rows = await categoriesOf(ctx);
        let merged = false;
        for (const group of groupBy(rows, (c) => c.slug)) {
            if (group.length < 2) continue;
            const free = group.filter((c) => !covered.has(c.id));
            for (const same of groupBy(free, (c) => c.parentId ?? "")) {
                if (same.length < 2) continue;
                const [winner, ...losers] = same;
                for (const loser of losers)
                    await mergeCategory(ctx, loser, winner);
                ctx.report.merged.push({
                    kind: "category",
                    organizationId: ctx.organizationId,
                    name: winner.name,
                    into: winner.id,
                    from: losers.map((l) => l.id),
                });
                merged = true;
            }
        }
        if (!merged) break;
    }

    // Whatever still shares a slug or a name stays apart, under a name that
    // says which storefront it came from.
    const rows = await categoriesOf(ctx);
    const slugs = new Set(rows.map((c) => c.slug));
    const names = new Set<string>();
    const seenSlug = new Set<string>();
    for (const c of rows) {
        const slugTaken = seenSlug.has(c.slug);
        const nameTaken = names.has(key(c.name));
        seenSlug.add(c.slug);
        if (!slugTaken && !nameTaken) {
            names.add(key(c.name));
            continue;
        }
        const suffix = ctx.stores.get(c.storeId ?? "")?.slug ?? "earlier";
        let slug = c.slug;
        if (slugTaken) {
            slug = `${c.slug}-${suffix}`;
            for (let n = 2; slugs.has(slug); n++) {
                slug = `${c.slug}-${suffix}-${n}`;
            }
            slugs.add(slug);
        }
        let name = c.name;
        if (nameTaken || slugTaken) {
            name = `${c.name} (${storeName(ctx, c.storeId)})`;
            for (let n = 2; names.has(key(name)); n++) {
                name = `${c.name} (${storeName(ctx, c.storeId)} ${n})`;
            }
        }
        names.add(key(name));
        seenSlug.add(slug);
        await ctx.tx.category.update({
            where: { id: c.id },
            data: { name, slug },
        });
        const twin = rows.find(
            (o) =>
                o.id !== c.id &&
                (o.slug === c.slug || key(o.name) === key(c.name)),
        );
        ctx.report.keptApart.push({
            kind: "category",
            organizationId: ctx.organizationId,
            id: c.id,
            was: { name: c.name, slug: c.slug },
            now: { name, slug },
            reason: !slugTaken
                ? "same-name"
                : covered.has(c.id) || (twin && covered.has(twin.id))
                  ? "live-discount"
                  : "different-parent",
        });
    }
}

async function mergeCategory(
    ctx: OrgRun,
    loser: CategoryRow,
    winner: CategoryRow,
): Promise<void> {
    const { tx } = ctx;
    await tx.product.updateMany({
        where: { categoryId: loser.id },
        data: { categoryId: winner.id },
    });
    await tx.category.updateMany({
        where: { parentId: loser.id },
        data: { parentId: winner.id },
    });

    const discounts = await tx.discountCategory.findMany({
        where: { categoryId: loser.id },
        select: { discountId: true },
    });
    await tx.discountCategory.createMany({
        data: discounts.map((d) => ({
            discountId: d.discountId,
            categoryId: winner.id,
        })),
        skipDuplicates: true,
    });
    await tx.discountCategory.deleteMany({ where: { categoryId: loser.id } });

    const fields = await tx.productFieldCategory.findMany({
        where: { categoryId: loser.id },
        select: { fieldId: true },
    });
    await tx.productFieldCategory.createMany({
        data: fields.map((f) => ({
            fieldId: f.fieldId,
            categoryId: winner.id,
        })),
        skipDuplicates: true,
    });
    await tx.productFieldCategory.deleteMany({
        where: { categoryId: loser.id },
    });

    // The category's own defaults: the winner's row wins if it has one.
    const [kept, gone] = await Promise.all([
        tx.catalogueDefaults.findFirst({
            where: { organizationId: ctx.organizationId, key: winner.id },
        }),
        tx.catalogueDefaults.findFirst({
            where: { organizationId: ctx.organizationId, key: loser.id },
        }),
    ]);
    if (gone && kept) {
        noteDiscarded(ctx, `defaults for ${winner.name}`, kept, gone);
        await tx.catalogueDefaults.delete({ where: { id: gone.id } });
    } else if (gone) {
        await tx.catalogueDefaults.update({
            where: { id: gone.id },
            data: { key: winner.id, categoryId: winner.id },
        });
    }

    await tx.category.delete({ where: { id: loser.id } });
}

// ---- Defaults ----

interface DefaultsRow {
    id: string;
    storeId: string | null;
    createdAt?: Date;
    howToUse: string | null;
    lowStockAlert: number | null;
    returnsMode: string | null;
    returnsText: string | null;
}

function noteDiscarded(
    ctx: OrgRun,
    what: string,
    kept: DefaultsRow,
    gone: DefaultsRow,
): void {
    for (const field of [
        "howToUse",
        "lowStockAlert",
        "returnsMode",
        "returnsText",
    ] as const) {
        const value = gone[field];
        if (value === null || value === kept[field]) continue;
        ctx.report.discarded.push({
            organizationId: ctx.organizationId,
            what: `${what}: ${field}`,
            value: String(value),
            from: storeName(ctx, gone.storeId),
        });
    }
}

/** "All products" (and any key left twice): the first storefront's row wins. */
async function mergeDefaults(ctx: OrgRun): Promise<void> {
    const rows = await ctx.tx.catalogueDefaults.findMany({
        where: { organizationId: ctx.organizationId },
    });
    const ranked = rows
        .map((r) => ({ ...r, createdAt: r.updatedAt }))
        .sort(byStoreOrder(ctx.rank));
    for (const group of groupBy(ranked, (r) => r.key)) {
        const [kept, ...gone] = group;
        for (const g of gone) {
            noteDiscarded(
                ctx,
                g.key === "all" ? "defaults for all products" : "defaults",
                kept,
                g,
            );
            await ctx.tx.catalogueDefaults.delete({ where: { id: g.id } });
        }
    }
}

// ---- Options ----

async function mergeOptions(ctx: OrgRun): Promise<void> {
    const { tx } = ctx;
    const rows = await tx.productOption.findMany({
        where: { organizationId: ctx.organizationId },
        select: {
            id: true,
            storeId: true,
            createdAt: true,
            name: true,
            values: {
                orderBy: { position: "asc" },
                select: { id: true, value: true },
            },
        },
    });
    for (const group of groupBy(rows.sort(byStoreOrder(ctx.rank)), (o) =>
        key(o.name),
    )) {
        if (group.length < 2) continue;
        const [winner, ...losers] = group;
        const values = new Map(winner.values.map((v) => [key(v.value), v.id]));
        let position = winner.values.length;
        for (const loser of losers) {
            for (const v of loser.values) {
                const same = values.get(key(v.value));
                if (same) {
                    await tx.productVariant.updateMany({
                        where: { optionValueId: v.id },
                        data: { optionValueId: same },
                    });
                    await tx.productOptionValue.delete({ where: { id: v.id } });
                } else {
                    // The union: a value only the other storefront had joins.
                    await tx.productOptionValue.update({
                        where: { id: v.id },
                        data: { optionId: winner.id, position: position++ },
                    });
                    values.set(key(v.value), v.id);
                }
            }
            await tx.product.updateMany({
                where: { optionId: loser.id },
                data: { optionId: winner.id },
            });
            await tx.productOption.delete({ where: { id: loser.id } });
        }
        ctx.report.merged.push({
            kind: "option",
            organizationId: ctx.organizationId,
            name: winner.name,
            into: winner.id,
            from: losers.map((l) => l.id),
        });
    }
}

// ---- Custom fields ----

async function mergeFields(ctx: OrgRun): Promise<void> {
    const { tx } = ctx;
    const rows = await tx.productField.findMany({
        where: { organizationId: ctx.organizationId, deletedAt: null },
        select: {
            id: true,
            storeId: true,
            createdAt: true,
            name: true,
            type: true,
            onShop: true,
        },
    });
    const names = new Set(rows.map((f) => key(f.name)));
    for (const group of groupBy(rows.sort(byStoreOrder(ctx.rank)), (f) =>
        key(f.name),
    )) {
        if (group.length < 2) continue;
        const [winner] = group;
        const losers = group.slice(1).filter((f) => f.type === winner.type);
        for (const f of group.slice(1).filter((f) => f.type !== winner.type)) {
            // A number and a text field can't share values: two fields.
            let name = `${f.name} (${storeName(ctx, f.storeId)})`;
            for (let n = 2; names.has(key(name)); n++) {
                name = `${f.name} (${storeName(ctx, f.storeId)} ${n})`;
            }
            names.add(key(name));
            await tx.productField.update({
                where: { id: f.id },
                data: { name },
            });
            ctx.report.keptApart.push({
                kind: "field",
                organizationId: ctx.organizationId,
                id: f.id,
                was: { name: f.name },
                now: { name },
                reason: "different-type",
            });
        }
        for (const loser of losers) {
            if (loser.onShop !== winner.onShop) {
                ctx.report.discarded.push({
                    organizationId: ctx.organizationId,
                    what: `${winner.name}: show on the shop`,
                    value: String(loser.onShop),
                    from: storeName(ctx, loser.storeId),
                });
            }
            const values = await tx.productFieldValue.findMany({
                where: { fieldId: loser.id },
                select: {
                    productId: true,
                    organizationId: true,
                    value: true,
                },
            });
            await tx.productFieldValue.createMany({
                data: values.map((v) => ({ ...v, fieldId: winner.id })),
                skipDuplicates: true,
            });
            const categories = await tx.productFieldCategory.findMany({
                where: { fieldId: loser.id },
                select: { categoryId: true },
            });
            await tx.productFieldCategory.createMany({
                data: categories.map((c) => ({
                    fieldId: winner.id,
                    categoryId: c.categoryId,
                })),
                skipDuplicates: true,
            });
            // Its values and category links cascade with it; copies are kept.
            await tx.productField.delete({ where: { id: loser.id } });
        }
        if (losers.length > 0) {
            ctx.report.merged.push({
                kind: "field",
                organizationId: ctx.organizationId,
                name: winner.name,
                into: winner.id,
                from: losers.map((l) => l.id),
            });
        }
    }
}

// ---- Allergens ----

async function mergeAllergens(ctx: OrgRun): Promise<void> {
    const { tx } = ctx;
    const rows = await tx.storeAllergen.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, storeId: true, createdAt: true, name: true },
    });
    for (const group of groupBy(rows.sort(byStoreOrder(ctx.rank)), (a) =>
        key(a.name),
    )) {
        if (group.length < 2) continue;
        const [winner, ...losers] = group;
        for (const loser of losers) {
            const onProducts = await tx.productAllergen.findMany({
                where: { allergenId: loser.id },
                select: { productId: true, organizationId: true, kind: true },
            });
            await tx.productAllergen.createMany({
                data: onProducts.map((p) => ({ ...p, allergenId: winner.id })),
                skipDuplicates: true,
            });
            await tx.productAllergen.deleteMany({
                where: { allergenId: loser.id },
            });
            const inNotes = await tx.contactNoteAllergen.findMany({
                where: { allergenId: loser.id },
                select: { noteId: true, organizationId: true },
            });
            await tx.contactNoteAllergen.createMany({
                data: inNotes.map((n) => ({ ...n, allergenId: winner.id })),
                skipDuplicates: true,
            });
            await tx.contactNoteAllergen.deleteMany({
                where: { allergenId: loser.id },
            });
            await tx.storeAllergen.delete({ where: { id: loser.id } });
        }
        ctx.report.merged.push({
            kind: "allergen",
            organizationId: ctx.organizationId,
            name: winner.name,
            into: winner.id,
            from: losers.map((l) => l.id),
        });
    }
}

// ---- SKU pattern ----

/** The migration kept the oldest storefront's; list any that differed. */
async function reportSkuPatterns(ctx: OrgRun): Promise<void> {
    const settings = await ctx.tx.storeSettings.findMany({
        where: {
            store: { organizationId: ctx.organizationId },
            OR: [{ skuPattern: { not: null } }, { skuSuggest: false }],
        },
        select: { storeId: true, skuPattern: true, skuSuggest: true },
    });
    const ranked = settings.sort(
        (a, b) =>
            (ctx.rank.get(a.storeId) ?? 1e9) - (ctx.rank.get(b.storeId) ?? 1e9),
    );
    const [first, ...rest] = ranked;
    for (const s of rest) {
        if (
            s.skuPattern === first.skuPattern &&
            s.skuSuggest === first.skuSuggest
        )
            continue;
        ctx.report.skuPatterns.push({
            organizationId: ctx.organizationId,
            storeId: s.storeId,
            pattern: s.skuPattern,
            suggest: s.skuSuggest,
        });
    }
}
