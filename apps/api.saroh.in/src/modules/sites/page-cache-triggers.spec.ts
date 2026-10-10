/**
 * Which writes tell the merchant sites' page cache (#863).
 *
 * The stock locks are exercised: every stock flow takes them (the lock order
 * in `products/stock-levels.ts`), so a shelf or product they lock is a
 * revalidation queued on the same transaction. The other writes are pinned
 * by reading their source, as `jobs/job-consumers.spec.ts` does: booting
 * each service to watch one call would drag in Prisma and every provider.
 * Removing a trigger fails here, and says what goes stale without it.
 */
const mockEnv: Record<string, string | undefined> = { NODE_ENV: "test" };
jest.mock("../../env", () => ({ env: mockEnv, declaredNodeEnv: "test" }));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    lockProduct,
    lockProducts,
    lockStockLevels,
} from "../products/stock-levels";
import { SITE_PAGES_REVALIDATE_TYPE } from "./page-cache-revalidate";

function fakeTx() {
    return {
        $queryRaw: jest.fn().mockResolvedValue([]),
        job: { create: jest.fn().mockResolvedValue({}) },
    };
}

const payloads = (tx: ReturnType<typeof fakeTx>) =>
    tx.job.create.mock.calls.map((c) => {
        const data = (c[0] as { data: { type: string; payload: unknown } })
            .data;
        expect(data.type).toBe(SITE_PAGES_REVALIDATE_TYPE);
        return data.payload;
    });

describe("stock changes reach the page cache (#863)", () => {
    afterEach(() => {
        mockEnv.SITE_PAGE_CACHE = undefined;
    });

    it("a shelf lock queues its shelves, after taking the lock", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        const tx = fakeTx();
        await lockStockLevels(tx as never, ["sl_b", "sl_a", "sl_b"]);
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        expect(payloads(tx)).toEqual([
            { cause: "stock", stockLevelIds: ["sl_a", "sl_b"] },
        ]);
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.job.create.mock.invocationCallOrder[0] ?? 0,
        );
    });

    it("a product lock queues the product", async () => {
        mockEnv.SITE_PAGE_CACHE = "on";
        const tx = fakeTx();
        await lockProduct(tx as never, "prod_1");
        await lockProducts(tx as never, ["prod_2", "prod_1"]);
        expect(payloads(tx)).toEqual([
            { cause: "stock", productIds: ["prod_1"] },
            { cause: "stock", productIds: ["prod_2"] },
        ]);
    });

    it("queues nothing while the cache is off", async () => {
        const tx = fakeTx();
        await lockStockLevels(tx as never, ["sl_a"]);
        await lockProduct(tx as never, "prod_1");
        expect(tx.job.create).not.toHaveBeenCalled();
    });
});

const MODULES = join(__dirname, "..");

/** [file, what it must call, what goes stale without it] */
const TRIGGERS: [string, RegExp, string][] = [
    [
        "sites/live-pointer.ts",
        /enqueuePageRevalidation\(tx, \{\s*cause: "publish",\s*siteIds: \[site\.id\]/,
        "a publish, restore or go-live leaves the old version on the site",
    ],
    [
        "organizations/web-address.service.ts",
        /enqueuePageRevalidation\(tx, \{\s*cause: "address"/,
        "the old address keeps serving pages instead of forwarding",
    ],
    [
        "sites/site-tracking.service.ts",
        /enqueuePageRevalidation\(tx, \{\s*cause: "trackers"/,
        "a tracker change waits for the page's minute",
    ],
    [
        "admin/admin-site-trackers.service.ts",
        /enqueuePageRevalidation\(tx, \{\s*cause: "trackers"/,
        "Saroh's switch waits for the page's minute (DEC-108)",
    ],
    [
        "organizations/organization-settings.service.ts",
        /private async logoChangedOnSites[\s\S]*enqueuePageRevalidation\(prisma, \{\s*cause: "icon"/,
        "a site with no icon of its own keeps the old business logo in its tab (DEC-124)",
    ],
    [
        "content/posts.service.ts",
        /enqueuePageRevalidation\(tx, \{\s*cause: "publish"/,
        "a published post is missing from the journal",
    ],
    [
        "products/products.service.ts",
        /private async productChanged[\s\S]*enqueuePageRevalidation\(prisma/,
        "a price or detail saved in the editor stays old on the site",
    ],
    [
        "products/products.service.ts",
        /tx\.product\.delete[\s\S]{0,400}enqueuePageRevalidation\(tx/,
        "a deleted product stays in the shop",
    ],
    [
        "products/variants.service.ts",
        /enqueuePageRevalidation\(prisma, \{\s*cause: "product"/,
        "an option's price stays old on the site",
    ],
    [
        "products/listings.service.ts",
        /enqueuePageRevalidation\(prisma, \{\s*cause: "product"/,
        "a product taken off a storefront stays in its shop",
    ],
];

describe("the other writes that tell the page cache (#863)", () => {
    it.each(TRIGGERS)("%s queues a revalidation", (file, pattern, stale) => {
        const text = readFileSync(join(MODULES, file), "utf8");
        if (!pattern.test(text)) {
            throw new Error(`${file} no longer queues it: ${stale}`);
        }
    });

    it("the product writes that change price call productChanged", () => {
        const text = readFileSync(
            join(MODULES, "products/products.service.ts"),
            "utf8",
        );
        // updateIn and patchIn both save a price.
        expect(
            text.match(
                /await this\.productChanged\(organizationId, productId\)/g,
            ),
        ).toHaveLength(2);
    });
});
