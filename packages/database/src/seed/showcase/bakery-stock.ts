import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { listProductAt } from "../helpers";
import type { CategoryKey, StoreKey } from "./bakery-catalogue";
import { COLLECTIONS, OPTIONS, P, PRODUCTS, ryeId } from "./bakery-catalogue";
import { istAt } from "./people";

/**
 * Rye & Co.'s shelves (#526): the designs' stock, per storefront, with a
 * stock log that adds up to it.
 *
 * STRUCTURE — the options, each product's variants, where it is sold and a
 * shelf per product (or variant) and storefront — is upserted on seeded ids.
 *
 * The STOCK LOG is written whole each run, like the orders it follows: the
 * business's entries and resolved checks are removed first (Rye is a film
 * set; see `clearVolume`). It opens LOG_DAYS ago with a count on every shelf,
 * then each day's bakes, deliveries, the orders' sales, a move between the
 * storefronts, day-old waste and this morning's counts, in time order, and
 * ends on the shelf's on hand — each entry's before + quantity = after.
 * The numbers are the designs': a Cinnamon bun six-pack 2 short at Hill
 * Road, the Rye & caraway loaf and the 1kg beans out, the 250g whole beans
 * low at Hill Road, the rest healthy. Three checks open: that short, a count
 * made while a sale came in ("Count didn't match"), and yesterday's loaf
 * sold at the counter without leaving stock ("Sale not taken").
 */

export type Stores = Record<StoreKey, string>;

/** How many days ago the log opens; the products count stock since. */
export const LOG_DAYS = 5;
/** When Track stock went on for the counted products. */
export const trackedSince = (now: Date) => istAt(now, -LOG_DAYS, 5 * 60 + 30);
const openingAt = (now: Date) => istAt(now, -LOG_DAYS, 5 * 60 + 45);

type Who = "owner" | "nisha";

interface ShelfSpec {
    key: string;
    slug: string;
    /** The variant it counts; null: the product as a whole. */
    variant: number | null;
    store: StoreKey;
    /** Fresh: baked each morning (up to `par`); goods: delivered once. */
    kind: "fresh" | "goods";
    /** On hand now, after everything in the log. */
    onHand: number;
    warnAt: number;
    /** What the log opens on. */
    opening: number;
    /** Fresh: what each morning's bake tops the shelf up to; none: not baked daily. */
    par?: number;
    /** Day-old thrown out at closing: [days ago, at most]. */
    waste?: readonly [number, number][];
    count?: {
        day: number;
        minute: number;
        diff: number;
        by: Who;
        /** Shown one more than the log held: a sale landed mid-count. */
        stale?: boolean;
    };
    /** The note on this morning's bake. */
    todayNote?: string;
}

