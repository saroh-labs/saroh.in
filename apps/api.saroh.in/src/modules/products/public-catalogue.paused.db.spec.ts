/**
 * A move to a lower plan on a merchant site (#800), against a real
 * Postgres: the products past the plan's limit (the oldest) are in no
 * list, grid or page of the shop, and a website or location that stopped
 * taking orders refuses the checkout's quote and says so in its options.
 *
 * What is paused is decided in `billing/over-limit*.ts` and unit-tested
 * there; here `overLimit.pausedNow` is stubbed with a real cut so the
 * reads' `where` is proved against rows.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PausedNow } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { NOT_TAKING_ORDERS } from "../billing/paused-errors";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PublicCheckoutService } from "../orders/public-checkout.service";
import type { PaymentsService } from "../payments/payments.service";
import { PublicCatalogueService } from "./public-catalogue.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const catalogue = new PublicCatalogueService(new FixedWindowRateLimiter(1_000));
const checkout = new PublicCheckoutService(
    {} as PaymentsService,
    new FixedWindowRateLimiter(1_000),
    new FixedWindowRateLimiter(1_000),
);

function paused(
    organizationId: string,
    over: Partial<PausedNow> = {},
): PausedNow {
    return {
        organizationId,
        since: new Date(),
        memberIds: new Set(),
        invitationIds: new Set(),
        diaryIds: new Set(),
        products: null,
        posts: null,
        storeIds: new Set(),
        siteIds: new Set(),
        ...over,
    };
}

async function shop() {
    const org = await prisma.organization.create({
        data: { name: "Paused Pottery", slug: uniq("p800-org") },
    });
    for (const flagKey of ["SITE_SHOP", "MODULE_COMMERCE"]) {
        await prisma.featureFlagOverride.create({
            data: { flagKey, organizationId: org.id, enabled: true },
        });
    }
    const store = await prisma.store.create({
        data: {
            name: "Hill Road",
            slug: uniq("p800-store"),
            organizationId: org.id,
        },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Site",
            slug: uniq("p800-site"),
            storefrontId: store.id,
        },
    });
    const made: { id: string; slug: string; createdAt: Date }[] = [];
    for (const [i, name] of [
        "Oldest bowl",
        "Middle mug",
        "Newest jug",
    ].entries()) {
        const p = await prisma.product.create({
            data: {
                organizationId: org.id,
                name,
                slug: uniq(name.toLowerCase().replace(/\s+/g, "-")),
                price: "300.00",
                currency: "INR",
                status: "PUBLISHED",
                stockTracked: false,
                createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
            },
        });
        await prisma.productListing.create({
            data: {
                organizationId: org.id,
                storeId: store.id,
                productId: p.id,
            },
        });
        made.push(p);
    }
    return { org: org.id, store: store.id, site: site.id, products: made };
}

afterEach(() => jest.restoreAllMocks());

describe("public shop after a move to a lower plan (#800)", () => {
    it("lists only the newest products the plan keeps, and a paused one's page is a 404", async () => {
        const s = await shop();
        const middle = s.products[1];
        jest.spyOn(overLimit, "pausedNow").mockResolvedValue(
            paused(s.org, {
                products: { createdAt: middle.createdAt, id: middle.id },
            }),
        );
        const list = await catalogue.list(s.site, uniq("visitor"));
        expect(list.products.map((p) => p.name).sort()).toEqual([
            "Middle mug",
            "Newest jug",
        ]);
        await expect(
            catalogue.product(s.site, s.products[0].slug, uniq("visitor")),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            catalogue.product(s.site, s.products[2].slug, uniq("visitor")),
        ).resolves.toMatchObject({ name: "Newest jug" });
    });

    it("lists everything when nothing is paused: moving back up restores it at once", async () => {
        const s = await shop();
        jest.spyOn(overLimit, "pausedNow").mockResolvedValue(null);
        const list = await catalogue.list(s.site, uniq("visitor"));
        expect(list.products).toHaveLength(3);
    });

    it("a paused location says it isn't taking orders and refuses the quote", async () => {
        const s = await shop();
        jest.spyOn(overLimit, "pausedNow").mockResolvedValue(
            paused(s.org, { storeIds: new Set([s.store]) }),
        );
        await expect(
            checkout.options(s.site, uniq("visitor")),
        ).resolves.toMatchObject({ canOrder: false, notTakingOrders: true });
        const err = await checkout
            .quote(s.site, { lines: [] } as never, uniq("visitor"))
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect(
            (
                (err as ConflictException).getResponse() as {
                    details: { code: string };
                }
            ).details.code,
        ).toBe(NOT_TAKING_ORDERS);
    });

    it("never touches orders already placed: nothing is written or changed by the reads", async () => {
        const s = await shop();
        jest.spyOn(overLimit, "pausedNow").mockResolvedValue(
            paused(s.org, { siteIds: new Set([s.site]) }),
        );
        const before = await prisma.order.count({
            where: { store: { organizationId: s.org } },
        });
        await checkout.options(s.site, uniq("visitor"));
        expect(
            await prisma.order.count({
                where: { store: { organizationId: s.org } },
            }),
        ).toBe(before);
    });
});
