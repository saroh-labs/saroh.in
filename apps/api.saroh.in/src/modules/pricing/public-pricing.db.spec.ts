/**
 * `GET /public/pricing` against a real Postgres (plans catalogue U3): the
 * live version as a visitor sees it, its ETag and cache headers, a scheduled
 * version held back until its go-live, and the draft preview — served only
 * for a token that holds, never cacheable, and the same 404 for every token
 * that doesn't. Also the first-catalogue installer.
 *
 * Every catalogue here is made up (`test/fixtures/pricing-catalog.ts`).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import type { Prisma } from "@saroh/database";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";
import type { Response } from "express";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { CatalogueService, SHARED_DRAFT_ID } from "./catalogue.service";
import { ImpactService } from "./impact.service";
import { installFirstCatalogue } from "./install-catalogue";
import { signPreviewToken } from "./preview-token";
import { pricingPreviewSecret } from "./pricing-secrets";
import {
    PUBLIC_PRICING_CACHE,
    PublicPricingController,
} from "./public-pricing.controller";

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

async function publish(version: number, goLiveAt: Date, catalog: Catalog) {
    return writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt,
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

async function saveDraft(catalog: unknown, revision: number, createdAt?: Date) {
    await prisma.pricingCatalogDraft.deleteMany({});
    return prisma.pricingCatalogDraft.create({
        data: {
            id: SHARED_DRAFT_ID,
            catalog: catalog as Prisma.InputJsonValue,
            revision,
            ...(createdAt ? { createdAt } : {}),
        },
    });
}

/** A stand-in for Express's response: what the controller set on it. */
function fakeRes() {
    const headers: Record<string, string> = {};
    let status = 200;
    const res = {
        setHeader: (k: string, v: string) => {
            headers[k.toLowerCase()] = v;
        },
        status: (s: number) => {
            status = s;
            return res;
        },
    };
    return {
        res: res as unknown as Response,
        headers,
        status: () => status,
    };
}

