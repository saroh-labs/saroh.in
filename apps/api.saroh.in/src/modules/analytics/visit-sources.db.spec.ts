/**
 * Where a visit came from (U15, #1099) against a real Postgres: the public
 * intake keeps a visit's source and label and nothing else, with no visitor
 * hash; an order placed from a visit carries its source to `order.paid`
 * when it is paid; the day's rollup breaks both down; and the read U16
 * builds on says how many visits each source brought, how many paid, and
 * from which day it has counted.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { CreateOrderDto } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { AnalyticsAggregateHandler } from "./analytics-aggregate.handler";
import { AnalyticsService } from "./analytics.service";
import { readVisitSources } from "./visit-sources";

const tag = `${process.pid}-${Date.now()}`;
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const orders = new OrdersService(stores);
const analytics = new AnalyticsService(
    new FixedWindowRateLimiter(1000, 60_000),
);

let orgId = "";
let otherOrgId = "";
let ownerId = "";
let storeId = "";
let siteId = "";
let otherSiteId = "";
let bread = "";

const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `u15-owner-${tag}@example.com` },
        })
    ).id;
    orgId = (
        await prisma.organization.create({
            data: { name: "Rye Sources", slug: `u15-org-${tag}` },
        })
    ).id;
    otherOrgId = (
        await prisma.organization.create({
            data: { name: "Other Sources", slug: `u15-other-${tag}` },
        })
    ).id;
    await giveBusinessDetails(orgId);
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    storeId = (
        await stores.createForUser(ownerId, orgId, {
            name: "Hill Road",
            slug: `u15-hill-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: {
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
    });
    bread = (
        await products.create(storeId, ownerId, {
            name: "Sourdough",
            price: "180",
        })
    ).id;
    siteId = (
        await prisma.site.create({
            data: {
                organizationId: orgId,
                name: "Rye",
                slug: `u15-site-${tag}`,
            },
        })
    ).id;
    otherSiteId = (
        await prisma.site.create({
            data: {
                organizationId: otherOrgId,
                name: "Other",
                slug: `u15-other-site-${tag}`,
            },
        })
    ).id;
});

/** Roll up every day this business's events fell on (a run may cross midnight). */
async function rollUp(organizationId: string) {
    const days = new Set(
        (
            await prisma.analyticsEvent.findMany({
                where: { organizationId },
                select: { occurredAt: true },
            })
        ).map((e) => e.occurredAt.toISOString().slice(0, 10)),
    );
    const handler = new AnalyticsAggregateHandler();
    for (const date of days) {
        await handler.handle({
            payload: { organizationId, date },
        } as unknown as Job);
    }
}

