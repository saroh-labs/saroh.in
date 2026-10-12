import type { Prisma } from "@saroh/database";

import { env } from "../../env";

/**
 * Telling the merchant sites' page cache what changed (#863).
 *
 * The renderer keeps rendered pages (`apps/saroh.app/lib/page-cache/`), each
 * tagged with its site, and its product or product list. A write that
 * changes what a live page shows queues `site.pages.revalidate` on its own
 * transaction (the outbox, `backend-jobs.md`), and the handler
 * (`page-cache.job.ts`) resolves the tags and tells the Worker once the
 * write has committed.
 *
 * Queued:
 *  - **a site's whole look** (`siteIds`): a version going live (publish,
 *    restore, go-live: `putLive`), a change of web address, the merchant's
 *    trackers or codes saved, Saroh switching a site's trackers off or on,
 *    the business logo set or removed (it is the icon of a site with none
 *    of its own, DEC-124), and the business's phone, contact email, social
 *    links or the address its site shows saved (read live, DEC-128), and
 *    the business's own domain pausing or coming back with its plan
 *    (DEC-139: every page names a different address as its own), and how
 *    the business's prices carry GST changing (its registration, its GSTIN
 *    or state, or its choice: every price's GST words are read live).
 *  - **products** (`productIds`, `stockLevelIds`): every stock flow and
 *    every change to how a product counts takes the product or shelf locks
 *    (`products/stock-levels.ts`, the lock order), so that is where a stock
 *    change is heard; a price or detail save and a delete queue their own.
 *
 * Only while `SITE_PAGE_CACHE` is `on`: a job that could only no-op is
 * never queued (`backend-jobs.md`). Small and lock-free, so it sits in the
 * hottest stock paths without adding a wait.
 */
export const SITE_PAGES_REVALIDATE_TYPE = "site.pages.revalidate";

export type PageRevalidateCause =
    | "publish"
    | "address"
    | "trackers"
    | "icon"
    | "contact"
    | "domain"
    | "stock"
    | "product"
    | "prices";

export interface PageRevalidatePayload {
    cause: PageRevalidateCause;
    /** Every page of these sites. */
    siteIds?: string[];
    /** These products' pages, and the product lists of their sites. */
    productIds?: string[];
    /** The same, for the products these shelves belong to. */
    stockLevelIds?: string[];
    /** The products' business, when they may be gone by then (a delete). */
    organizationId?: string;
}

type JobTx = Pick<Prisma.TransactionClient, "job">;

/** Whether the merchant sites keep pages, as this API is told. */
export function pageCacheRevalidationOn(): boolean {
    return env.SITE_PAGE_CACHE === "on";
}

/**
 * Queue a revalidation on the caller's transaction (or, after a write that
 * already committed, on the client). False when the cache is off or there
 * is nothing to name.
 */
export async function enqueuePageRevalidation(
    tx: JobTx,
    payload: PageRevalidatePayload,
): Promise<boolean> {
    if (!pageCacheRevalidationOn()) return false;
    const named =
        (payload.siteIds?.length ?? 0) +
        (payload.productIds?.length ?? 0) +
        (payload.stockLevelIds?.length ?? 0);
    if (named === 0) return false;
    await tx.job.create({
        data: {
            type: SITE_PAGES_REVALIDATE_TYPE,
            payload: { ...payload },
        },
    });
    return true;
}

/**
 * Queue every page of a business's published sites: what a change to how
 * the business is reached needs (DEC-128), since its footer is on all of
 * them. With the cache off nothing is read; with no live site nothing is
 * queued.
 */
export async function enqueueBusinessSitesRevalidation(
    tx: JobTx & Pick<Prisma.TransactionClient, "site">,
    organizationId: string,
    cause: PageRevalidateCause,
): Promise<boolean> {
    if (!pageCacheRevalidationOn()) return false;
    const sites = await tx.site.findMany({
        where: {
            organizationId,
            deletedAt: null,
            currentPublicationId: { not: null },
        },
        select: { id: true },
    });
    return enqueuePageRevalidation(tx, {
        cause,
        siteIds: sites.map((s) => s.id),
    });
}

/**
 * What one transaction has already queued, so a flow that takes the same
 * locks twice (a hold reads, locks, reads again) queues once. Keyed on the
 * transaction client, which lives exactly as long as its transaction.
 */
const queuedIn = new WeakMap<object, Set<string>>();

function fresh(tx: object, keys: readonly string[]): string[] {
    let seen = queuedIn.get(tx);
    if (!seen) {
        seen = new Set();
        queuedIn.set(tx, seen);
    }
    const out: string[] = [];
    for (const key of keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}

/** Shelves are about to change in this transaction (`lockStockLevels`). */
export async function noteShelvesChanging(
    tx: JobTx,
    stockLevelIds: readonly string[],
): Promise<void> {
    if (!pageCacheRevalidationOn() || stockLevelIds.length === 0) return;
    const ids = fresh(
        tx,
        stockLevelIds.map((id) => `shelf:${id}`),
    ).map((k) => k.slice("shelf:".length));
    if (ids.length === 0) return;
    await enqueuePageRevalidation(tx, { cause: "stock", stockLevelIds: ids });
}

/** Products are about to change in this transaction (`lockProduct`). */
export async function noteProductsChanging(
    tx: JobTx,
    productIds: readonly string[],
    cause: PageRevalidateCause = "stock",
): Promise<void> {
    if (!pageCacheRevalidationOn() || productIds.length === 0) return;
    const ids = fresh(
        tx,
        productIds.map((id) => `product:${id}`),
    ).map((k) => k.slice("product:".length));
    if (ids.length === 0) return;
    await enqueuePageRevalidation(tx, { cause, productIds: ids });
}