describe("public pricing (DB, U3)", () => {
    const service = new CatalogueService(new ImpactService());
    const controller = new PublicPricingController(service);

    afterEach(async () => {
        await prisma.pricingCatalogDraft.deleteMany({});
        await prisma.pricingCatalogVersion.deleteMany({});
        await prisma.plan.deleteMany({
            where: { key: { startsWith: "catalog." } },
        });
    });

    it("is a 404 before any version is installed", async () => {
        await expect(service.publicPricing(new Date())).rejects.toMatchObject({
            status: 404,
        });
    });

    it("serves the live version without its retired plan, with a stable ETag and a five-minute cache", async () => {
        await publish(
            1,
            new Date(Date.now() - DAY),
            fakeCatalog((c) => {
                c.plans[2]!.retired = true;
            }),
        );

        const first = fakeRes();
        const body = await controller.get(undefined, undefined, first.res);
        expect(body).toMatchObject({ version: 1, preview: false });
        expect(body!.catalog.plans.map((p) => p.id)).toEqual(["free", "b"]);
        expect(first.headers["cache-control"]).toBe(PUBLIC_PRICING_CACHE);

        const second = fakeRes();
        await controller.get(undefined, undefined, second.res);
        expect(second.headers.etag).toBe(first.headers.etag);

        const revalidate = fakeRes();
        const nothing = await controller.get(
            undefined,
            first.headers.etag,
            revalidate.res,
        );
        expect(revalidate.status()).toBe(304);
        expect(nothing).toBeUndefined();
    });

    it("keeps serving the previous version until a scheduled one goes live", async () => {
        const now = new Date();
        await publish(1, new Date(now.getTime() - DAY), fakeCatalog());
        await publish(
            2,
            new Date(now.getTime() + DAY),
            fakeCatalog((c) => {
                c.plans[1]!.pricePaise = 33_300;
            }),
        );

        const today = await service.publicPricing(now);
        expect(today.version).toBe(1);
        expect(today.catalog.plans[1]!.pricePaise).toBe(22_200);

        const tomorrow = await service.publicPricing(
            new Date(now.getTime() + 2 * DAY),
        );
        expect(tomorrow.version).toBe(2);
        expect(tomorrow.catalog.plans[1]!.pricePaise).toBe(33_300);
    });

    describe("draft preview", () => {
        const draftCatalog = fakeCatalog((c) => {
            c.plans[0]!.name = "Plan A (draft)";
        });

        beforeEach(async () => {
            await publish(1, new Date(Date.now() - DAY), fakeCatalog());
        });

        it("serves the draft for a token minted for its revision, never cacheable", async () => {
            await saveDraft(draftCatalog, 3);
            const { token, revision } = await service.mintPreviewToken(
                3,
                new Date(),
            );
            expect(revision).toBe(3);

            const out = fakeRes();
            const body = await controller.get(token, undefined, out.res);
            expect(body).toMatchObject({
                version: null,
                goLiveAt: null,
                preview: true,
            });
            expect(body!.catalog.plans[0]!.name).toBe("Plan A (draft)");
            expect(out.headers["cache-control"]).toBe("no-store");
            expect(out.headers["x-robots-tag"]).toBe("noindex, nofollow");
            expect(out.headers["referrer-policy"]).toBe("no-referrer");
            expect(out.headers.etag).toBeUndefined();
        });

        async function refused(token: string) {
            const out = fakeRes();
            await expect(
                controller.get(token, undefined, out.res),
            ).rejects.toMatchObject({ status: 404 });
            // A refusal is not cacheable either.
            expect(out.headers["cache-control"]).toBe("no-store");
        }

        it("is a 404 for an expired token", async () => {
            const draft = await saveDraft(draftCatalog, 3);
            const { token } = signPreviewToken(
                pricingPreviewSecret(),
                { revision: 3, draftEpoch: draft.createdAt.getTime() },
                new Date(Date.now() - 16 * MIN),
            );
            await refused(token);
        });

        it("is a 404 for a forged token", async () => {
            const draft = await saveDraft(draftCatalog, 3);
            const { token } = signPreviewToken(
                "someone-elses-secret-that-is-long-enough",
                { revision: 3, draftEpoch: draft.createdAt.getTime() },
                new Date(),
            );
            await refused(token);
            await refused("not-a-token");
        });

        it("is a 404 once the draft has been saved again", async () => {
            await saveDraft(draftCatalog, 3);
            const { token } = await service.mintPreviewToken(3, new Date());
            await prisma.pricingCatalogDraft.update({
                where: { id: SHARED_DRAFT_ID },
                data: { revision: 4 },
            });
            await refused(token);
        });

        it("is a 404 for a new draft that happens to reach the same revision", async () => {
            const first = await saveDraft(draftCatalog, 3);
            const { token } = await service.mintPreviewToken(3, new Date());
            // A later draft, told apart by its createdAt rather than a sleep.
            await saveDraft(
                draftCatalog,
                3,
                new Date(first.createdAt.getTime() + 1000),
            );
            await refused(token);
        });

        it("is a 404 once the draft is gone", async () => {
            await saveDraft(draftCatalog, 3);
            const { token } = await service.mintPreviewToken(3, new Date());
            await prisma.pricingCatalogDraft.deleteMany({});
            await refused(token);
        });

        it("won't mint for a stale revision, a draft that doesn't validate, or no draft", async () => {
            await expect(
                service.mintPreviewToken(3, new Date()),
            ).rejects.toMatchObject({ status: 404 });

            await saveDraft(draftCatalog, 5);
            await expect(
                service.mintPreviewToken(4, new Date()),
            ).rejects.toMatchObject({ status: 409 });

            const twoFeatured = JSON.parse(JSON.stringify(draftCatalog)) as {
                plans: { featured: boolean }[];
            };
            for (const p of twoFeatured.plans) p.featured = true;
            await saveDraft(twoFeatured, 6);
            await expect(
                service.mintPreviewToken(6, new Date()),
            ).rejects.toMatchObject({ status: 422 });
        });
    });
});

describe("installFirstCatalogue (DB, U3)", () => {
    afterEach(async () => {
        await prisma.pricingCatalogVersion.deleteMany({});
        await prisma.plan.deleteMany({
            where: { key: { startsWith: "catalog." } },
        });
    });

    it("installs version 1 live, with its Plan rows, then does nothing", async () => {
        const now = new Date();
        const first = await installFirstCatalogue(prisma, {
            catalog: fakeCatalog(),
            note: "fake first",
            now,
        });
        expect(first).toEqual({ installed: true, version: 1 });
        expect(
            await prisma.plan.count({
                where: { key: { startsWith: "catalog." }, version: 1 },
            }),
        ).toBe(6);
        const live = await new CatalogueService(
            new ImpactService(),
        ).publicPricing(new Date(now.getTime() + 1));
        expect(live.version).toBe(1);

        const again = await installFirstCatalogue(prisma, {
            catalog: fakeCatalog((c) => {
                c.plans[1]!.pricePaise = 1;
            }),
            note: "fake again",
            now,
        });
        expect(again).toEqual({ installed: false, version: 1 });
        expect(await prisma.pricingCatalogVersion.count()).toBe(1);
    });

    it("leaves a database that already has a later version alone", async () => {
        await publish(4, new Date(), fakeCatalog());
        expect(
            await installFirstCatalogue(prisma, {
                catalog: fakeCatalog(),
                note: "fake",
                now: new Date(),
            }),
        ).toEqual({ installed: false, version: 4 });
    });
});
