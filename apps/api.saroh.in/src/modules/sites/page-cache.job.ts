import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { siteRelaySecret } from "../site-accounts/site-secrets";
import type { PageRevalidatePayload } from "./page-cache-revalidate";
import { pageCacheRevalidationOn } from "./page-cache-revalidate";
import {
    PAGE_CACHE_SIGNATURE_HEADER,
    signPageRevalidation,
} from "./page-cache-signature";
import { rendererBase } from "./site-origin";

/**
 * `site.pages.revalidate` (#863): tell the merchant sites' Worker which
 * kept pages to stop serving, once the write that queued it has committed
 * (`page-cache-revalidate.ts` says who queues it).
 *
 * The payload carries ids; the handler reads where they stand now. A
 * product's business comes from its row, or from the payload when the
 * product was deleted. Its tags go to every live site of that business:
 *
 *     site:<siteId>                        a site's whole look
 *     site:<siteId>:products               its product lists (/shop, grids)
 *     site:<siteId>:product:<productId>    one product's page
 *
 * the strings the renderer tags pages with (`lib/page-cache/tags.ts`; both
 * test files pin them).
 *
 * `POST <renderer>/__saroh/page-cache/revalidate`, `{ tags }`, signed with
 * `SITE_RELAY_SECRET` (`page-cache-signature.ts`). Idempotent: revalidating
 * twice only redraws a page once more. At-least-once: anything but a 2xx
 * throws and the queue retries with backoff; until it lands, a kept page
 * lives at most its time on the Worker (five minutes).
 */

/** How long one call may take before it counts as failed (and is retried). */
const CALL_TIMEOUT_MS = 10_000;
/** Tags in one call; the Worker refuses bodies over 100 kB. */
const TAGS_PER_CALL = 400;

export const PAGE_CACHE_REVALIDATE_PATH = "/__saroh/page-cache/revalidate";

/** Ids as the renderer accepts them in a tag (cuids). */
const TAG_ID = /^[A-Za-z0-9_-]{1,64}$/;

function ids(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter(
              (v): v is string => typeof v === "string" && TAG_ID.test(v),
          )
        : [];
}

/** The payload as it was written, narrowed rather than cast. */
export function readPayload(payload: unknown): PageRevalidatePayload {
    const p =
        payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : {};
    return {
        cause:
            typeof p.cause === "string"
                ? (p.cause as PageRevalidatePayload["cause"])
                : "product",
        siteIds: ids(p.siteIds),
        productIds: ids(p.productIds),
        stockLevelIds: ids(p.stockLevelIds),
        organizationId:
            typeof p.organizationId === "string" ? p.organizationId : undefined,
    };
}

/** What the handler reads, so a spec can answer without a database. */
export interface PageTagReads {
    shelvesProducts(stockLevelIds: string[]): Promise<string[]>;
    productsBusinesses(
        productIds: string[],
    ): Promise<{ id: string; organizationId: string }[]>;
    liveSites(
        organizationIds: string[],
    ): Promise<{ id: string; organizationId: string }[]>;
}

const DATABASE_READS: PageTagReads = {
    async shelvesProducts(stockLevelIds) {
        const rows = await prisma.stockLevel.findMany({
            where: { id: { in: stockLevelIds } },
            select: { productId: true },
        });
        return rows.map((r) => r.productId);
    },
    productsBusinesses(productIds) {
        return prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, organizationId: true },
        });
    },
    liveSites(organizationIds) {
        return prisma.site.findMany({
            where: {
                organizationId: { in: organizationIds },
                currentPublicationId: { not: null },
            },
            select: { id: true, organizationId: true },
        });
    },
};

/** The tags a payload names, as they stand now. */
export async function tagsFor(
    payload: PageRevalidatePayload,
    reads: PageTagReads,
): Promise<string[]> {
    const tags = new Set<string>();
    for (const siteId of payload.siteIds ?? []) tags.add(`site:${siteId}`);

    const productIds = new Set(payload.productIds ?? []);
    if (payload.stockLevelIds?.length) {
        for (const id of await reads.shelvesProducts(payload.stockLevelIds)) {
            productIds.add(id);
        }
    }
    if (productIds.size === 0) return Array.from(tags);

    const owners = new Map<string, string>();
    for (const row of await reads.productsBusinesses(Array.from(productIds))) {
        owners.set(row.id, row.organizationId);
    }
    // A product deleted since: the business it was queued under.
    if (payload.organizationId) {
        for (const id of productIds) {
            if (!owners.has(id)) owners.set(id, payload.organizationId);
        }
    }
    const businesses = Array.from(new Set(owners.values()));
    if (businesses.length === 0) return Array.from(tags);
    for (const site of await reads.liveSites(businesses)) {
        tags.add(`site:${site.id}:products`);
        for (const [productId, org] of owners) {
            if (org === site.organizationId) {
                tags.add(`site:${site.id}:product:${productId}`);
            }
        }
    }
    // A row id the renderer couldn't take as a tag would refuse the whole
    // call; it can't name a kept page either.
    return Array.from(tags).filter((tag) =>
        tag.split(":").every((part, i) => i % 2 === 0 || TAG_ID.test(part)),
    );
}

@Injectable()
export class PageCacheRevalidateHandler {
    private readonly logger = new Logger(PageCacheRevalidateHandler.name);

    /** The HTTP call and the reads; a spec swaps them for fakes. */
    fetchFn: typeof fetch = (input, init) => fetch(input, init);
    reads: PageTagReads = DATABASE_READS;

    readonly handle = async (job: Job): Promise<void> => {
        const payload = readPayload(job.payload);
        if (!pageCacheRevalidationOn()) {
            // Queued while on, switched off since: the Worker keeps nothing
            // it could be told about.
            this.logger.warn(
                `page_cache_revalidate_off job=${job.id} cause=${payload.cause}`,
            );
            return;
        }
        const tags = await tagsFor(payload, this.reads);
        if (tags.length === 0) {
            // No live site shows these (a business with no site, or one
            // not yet published): nothing kept, nothing to say.
            this.logger.log(
                `page_cache_revalidate_nothing job=${job.id} cause=${payload.cause}`,
            );
            return;
        }
        // Throws where the secret is missing outside development and test:
        // a failed run, retried, and logged at ERROR by the worker.
        const secret = siteRelaySecret();
        const url = `${rendererBase()}${PAGE_CACHE_REVALIDATE_PATH}`;
        for (let i = 0; i < tags.length; i += TAGS_PER_CALL) {
            const body = JSON.stringify({
                tags: tags.slice(i, i + TAGS_PER_CALL),
            });
            await this.send(job, url, body, secret);
        }
        this.logger.log(
            `page_cache_revalidated job=${job.id} cause=${payload.cause} tags=${tags.length}`,
        );
    };

    private async send(
        job: Job,
        url: string,
        body: string,
        secret: string,
    ): Promise<void> {
        let res: Response | null = null;
        let failure = "";
        try {
            res = await this.fetchFn(url, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    [PAGE_CACHE_SIGNATURE_HEADER]: signPageRevalidation(
                        body,
                        secret,
                    ),
                },
                body,
                signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
            });
        } catch (error) {
            failure = error instanceof Error ? error.name : "unknown";
        }
        if (!res) {
            this.logger.warn(
                `page_cache_revalidate_unreachable job=${job.id} error=${failure}`,
            );
            throw new Error(`page cache revalidation unreachable (${failure})`);
        }
        if (!res.ok) {
            this.logger.warn(
                `page_cache_revalidate_refused job=${job.id} status=${res.status}`,
            );
            throw new Error(`page cache revalidation answered ${res.status}`);
        }
    }
}