describe("site link tracking (U15)", () => {
    it("the public intake keeps a visit's source and label, no visitor and nothing else", async () => {
        const visit = await analytics.ingestPublic(
            siteId,
            {
                type: "site.visit",
                properties: {
                    source: "instagram",
                    ref: "Diwali-Post",
                    path: "/shop/loaf?email=a@example.com",
                },
            },
            "203.0.113.7",
        );
        const view = await analytics.ingestPublic(
            siteId,
            { type: "site.view", properties: { path: "/shop/loaf" } },
            "203.0.113.7",
        );

        const stored = await prisma.analyticsEvent.findUniqueOrThrow({
            where: { id: visit.id },
        });
        expect(stored).toMatchObject({
            organizationId: orgId,
            siteId,
            type: "site.visit",
            properties: { source: "instagram", ref: "diwali-post" },
            visitorHash: null,
            consent: "anonymous",
        });
        expect(stored.expiresAt?.getTime()).toBeGreaterThan(Date.now());
        // A page view still groups its visitor, as before.
        const page = await prisma.analyticsEvent.findUniqueOrThrow({
            where: { id: view.id },
        });
        expect(page.visitorHash).toMatch(/^[0-9a-f]{64}$/);

        // A paid order can't be forged from the site.
        await expect(
            analytics.ingestPublic(
                siteId,
                {
                    type: "order.paid",
                    properties: {
                        orderId: "x",
                        amountCents: 1,
                        source: "instagram",
                    },
                },
                "203.0.113.7",
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("an order placed from a visit carries its source to order.paid when it is paid", async () => {
        const made = await orders.create(storeId, ownerId, {
            items: [{ productId: bread, quantity: 1 }],
            fulfilment: "PICKUP",
            payment: { kind: "LATER" },
            walkIn: { name: "Asha" },
        } as CreateOrderDto);
        // As the site's checkout writes it (`checkout-order.ts`).
        await prisma.order.update({
            where: { id: made.id },
            data: { visitSource: "instagram", visitRef: "diwali-post" },
        });

        await orders.updateStatus(storeId, made.id, ownerId, {
            paymentStatus: "PAID",
            paidHow: "UPI",
        });

        const paid = await prisma.analyticsEvent.findFirstOrThrow({
            where: {
                organizationId: orgId,
                type: "order.paid",
                properties: { path: ["orderId"], equals: made.id },
            },
        });
        expect(paid.properties).toEqual({
            orderId: made.id,
            amountCents: 18_000,
            source: "instagram",
            ref: "diwali-post",
        });
        // The team sees where it came from on the order.
        const detail = await orders.get(storeId, made.id, ownerId);
        expect(detail.cameFrom).toEqual({
            source: "instagram",
            ref: "diwali-post",
        });
    });

    it("an order taken at the counter has no source", async () => {
        const made = await orders.create(storeId, ownerId, {
            items: [{ productId: bread, quantity: 1 }],
            fulfilment: "PICKUP",
            payment: { kind: "CASH", received: "200" },
            walkIn: { name: "Ravi" },
        } as CreateOrderDto);
        const paid = await prisma.analyticsEvent.findFirstOrThrow({
            where: {
                organizationId: orgId,
                type: "order.paid",
                properties: { path: ["orderId"], equals: made.id },
            },
        });
        expect(paid.properties).toEqual({
            orderId: made.id,
            amountCents: 18_000,
        });
        expect((await orders.get(storeId, made.id, ownerId)).cameFrom).toBe(
            null,
        );
    });

    it("the read counts visits and paid by source and label, from the day it began", async () => {
        for (const [type, source] of [
            ["site.visit", "instagram"],
            ["site.visit", "direct"],
            ["site.looked", "instagram"],
            ["site.started", "instagram"],
        ] as const) {
            await analytics.ingestPublic(
                siteId,
                {
                    type,
                    properties:
                        source === "instagram"
                            ? { source, ref: "diwali-post" }
                            : { source },
                },
                "203.0.113.8",
            );
        }
        // Another business's visit never reaches this one's read.
        await analytics.ingestPublic(
            otherSiteId,
            { type: "site.visit", properties: { source: "instagram" } },
            "203.0.113.9",
        );
        await rollUp(orgId);
        await rollUp(otherOrgId);

        const from = new Date(`${today()}T00:00:00Z`);
        from.setUTCDate(from.getUTCDate() - 1);
        const to = new Date(`${today()}T00:00:00Z`);
        to.setUTCDate(to.getUTCDate() + 1);
        const read = await readVisitSources(prisma, orgId, { from, to });

        const instagram = read.sources.find((s) => s.source === "instagram");
        expect(instagram).toEqual({
            source: "instagram",
            visits: 2,
            looked: 1,
            started: 1,
            paid: 1,
        });
        expect(read.sources.find((s) => s.source === "direct")).toMatchObject({
            visits: 1,
            paid: 0,
        });
        expect(read.refs).toEqual([
            {
                ref: "diwali-post",
                visits: 2,
                looked: 1,
                started: 1,
                paid: 1,
            },
        ]);
        // Counted from the first day a visit's source was recorded.
        const first = await prisma.analyticsEvent.findFirstOrThrow({
            where: { organizationId: orgId, type: "site.visit" },
            orderBy: { occurredAt: "asc" },
        });
        expect(read.countedFrom?.toISOString().slice(0, 10)).toBe(
            first.occurredAt.toISOString().slice(0, 10),
        );

        // Narrowed to the site: the same visits; paid is the business's.
        const onSite = await readVisitSources(prisma, orgId, {
            from,
            to,
            siteId,
        });
        expect(
            onSite.sources.find((s) => s.source === "instagram"),
        ).toMatchObject({ visits: 2, paid: 1 });
    });

    it("says nothing has been counted for a business with no visit yet", async () => {
        const read = await readVisitSources(prisma, otherOrgId, {
            from: new Date("2020-01-01T00:00:00Z"),
            to: new Date("2020-01-31T00:00:00Z"),
        });
        // The other business has a visit (counted from today), none in 2020.
        expect(read.countedFrom).not.toBeNull();
        expect(read.sources.every((s) => s.visits === 0)).toBe(true);

        const none = await readVisitSources(prisma, `${orgId}-none`, {
            from: new Date("2020-01-01T00:00:00Z"),
            to: new Date("2030-01-01T00:00:00Z"),
        });
        expect(none.countedFrom).toBeNull();
    });
});