export const SHELVES: readonly ShelfSpec[] = [
    // Hill Road
    {
        key: "sd800-h",
        slug: "sourdough-loaf",
        variant: 0,
        store: "H",
        kind: "fresh",
        onHand: 14,
        warnAt: 6,
        opening: 3,
        par: 16,
        waste: [
            [-4, 3],
            [-2, 2],
        ],
        count: {
            day: 0,
            minute: 7 * 60 + 10,
            diff: -1,
            by: "nisha",
            stale: true,
        },
    },
    {
        key: "cb1-h",
        slug: "cinnamon-bun",
        variant: 0,
        store: "H",
        kind: "fresh",
        onHand: 12,
        warnAt: 6,
        opening: 4,
        par: 14,
        waste: [
            [-3, 2],
            [-1, 1],
        ],
    },
    {
        key: "cb6-h",
        slug: "cinnamon-bun",
        variant: 1,
        store: "H",
        kind: "fresh",
        onHand: 1,
        warnAt: 2,
        opening: 0,
        todayNote: "Only one tray of six",
    },
    {
        key: "ac1-h",
        slug: "almond-croissant",
        variant: 0,
        store: "H",
        kind: "fresh",
        onHand: 12,
        warnAt: 6,
        opening: 2,
        par: 12,
        waste: [[-2, 2]],
    },
    {
        key: "ac4-h",
        slug: "almond-croissant",
        variant: 1,
        store: "H",
        kind: "fresh",
        onHand: 5,
        warnAt: 2,
        opening: 5,
    },
    {
        key: "rc-h",
        slug: "rye-caraway-loaf",
        variant: null,
        store: "H",
        kind: "fresh",
        onHand: 0,
        warnAt: 4,
        opening: 2,
        par: 6,
        waste: [[-3, 2]],
    },
    {
        key: "foc-h",
        slug: "focaccia-rosemary",
        variant: null,
        store: "H",
        kind: "fresh",
        onHand: 9,
        warnAt: 4,
        opening: 0,
        par: 9,
        waste: [
            [-3, 3],
            [-1, 2],
        ],
    },
    {
        key: "hbw-h",
        slug: "house-blend-beans-250g",
        variant: 0,
        store: "H",
        kind: "goods",
        onHand: 1,
        warnAt: 3,
        opening: 0,
        count: { day: -1, minute: 18 * 60 + 5, diff: 0, by: "owner" },
    },
    {
        key: "hbe-h",
        slug: "house-blend-beans-250g",
        variant: 1,
        store: "H",
        kind: "goods",
        onHand: 4,
        warnAt: 3,
        opening: 0,
    },
    {
        key: "hbf-h",
        slug: "house-blend-beans-250g",
        variant: 2,
        store: "H",
        kind: "goods",
        onHand: 5,
        warnAt: 3,
        opening: 0,
    },
    // Online
    {
        key: "sd800-o",
        slug: "sourdough-loaf",
        variant: 0,
        store: "O",
        kind: "fresh",
        onHand: 8,
        warnAt: 6,
        opening: 4,
        par: 6,
        count: { day: 0, minute: 7 * 60 + 12, diff: 0, by: "nisha" },
    },
    {
        key: "sd400-o",
        slug: "sourdough-loaf",
        variant: 1,
        store: "O",
        kind: "fresh",
        onHand: 10,
        warnAt: 4,
        opening: 2,
        par: 10,
        count: { day: 0, minute: 7 * 60 + 12, diff: 0, by: "nisha" },
    },
    {
        key: "hbw-o",
        slug: "house-blend-beans-250g",
        variant: 0,
        store: "O",
        kind: "goods",
        onHand: 8,
        warnAt: 3,
        opening: 0,
    },
    {
        key: "hbe-o",
        slug: "house-blend-beans-250g",
        variant: 1,
        store: "O",
        kind: "goods",
        onHand: 5,
        warnAt: 3,
        opening: 0,
    },
    {
        key: "hbf-o",
        slug: "house-blend-beans-250g",
        variant: 2,
        store: "O",
        kind: "goods",
        onHand: 4,
        warnAt: 3,
        opening: 0,
    },
    {
        key: "hb1-o",
        slug: "house-blend-beans-1kg",
        variant: 0,
        store: "O",
        kind: "goods",
        onHand: 0,
        warnAt: 3,
        opening: 0,
    },
];

/** Stock moved between the storefronts: two entries sharing a pair id. */
const MOVES = [
    { from: "sd800-h", to: "sd800-o", qty: 2, day: -1, minute: 14 * 60 + 5 },
] as const;

// --- Structure ------------------------------------------------------------------

/** The business's options and their values; returns each option's ids. */
export async function writeOptions(
    prisma: Db,
    orgId: string,
): Promise<Record<string, { id: string; values: string[] }>> {
    const out: Record<string, { id: string; values: string[] }> = {};
    for (let i = 0; i < OPTIONS.length; i++) {
        const o = OPTIONS[i];
        const option = await prisma.productOption.upsert({
            where: {
                organizationId_name: { organizationId: orgId, name: o.name },
            },
            update: { position: i },
            create: {
                id: ryeId("option", o.key),
                organizationId: orgId,
                name: o.name,
                position: i,
            },
        });
        const values: string[] = [];
        for (let k = 0; k < o.values.length; k++) {
            const row = await prisma.productOptionValue.upsert({
                where: {
                    optionId_value: { optionId: option.id, value: o.values[k] },
                },
                update: { position: k },
                create: {
                    id: ryeId("optionvalue", o.key, k),
                    optionId: option.id,
                    organizationId: orgId,
                    value: o.values[k],
                    position: k,
                },
            });
            values.push(row.id);
        }
        out[o.key] = { id: option.id, values };
    }
    return out;
}

