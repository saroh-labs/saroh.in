import type { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { realOrderWhere } from "../orders/open-orders";
import type { StockCheck } from "../stock/stock-checks.service";
import { movable, shelfNeed } from "../stock/stock-words";
import { businessTracksStock, COUNTING_ROWS } from "../stock/tracking";
import type { HomeAction, HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT } from "./home-model";
import { inStores } from "./home-staff";

/**
 * Home's stock and website sources (round 2, F1): shelves short for open
 * orders, and websites that aren't live. Each is read on its own through
 * `HomeService.attempt()`.
 */

type Db = typeof prisma;

/** The part of `StockChecksService` Home reads. */
export interface ShortChecks {
    openShort(organizationId: string): Promise<StockCheck[]>;
}

/** Where the Stock screen lists what needs someone, already filtered. */
const STOCK_NEEDS_HREF = "/commerce/stock?show=needs";

/**
 * The Stock screen's open SHORT checks: a shelf that holds fewer than open
 * orders were promised. ATTENTION — an order is already waiting on stock
 * that isn't there. A business that doesn't track stock has no shelves to
 * be short, so it gives nothing: not a row, and not a notice. A staff
 * member's Home keeps only their storefronts' shelves (F11, `storeIds`).
 */
export async function stockShort(
    db: Db,
    checks: ShortChecks,
    organizationId: string,
    storeIds?: readonly string[] | null,
): Promise<HomeAction | null> {
    if (!(await businessTracksStock(db, organizationId))) return null;
    const short = inStores(await checks.openShort(organizationId), storeIds);
    const count = short.length;
    if (count === 0) return null;

    // Oldest first, as every Home source: the one waiting longest first.
    const sorted = [...short].sort(
        (a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0),
    );
    const evidence: HomeEvidence[] = sorted
        .slice(0, EVIDENCE_LIMIT)
        .map((c) => ({
            id: c.key,
            title: c.variantTitle
                ? `${c.productName} · ${c.variantTitle}`
                : c.productName,
            subtitle: `${c.title} at ${c.storeName}`,
            at: c.at?.toISOString() ?? null,
            amountMinor: null,
            currency: null,
            href: STOCK_NEEDS_HREF,
            tag: "Blocks orders",
            tone: "bad",
        }));

    // "Sizes" only when every short shelf is a variant's; a product with no
    // sizes is an item, and calling it a size would be untrue.
    const noun = short.every((c) => c.variantId !== null) ? "size" : "item";
    return {
        code: "COMMERCE_STOCK_SHORT",
        title:
            count === 1
                ? `1 ${noun} is short for orders`
                : `${count} ${noun}s are short for orders`,
        href: STOCK_NEEDS_HREF,
        severity: "ATTENTION",
        moduleKey: "COMMERCE",
        count,
        evidence,
        tag: "Blocks orders",
        tone: "bad",
    };
}

export const STOCK_LOW_CODE = "COMMERCE_STOCK_LOW";

/** Where a product's stock is set: the Stock screen, on that product. */
const STOCK_HREF = "/commerce/stock";

/** How many low shelves it reads at most, for the group's count. */
export const STOCK_LOW_READ_LIMIT = 500;

/** A shelf as `stockLow` reads it. */
export interface LowShelfRow {
    id: string;
    storeId: string;
    productId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
    lowStockAlert: number;
    product: {
        name: string;
        _count?: { variants: number };
        listings?: { storeId: string }[];
    };
    variant: { title: string | null } | null;
    store: { name: string };
}

/**
 * "Sells about 9 a day" from what the last 7 days sold, or what they sold
 * when it is under one a day; nothing when nothing sold (A14).
 */
export function sellsWords(soldLast7: number): string | null {
    if (soldLast7 <= 0) return null;
    const perDay = Math.round(soldLast7 / 7);
    if (perDay >= 1) return `sells about ${perDay} a day`;
    return `${soldLast7} sold in the last 7 days`;
}

/** "3 left", or "None left". */
export function leftWords(left: number): string {
    return left > 0 ? `${left} left` : "None left";
}

/**
 * Whether a shelf is running low where it is sold (A14, DEC-171): the
 * Stock screen's own rule (`shelfNeed`), at or under its own alert, or
 * with nothing left — never one short for orders, which is the short
 * source's row. A product with sizes sells from its sizes' shelves, so its
 * own shelf never is; a shelf at a storefront that doesn't list the
 * product sells nothing there.
 */
export function isLowShelf(row: LowShelfRow): boolean {
    const hasSizes = (row.product._count?.variants ?? 0) > 0;
    if (row.variantId === null && hasSizes) return false;
    const listed = row.product.listings;
    if (listed && !listed.some((l) => l.storeId === row.storeId)) return false;
    const need = shelfNeed(row);
    return need === "low" || need === "out";
}

/**
 * Products running low (A14): only where a stock level is set — a shelf
 * row exists for a product that counts stock, at a business that counts
 * it — and its alert is above 0. Each row says how many are left and, when
 * it sold in the last 7 days, how fast it sells. Lowest first. A staff
 * member's Home keeps only their storefronts' (F11).
 */
export async function stockLow(
    db: Db,
    organizationId: string,
    clock: { now: Date; zone: string },
    storeIds?: readonly string[] | null,
): Promise<HomeAction | null> {
    if (!(await businessTracksStock(db, organizationId))) return null;
    const read = (await db.stockLevel.findMany({
        where: {
            organizationId,
            ...COUNTING_ROWS,
            ...(storeIds ? { storeId: { in: [...storeIds] } } : {}),
            lowStockAlert: { gt: 0 },
            // A draft sells to nobody yet, and an archived one nowhere.
            product: { ...COUNTING_ROWS.product, status: "PUBLISHED" },
            // Only shelves that could be low: at or under the alert on the
            // shelf, or promising some of it (what can be sold is less).
            OR: [
                { onHand: { lte: db.stockLevel.fields.lowStockAlert } },
                { promised: { not: 0 } },
            ],
        },
        orderBy: [{ onHand: "asc" }, { id: "asc" }],
        take: STOCK_LOW_READ_LIMIT,
        select: {
            id: true,
            storeId: true,
            productId: true,
            variantId: true,
            onHand: true,
            promised: true,
            lowStockAlert: true,
            product: {
                select: {
                    name: true,
                    _count: { select: { variants: true } },
                    listings: { select: { storeId: true } },
                },
            },
            variant: { select: { title: true } },
            store: { select: { name: true } },
        },
    })) as LowShelfRow[];
    const low = read
        .filter(isLowShelf)
        .sort(
            (a, b) =>
                movable(a) - movable(b) ||
                a.product.name.localeCompare(b.product.name) ||
                a.id.localeCompare(b.id),
        );
    if (low.length === 0) return null;

    const shown = low.slice(0, EVIDENCE_LIMIT);
    const from = DateTime.fromJSDate(clock.now, { zone: clock.zone })
        .startOf("day")
        .minus({ days: 6 })
        .toJSDate();
    const sold = await db.orderItem.groupBy({
        by: ["stockLevelId"],
        where: {
            stockLevelId: { in: shown.map((r) => r.id) },
            order: {
                organizationId,
                createdAt: { gte: from },
                status: { not: "CANCELLED" },
                paymentStatus: { not: "REFUNDED" },
                ...realOrderWhere(),
            },
        },
        _sum: { quantity: true },
    });
    const soldBy = new Map(
        sold.map((r) => [r.stockLevelId, r._sum.quantity ?? 0]),
    );
    // The storefront is named only when the business sells from several.
    const several = new Set(low.map((r) => r.storeId)).size > 1;
    const evidence: HomeEvidence[] = shown.map((row) => {
        const left = movable(row);
        return {
            id: row.id,
            title: row.variant?.title
                ? `${row.product.name} · ${row.variant.title}`
                : row.product.name,
            subtitle: several ? row.store.name : null,
            at: null,
            amountMinor: null,
            currency: null,
            href: `${STOCK_HREF}?product=${encodeURIComponent(row.productId)}`,
            tag: "Low",
            tone: left > 0 ? "due" : "bad",
            detail: [leftWords(left), sellsWords(soldBy.get(row.id) ?? 0)]
                .filter(Boolean)
                .join(" · "),
        };
    });
    const count = low.length;
    return {
        code: STOCK_LOW_CODE,
        title:
            count === 1
                ? "1 product running low"
                : `${count} products running low`,
        href: STOCK_NEEDS_HREF,
        severity: "SUGGESTION",
        moduleKey: "COMMERCE",
        count,
        late: low.filter((r) => movable(r) === 0).length,
        evidence,
    };
}

/** The line under a site that isn't live. */
const NOT_LIVE_WORDS = "Nobody can find you until you publish it.";

/**
 * Websites with nothing published (`currentPublicationId` null): never
 * published, or taken down. SETUP — nothing is broken, but nobody can find
 * the business there until it is published.
 */
export async function sitesNotLive(
    db: Db,
    organizationId: string,
): Promise<HomeAction | null> {
    const where = {
        organizationId,
        deletedAt: null,
        currentPublicationId: null,
    };
    const [count, rows] = await Promise.all([
        db.site.count({ where }),
        db.site.findMany({
            where,
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: EVIDENCE_LIMIT,
            select: { id: true, name: true, createdAt: true },
        }),
    ]);
    if (count === 0) return null;

    const evidence: HomeEvidence[] = rows.map((site) => ({
        id: site.id,
        title: site.name,
        subtitle: NOT_LIVE_WORDS,
        at: site.createdAt.toISOString(),
        amountMinor: null,
        currency: null,
        href: `/sites/${site.id}`,
        tag: "Blocked",
        tone: "bad",
    }));

    return {
        code: "WEBSITE_NOT_LIVE",
        title:
            count === 1
                ? "Your site isn't live"
                : `${count} of your sites aren't live`,
        href: count === 1 && evidence[0] ? evidence[0].href : "/sites",
        severity: "SETUP",
        moduleKey: "WEBSITE",
        count,
        evidence,
        tag: "Blocked",
        tone: "bad",
    };
}
