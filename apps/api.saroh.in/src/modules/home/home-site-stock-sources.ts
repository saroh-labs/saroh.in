import type { prisma } from "@saroh/database";

import type { StockCheck } from "../stock/stock-checks.service";
import { businessTracksStock } from "../stock/tracking";
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