const rupees = (whole: number) => `${whole}.00`;

/**
 * Each product's variants and its listings: at each of its storefronts, with
 * the variants sold there. Returns the variant ids, [product][variant].
 */
export async function writeVariantsAndListings(
    prisma: Db,
    a: {
        orgId: string;
        stores: Stores;
        productIds: readonly string[];
        options: Record<string, { id: string; values: string[] }>;
    },
): Promise<string[][]> {
    const variantIds: string[][] = [];
    for (let i = 0; i < PRODUCTS.length; i++) {
        const p = PRODUCTS[i];
        const ids: string[] = [];
        const option = p.option ? a.options[p.option] : undefined;
        const spec = OPTIONS.find((o) => o.key === p.option);
        for (let v = 0; v < (p.variants ?? []).length; v++) {
            const variant = (p.variants ?? [])[v];
            const valueAt = spec
                ? (spec.values as readonly string[]).indexOf(variant.value)
                : -1;
            const data = {
                title: variant.value,
                price:
                    variant.price === undefined ? null : rupees(variant.price),
                optionValueId:
                    option && valueAt >= 0 ? option.values[valueAt] : null,
                position: v,
            };
            const row = await prisma.productVariant.upsert({
                where: {
                    productId_sku: {
                        productId: a.productIds[i],
                        sku: variant.sku,
                    },
                },
                update: data,
                create: {
                    id: ryeId("variant", i, v),
                    productId: a.productIds[i],
                    sku: variant.sku,
                    ...data,
                },
            });
            ids.push(row.id);
        }
        variantIds.push(ids);
        for (const store of p.stores ?? ["H"]) {
            const sold = p.variantsAt?.[store] ?? ids.map((_, v) => v);
            await listProductAt(prisma, {
                id:
                    store === "H"
                        ? ryeId("listing", i)
                        : ryeId("listing", i, "online"),
                orgId: a.orgId,
                storeId: a.stores[store],
                productId: a.productIds[i],
                variants: sold.map((v) => ({
                    id:
                        store === "H"
                            ? ryeId("listingvariant", i, v)
                            : ryeId("listingvariant", i, v, "online"),
                    variantId: ids[v],
                })),
            });
        }
    }
    return variantIds;
}

/**
 * Every shelf, found or made at 0 (the uniques are partial, so found and
 * then created), and any other shelf in the business removed: the film set
 * counts only these. Returns each shelf's id by key.
 */
export async function ensureShelves(
    prisma: Db,
    a: {
        orgId: string;
        stores: Stores;
        productIds: readonly string[];
        variantIds: readonly string[][];
    },
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const s of SHELVES) {
        const i = P[s.slug];
        const productId = a.productIds[i];
        const variantId =
            s.variant === null ? null : a.variantIds[i][s.variant];
        const storeId = a.stores[s.store];
        const found = await prisma.stockLevel.findFirst({
            where: { storeId, productId, variantId },
            select: { id: true },
        });
        if (found) {
            out.set(s.key, found.id);
            continue;
        }
        const id = ryeId("stocklevel", s.key);
        await prisma.stockLevel.create({
            data: {
                id,
                organizationId: a.orgId,
                storeId,
                productId,
                variantId,
                onHand: 0,
                promised: 0,
                lowStockAlert: s.warnAt,
            },
        });
        out.set(s.key, id);
    }
    await prisma.stockLevel.deleteMany({
        where: {
            organizationId: a.orgId,
            id: { notIn: Array.from(out.values()) },
        },
    });
    return out;
}

// --- The log ----------------------------------------------------------------------

