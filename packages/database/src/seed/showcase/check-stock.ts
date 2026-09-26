import type { Db } from "../helpers";

/**
 * What Rye & Co.'s stock films need (#526), checked in the database after
 * the seed: two storefronts and one website; the designs' shelves — one row
 * short (the Cinnamon bun six-pack, 2 short at Hill Road), two out, one low;
 * a stock log whose every entry reads before + quantity = after, follows
 * the one before it on its shelf and never goes below 0, with a sale for
 * each unit an order took, a move as two matching halves, and every kind
 * of entry the log shows; the Stock screen's three checks (short, a count
 * that didn't match, a sale not taken); an untracked product marked Sold
 * out by hand; and the designs' collections. The shelf-wide rules — promised
 * is what open lines hold, the log adds up to on hand — are checked for
 * every business in `checkShowcase`.
 */

export interface RyeStockCounts {
    storefronts: string;
    website: string;
    catalogue: string;
    /** The Products list's "Needs you", as its summary reads. */
    needsYou: string;
    shelves: string;
    entries: string;
    checks: string;
    soldOutByHand: string;
    collections: string;
}

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v);

export async function checkRyeStock(
    prisma: Db,
    orgId: string,
): Promise<{ counts: RyeStockCounts; failures: string[] }> {
    const failures: string[] = [];
    const fail = (what: string, rows: Row[]) => {
        if (rows.length > 0) {
            failures.push(
                `${what}: ${rows.length} — e.g. ${JSON.stringify(rows.slice(0, 3), (_k, v: unknown) => (typeof v === "bigint" ? Number(v) : v))}`,
            );
        }
    };
    const expect = (what: string, ok: boolean) => {
        if (!ok) failures.push(what);
    };

    const stores = await prisma.store.findMany({
        where: { organizationId: orgId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { name: true },
    });
    const sites = await prisma.site.findMany({
        where: { organizationId: orgId },
        select: { name: true },
    });
    expect(
        `two storefronts, Hill Road and Online (found ${stores.map((s) => s.name).join(", ")})`,
        stores.map((s) => s.name).join(",") === "Hill Road,Online",
    );
    expect(`one website (found ${sites.length})`, sites.length === 1);

    const products = await prisma.product.groupBy({
        by: ["stockTracked"],
        where: { organizationId: orgId },
        _count: true,
    });
    const tracked = products.find((p) => p.stockTracked)?._count ?? 0;
    const untracked = products.find((p) => !p.stockTracked)?._count ?? 0;

    // Each shelf of a product that counts stock, in the Stock screen's words.
    const shelves = await prisma.$queryRaw<Row[]>`
        SELECT s.id, p.name AS product, v.title AS variant, st.name AS store,
               s."onHand", s.promised,
               GREATEST(0, s.promised - s."onHand") AS short,
               CASE WHEN GREATEST(0, s."onHand" - s.promised) = 0 THEN 'out'
                    WHEN s."lowStockAlert" > 0
                     AND s."onHand" - s.promised <= s."lowStockAlert" THEN 'low'
                    ELSE 'ok' END AS word
        FROM "StockLevel" s
        JOIN "Product" p ON p.id = s."productId"
        JOIN "Store" st ON st.id = s."storeId"
        LEFT JOIN "ProductVariant" v ON v.id = s."variantId"
        WHERE s."organizationId" = ${orgId} AND p."stockTracked"`;
    const short = shelves.filter((s) => n(s.short) > 0);
    const out = shelves.filter((s) => n(s.short) === 0 && s.word === "out");
    const low = shelves.filter((s) => s.word === "low");
    expect(
        `one shelf short — the Cinnamon bun six-pack, 2 short at Hill Road (found ${JSON.stringify(short)})`,
        short.length === 1 &&
            short[0].product === "Cinnamon bun" &&
            short[0].variant === "Six-pack" &&
            short[0].store === "Hill Road" &&
            n(short[0].short) === 2,
    );
    expect(`two shelves out (found ${out.length})`, out.length === 2);
    expect(`one shelf low (found ${low.length})`, low.length === 1);

    // The Products list's "Needs you" (catalogue-needs.ts): each product
    // that counts stock and isn't archived, judged shelf by shelf where it
    // is sold, as the Stock screen judges it (`shelfNeed`), by its worst.
    // A per-variant product's own shelf sells nothing: only short counts.
    const onSale = await prisma.$queryRaw<Row[]>`
        SELECT p.id, p.name,
               GREATEST(0, s."onHand" - s.promised) AS "canSell",
               GREATEST(0, s.promised - s."onHand") AS short,
               s."lowStockAlert" AS "warnAt",
               (s."variantId" IS NULL AND EXISTS (
                   SELECT 1 FROM "StockLevel" o
                   WHERE o."productId" = s."productId" AND o."variantId" IS NOT NULL
               )) AS "holdsOnly"
        FROM "StockLevel" s
        JOIN "Product" p ON p.id = s."productId"
        WHERE s."organizationId" = ${orgId} AND p."stockTracked"
          AND p.status <> 'ARCHIVED'
          AND CASE WHEN s."variantId" IS NULL
                   THEN EXISTS (SELECT 1 FROM "ProductListing" l
                                WHERE l."storeId" = s."storeId" AND l."productId" = s."productId")
                   ELSE EXISTS (SELECT 1 FROM "ProductListingVariant" lv
                                JOIN "ProductListing" l ON l.id = lv."listingId"
                                WHERE l."storeId" = s."storeId" AND lv."variantId" = s."variantId")
              END`;
    const RANK = { short: 0, out: 1, low: 2 } as const;
    type Need = keyof typeof RANK;
    const shelfNeed = (s: Row): Need | null =>
        n(s.short) > 0
            ? "short"
            : s.holdsOnly
              ? null
              : n(s.canSell) <= 0
                ? "out"
                : n(s.warnAt) > 0 && n(s.canSell) <= n(s.warnAt)
                  ? "low"
                  : null;
    const worst = new Map<string, { name: string; kind: Need }>();
    for (const s of onSale) {
        const kind = shelfNeed(s);
        const had = worst.get(String(s.id));
        if (kind && (!had || RANK[kind] < RANK[had.kind])) {
            worst.set(String(s.id), { name: String(s.name), kind });
        }
    }
    const needs = {
        short: [] as string[],
        out: [] as string[],
        low: [] as string[],
    };
    worst.forEach((p) => needs[p.kind].push(p.name));
    const needsYou = [
        needs.short.length ? `${needs.short.length} short for orders` : "",
        needs.out.length ? `${needs.out.length} out of stock` : "",
        needs.low.length ? `${needs.low.length} running low` : "",
    ]
        .filter(Boolean)
        .join(" · ");
    expect(
        `the Products list's Needs you: 1 short for orders · 2 out of stock · 1 running low (found ${needsYou}: ${JSON.stringify(needs)})`,
        needsYou === "1 short for orders · 2 out of stock · 1 running low" &&
            needs.short[0] === "Cinnamon bun",
    );

    // The log: each entry's own sum, its place in its shelf's chain, and 0.
    fail(
        "stock entries that don't read before + quantity = after, or go below 0",
        await prisma.$queryRaw<Row[]>`
            SELECT id, kind::text, before, quantity, after FROM "StockEntry"
            WHERE "organizationId" = ${orgId}
              AND (before + quantity <> after OR after < 0 OR before < 0)`,
    );
    fail(
        "stock entries that don't start where the one before them ended",
        await prisma.$queryRaw<Row[]>`
            SELECT id, before, prev FROM (
                SELECT id, before,
                       COALESCE(LAG(after) OVER (PARTITION BY "stockLevelId"
                                ORDER BY "createdAt", id), 0) AS prev
                FROM "StockEntry" WHERE "organizationId" = ${orgId}) x
            WHERE before <> prev`,
    );
    fail(
        "moves that aren't two halves, out of one storefront and into another",
        await prisma.$queryRaw<Row[]>`
            SELECT "pairId", COUNT(*) AS n, SUM(quantity) AS net
            FROM "StockEntry"
            WHERE "organizationId" = ${orgId} AND kind = 'MOVED'
            GROUP BY "pairId"
            HAVING "pairId" IS NULL OR COUNT(*) <> 2 OR SUM(quantity) <> 0
                OR COUNT(DISTINCT "storeId") <> 2`,
    );
    fail(
        "sales that aren't what a fulfilled order's lines took off that shelf",
        await prisma.$queryRaw<Row[]>`
            SELECT COALESCE(e."orderId", l."orderId") AS "orderId", e.taken, l.sold
            FROM (
                SELECT "orderId", "stockLevelId", -SUM(quantity) AS taken
                FROM "StockEntry" WHERE "organizationId" = ${orgId} AND kind = 'SOLD'
                GROUP BY 1, 2
            ) e
            FULL JOIN (
                SELECT i."orderId", i."stockLevelId", SUM(i."soldQuantity") AS sold
                FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
                WHERE o."organizationId" = ${orgId} AND i."soldQuantity" > 0
                GROUP BY 1, 2
            ) l ON l."orderId" = e."orderId" AND l."stockLevelId" = e."stockLevelId"
            LEFT JOIN "Order" o ON o.id = COALESCE(e."orderId", l."orderId")
            WHERE e.taken IS DISTINCT FROM l.sold
               OR o.status NOT IN ('SHIPPED', 'DELIVERED')`,
    );
    const kinds = await prisma.stockEntry.groupBy({
        by: ["kind"],
        where: { organizationId: orgId },
        _count: true,
        orderBy: { kind: "asc" },
    });
    const kindCount = (k: string) =>
        kinds.find((x) => x.kind === k)?._count ?? 0;
    for (const k of [
        "COUNTED",
        "RECEIVED",
        "BAKED",
        "WASTED",
        "SOLD",
        "MOVED",
    ]) {
        expect(`a ${k.toLowerCase()} entry in the log`, kindCount(k) >= 1);
    }
    const entries = kinds.reduce((sum, k) => sum + k._count, 0);

    // The Stock screen's checks, as stock-checks.service.ts finds them.
    const countMismatch = n(
        (
            await prisma.$queryRaw<Row[]>`
                SELECT COUNT(*) AS n FROM "StockEntry" e
                WHERE e."organizationId" = ${orgId} AND e.kind = 'COUNTED'
                  AND e.expected IS NOT NULL AND e.expected <> e.before
                  AND NOT EXISTS (SELECT 1 FROM "StockEntry" r WHERE r."reversesId" = e.id)`
        )[0]?.n ?? 0,
    );
    const saleNotTaken = n(
        (
            await prisma.$queryRaw<Row[]>`
                SELECT COUNT(*) AS n FROM "OrderItem" i
                JOIN "Order" o ON o.id = i."orderId"
                JOIN "Product" p ON p.id = i."productId"
                JOIN LATERAL (
                    SELECT (SELECT MIN(e."createdAt") FROM "StockEntry" e
                            WHERE e."stockLevelId" = s.id) AS first
                    FROM "StockLevel" s
                    WHERE s."storeId" = o."storeId" AND s."productId" = i."productId"
                      AND CASE WHEN i."variantId" IS NOT NULL AND EXISTS (
                                   SELECT 1 FROM "StockLevel" s2
                                   WHERE s2."storeId" = o."storeId"
                                     AND s2."productId" = i."productId"
                                     AND s2."variantId" IS NOT NULL)
                               THEN s."variantId" = i."variantId"
                               ELSE s."variantId" IS NULL END
                ) sh ON true
                WHERE o."organizationId" = ${orgId}
                  AND o.status IN ('SHIPPED', 'DELIVERED')
                  AND i."stockLevelId" IS NULL
                  AND (i."stockRow" IS NULL OR i."stockRow" = 'NONE')
                  AND p."stockTracked" AND sh.first IS NOT NULL
                  AND o."updatedAt" >= GREATEST(sh.first, COALESCE(p."stockTrackedAt", sh.first))`
        )[0]?.n ?? 0,
    );
    const resolved = await prisma.stockCheckResolution.count({
        where: { organizationId: orgId },
    });
    expect(
        `one count that didn't match (found ${countMismatch})`,
        countMismatch === 1,
    );
    expect(
        `one sale not taken from stock (found ${saleNotTaken})`,
        saleNotTaken === 1,
    );
    expect(`no check resolved yet (found ${resolved})`, resolved === 0);

    // Sold out by hand: only a product that counts no stock carries it.
    const soldOut = await prisma.productListing.findMany({
        where: { organizationId: orgId, soldOutAt: { not: null } },
        select: {
            product: { select: { name: true, stockTracked: true } },
            store: { select: { name: true } },
        },
    });
    expect(
        `one untracked product marked Sold out by hand (found ${JSON.stringify(soldOut)})`,
        soldOut.length === 1 && !soldOut[0].product.stockTracked,
    );

    const collections = await prisma.collection.findMany({
        where: { organizationId: orgId },
        select: {
            name: true,
            categoryId: true,
            _count: { select: { products: true } },
        },
        orderBy: { name: "asc" },
    });
    const automatic = collections.filter((c) => c.categoryId !== null).length;
    expect(
        `the designs' four collections, one automatic (found ${collections.length}, ${automatic} automatic)`,
        collections.length >= 4 && automatic >= 1,
    );
    fail(
        "hand-picked collections with no products, or automatic ones with some picked",
        collections
            .filter(
                (c) => (c.categoryId === null) === (c._count.products === 0),
            )
            .map((c) => ({ name: c.name })),
    );

    return {
        failures,
        counts: {
            storefronts: stores.map((s) => s.name).join(", "),
            website: sites.map((s) => s.name).join(", "),
            catalogue: `${tracked + untracked} products, ${tracked} tracking stock`,
            needsYou: `${needsYou} (${[...needs.short, ...needs.out, ...needs.low].join(", ")})`,
            shelves: `${shelves.length}: ${short.length} short, ${out.length} out, ${low.length} low`,
            entries: `${entries}: ${kinds.map((k) => `${k._count} ${k.kind.toLowerCase()}`).join(", ")}`,
            checks: `${short.length + countMismatch + saleNotTaken}: ${short.length} short, ${countMismatch} count didn't match, ${saleNotTaken} sale not taken`,
            soldOutByHand: soldOut
                .map((s) => `${s.product.name} at ${s.store.name}`)
                .join(", "),
            collections: collections
                .map((c) =>
                    c.categoryId
                        ? `${c.name} (automatic)`
                        : `${c.name} (${c._count.products})`,
                )
                .join(", "),
        },
    };
}