/** One order line, as the shelves see it. */
export interface LineForStock {
    itemId: string;
    orderId: string;
    product: number;
    variant: number | null;
    qty: number;
    store: StoreKey;
    /** Placed and not yet fulfilled or cancelled: it holds its units. */
    open: boolean;
    /** When it left the shelf — collected, or handed to the courier. */
    fulfilledAt: Date | null;
    fulfilledBy: string | null;
    /** Fulfilled without leaving stock: a "Sale not taken" check. */
    notTaken?: boolean;
}

export interface ItemStock {
    stockRow: "PRODUCT" | "VARIANT" | "NONE";
    stockLevelId: string | null;
    heldQuantity: number;
    soldQuantity: number;
}

export interface StockPlan {
    items: Map<string, ItemStock>;
    levels: {
        id: string;
        onHand: number;
        promised: number;
        lowStockAlert: number;
    }[];
    entries: Prisma.StockEntryCreateManyInput[];
}

type Kind = Prisma.StockEntryCreateManyInput["kind"];

interface Event {
    at: Date;
    /** Ties at one instant: open, deliver, bake, count, sell, move, waste. */
    rank: number;
    kind: Kind;
    /** A fixed change; null: worked out when the walk reaches it. */
    qty: number | null;
    work?: (balance: number) => number;
    by: string | null;
    note?: string | null;
    orderId?: string;
    pairId?: string;
    count?: { stale: boolean };
}

const NONE: ItemStock = {
    stockRow: "NONE",
    stockLevelId: null,
    heldQuantity: 0,
    soldQuantity: 0,
};

const shelfOf = (line: {
    product: number;
    variant: number | null;
    store: StoreKey;
}) => {
    const p = PRODUCTS[line.product];
    if (!p.tracked) return null;
    const shelf = SHELVES.find(
        (s) =>
            s.slug === p.slug &&
            s.store === line.store &&
            s.variant === (p.variants ? line.variant : null),
    );
    if (!shelf) {
        throw new Error(
            `Rye & Co. sells ${p.name} (variant ${line.variant}) at ${line.store} with no shelf for it`,
        );
    }
    return shelf;
};

/**
 * Hold, sell and log: which shelf each line holds or sold from, each
 * shelf's promised, and the entries that take it from its opening count to
 * its on hand. `today` lays a minute of today on the same clock as today's
 * orders, so a bake, a count and a sale keep their order at any hour.
 */
export function planStock(a: {
    now: Date;
    today: (minute: number) => Date;
    orgId: string;
    stores: Stores;
    productIds: readonly string[];
    variantIds: readonly string[][];
    shelfIds: Map<string, string>;
    owner: string;
    nisha: string;
    lines: readonly LineForStock[];
}): StockPlan {
    const opening = openingAt(a.now);
    const who = (w: Who) => (w === "owner" ? a.owner : a.nisha);
    const at = (day: number, minute: number) =>
        day === 0 ? a.today(minute) : istAt(a.now, day, minute);

    const items = new Map<string, ItemStock>();
    const events = new Map<string, Event[]>(SHELVES.map((s) => [s.key, []]));
    const promised = new Map<string, number>();
    for (const line of a.lines) {
        const shelf = shelfOf(line);
        // When it left the shelf, if the log has it: fulfilled since the log
        // opened, and taken off stock.
        const soldAt =
            !line.open &&
            line.fulfilledAt &&
            line.fulfilledAt >= opening &&
            !line.notTaken
                ? line.fulfilledAt
                : null;
        if (!shelf || (!line.open && !soldAt)) {
            items.set(line.itemId, NONE);
            continue;
        }
        const stockLevelId = a.shelfIds.get(shelf.key) ?? null;
        const stockRow = shelf.variant === null ? "PRODUCT" : "VARIANT";
        if (line.open) {
            items.set(line.itemId, {
                stockRow,
                stockLevelId,
                heldQuantity: line.qty,
                soldQuantity: 0,
            });
            promised.set(shelf.key, (promised.get(shelf.key) ?? 0) + line.qty);
            continue;
        }
        items.set(line.itemId, {
            stockRow,
            stockLevelId,
            heldQuantity: 0,
            soldQuantity: line.qty,
        });
        if (!soldAt) continue;
        events.get(shelf.key)?.push({
            at: soldAt,
            rank: 4,
            kind: "SOLD",
            qty: -line.qty,
            by: line.fulfilledBy,
            orderId: line.orderId,
        });
    }
    MOVES.forEach((m, k) => {
        const when = at(m.day, m.minute);
        const pairId = ryeId("stockpair", k);
        events.get(m.from)?.push({
            at: when,
            rank: 5,
            kind: "MOVED",
            qty: -m.qty,
            by: a.owner,
            pairId,
        });
        events.get(m.to)?.push({
            at: when,
            rank: 5,
            kind: "MOVED",
            qty: m.qty,
            by: a.owner,
            pairId,
        });
    });

    const entries: Prisma.StockEntryCreateManyInput[] = [];
    const levels: StockPlan["levels"] = [];
    for (const s of SHELVES) {
        const list = events.get(s.key) ?? [];
        if (s.count) {
            list.push({
                at: at(s.count.day, s.count.minute),
                rank: 3,
                kind: "COUNTED",
                qty: s.count.diff,
                by: who(s.count.by),
                count: { stale: s.count.stale ?? false },
            });
        }
        const fixed = list.reduce((sum, e) => sum + (e.qty ?? 0), 0);
        // Every shelf opens its log — a count of 0 only where nothing else
        // would (a shelf with no entries is opened again on every run by
        // `balanceStockLog`, with a new id).
        const opens =
            s.opening > 0 || (s.kind === "goods" && s.onHand - fixed === 0);
        if (opens) {
            list.push({
                at: opening,
                rank: 0,
                kind: "COUNTED",
                qty: s.opening,
                by: a.owner,
                note: "Opening count",
            });
        }
        if (s.kind === "goods") {
            const delivered = s.onHand - s.opening - fixed;
            if (delivered < 0) {
                throw new Error(
                    `Rye & Co.'s ${s.key} sells more than it ever had`,
                );
            }
            if (delivered > 0) {
                list.push({
                    at: istAt(a.now, -LOG_DAYS + 1, 9 * 60),
                    rank: 1,
                    kind: "RECEIVED",
                    qty: delivered,
                    by: a.owner,
                    note: "Kaapi Roasters delivery",
                });
            }
        } else {
            for (let d = -LOG_DAYS; d <= -1; d++) {
                const par = s.par;
                if (par !== undefined) {
                    list.push({
                        at: istAt(a.now, d, 6 * 60 + 30),
                        rank: 2,
                        kind: "BAKED",
                        qty: null,
                        work: (b) => Math.max(0, par - b),
                        by: a.owner,
                    });
                }
                const most = s.waste?.find(([day]) => day === d)?.[1];
                if (most !== undefined) {
                    list.push({
                        at: istAt(a.now, d, 20 * 60 + 30),
                        rank: 6,
                        kind: "WASTED",
                        qty: null,
                        work: (b) => -Math.min(b, most),
                        by: a.nisha,
                        note: "Day-old",
                    });
                }
            }
            // This morning: bake what the day needs, or throw out what it doesn't.
            const bakeAt = a.today(6 * 60 + 30);
            const later = list
                .filter((e) => e.qty !== null && e.at > bakeAt)
                .reduce((sum, e) => sum + (e.qty ?? 0), 0);
            list.push({
                at: bakeAt,
                rank: 2,
                kind: "BAKED",
                qty: null,
                work: (b) => s.onHand - later - b,
                by: a.owner,
                note: s.todayNote ?? null,
            });
        }

        list.sort((x, y) => x.at.getTime() - y.at.getTime() || x.rank - y.rank);
        let balance = 0;
        let n = 0;
        for (const e of list) {
            const qty = e.qty ?? (e.work ? e.work(balance) : 0);
            // A computed bake or waste of nothing isn't an entry; a count is.
            if (qty === 0 && e.kind !== "COUNTED") continue;
            // This morning's bake that would take away is day-old waste.
            const kind: Kind =
                e.kind === "BAKED" && qty < 0 ? "WASTED" : e.kind;
            const before = balance;
            balance += qty;
            if (balance < 0) {
                throw new Error(
                    `Rye & Co.'s ${s.key} goes below 0 at ${e.at.toISOString()} (${kind} ${qty})`,
                );
            }
            entries.push({
                id: ryeId("stockentry", s.key, n++),
                organizationId: a.orgId,
                stockLevelId: a.shelfIds.get(s.key) ?? "",
                storeId: a.stores[s.store],
                productId: a.productIds[P[s.slug]],
                variantId:
                    s.variant === null
                        ? null
                        : a.variantIds[P[s.slug]][s.variant],
                kind,
                quantity: qty,
                before,
                after: balance,
                expected:
                    kind === "COUNTED" && e.note !== "Opening count"
                        ? before + (e.count?.stale ? 1 : 0)
                        : null,
                counted: kind === "COUNTED" ? balance : null,
                orderId: e.orderId ?? null,
                pairId: e.pairId ?? null,
                actorUserId: e.by,
                note:
                    kind === "WASTED" && e.kind === "BAKED"
                        ? "Day-old"
                        : (e.note ?? null),
                createdAt: e.at,
            });
        }
        if (balance !== s.onHand) {
            throw new Error(
                `Rye & Co.'s ${s.key} log ends on ${balance}, not ${s.onHand}`,
            );
        }
        levels.push({
            id: a.shelfIds.get(s.key) ?? "",
            onHand: s.onHand,
            promised: promised.get(s.key) ?? 0,
            lowStockAlert: s.warnAt,
        });
    }
    return { items, levels, entries };
}

/** The shelves' numbers, once the plan has them. */
export async function writeLevels(prisma: Db, levels: StockPlan["levels"]) {
    for (const l of levels) {
        await prisma.stockLevel.update({
            where: { id: l.id },
            data: {
                onHand: l.onHand,
                promised: l.promised,
                lowStockAlert: l.lowStockAlert,
            },
        });
    }
}

// --- Sold out by hand, and collections -------------------------------------------

/**
 * The seeded multigrain loaf (untracked: baked fresh) marked Sold out by
 * hand at Hill Road this morning; every other listing sells. Rewritten each
 * run, so a film that marks something available again is undone by a re-seed.
 */
export async function markSoldOut(
    prisma: Db,
    a: {
        orgId: string;
        stores: Stores;
        productIds: readonly string[];
        at: Date;
        by: string;
    },
) {
    await prisma.productListing.updateMany({
        where: { organizationId: a.orgId },
        data: { soldOutAt: null, soldOutByUserId: null },
    });
    await prisma.productListing.update({
        where: {
            storeId_productId: {
                storeId: a.stores.H,
                productId: a.productIds[P["seeded-multigrain-loaf"]],
            },
        },
        data: { soldOutAt: a.at, soldOutByUserId: a.by },
    });
}

/** The designs' collections: Bread by category, the rest picked in order. */
export async function writeCollections(
    prisma: Db,
    a: {
        orgId: string;
        productIds: readonly string[];
        categoryId: Record<CategoryKey, string>;
        createdAt: Date;
    },
): Promise<void> {
    const ids: string[] = [];
    for (const c of COLLECTIONS) {
        const data = {
            name: c.name,
            description: c.description || null,
            categoryId: c.category ? a.categoryId[c.category] : null,
        };
        const row = await prisma.collection.upsert({
            where: {
                organizationId_slug: { organizationId: a.orgId, slug: c.slug },
            },
            update: data,
            create: {
                id: ryeId("collection", c.key),
                organizationId: a.orgId,
                slug: c.slug,
                createdAt: a.createdAt,
                ...data,
            },
        });
        ids.push(row.id);
    }
    await prisma.collectionProduct.deleteMany({
        where: { collectionId: { in: ids } },
    });
    await prisma.collectionProduct.createMany({
        data: COLLECTIONS.flatMap((c, k) =>
            (c.picked ?? []).map((slug, position) => ({
                collectionId: ids[k],
                productId: a.productIds[P[slug]],
                organizationId: a.orgId,
                position,
                createdAt: a.createdAt,
            })),
        ),
    });
}
