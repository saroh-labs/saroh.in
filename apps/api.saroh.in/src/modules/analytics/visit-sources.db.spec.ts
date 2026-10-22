/**
 * Where a visit came from (U15, #1099; DEC-181) against a real Postgres: the
 * public intake keeps a visit's source, and its label only when it is one
 * of the site's live links made in Saroh, with no visitor hash; nothing
 * about a visit is kept on an order; paid is the visit's own `site.paid`
 * step; the day's rollup breaks them down; and the read U16 builds on says
 * how many visits each source brought, how many paid, and from which day it
 * has counted.
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
import { forgetAllSiteLinkLabels } from "./site-link-labels";
import { OTHER_LINKS_REF, readVisitSources } from "./visit-sources";

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
    // The links each business made in Saroh (DEC-181): Rye's live
    // "diwali-post" and archived "old-sale"; the other business's
    // "their-post", on its own site.
    await prisma.siteLink.createMany({
        data: [
            {
                organizationId: orgId,
                siteId,
                name: "Diwali post",
                label: "diwali-post",
            },
            {
                organizationId: orgId,
                siteId,
                name: "Old sale",
                label: "old-sale",
                archivedAt: new Date(),
            },
            {
                organizationId: otherOrgId,
                siteId: otherSiteId,
                name: "Their post",
                label: "their-post",
            },
        ],
    });
    forgetAllSiteLinkLabels();
});

afterAll(() => forgetAllSiteLinkLabels());

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

describe("site link tracking (U15, DEC-181)", () => {
    const step = (
        site: string,
        type: string,
        properties: Record<string, unknown>,
    ) => analytics.ingestPublic(site, { type, properties }, "203.0.113.7");
    const stored = async (id: string) =>
        (await prisma.analyticsEvent.findUniqueOrThrow({ where: { id } }))
            .properties;

    it("the public intake keeps a visit's source and its own link's label, no visitor and nothing else", async () => {
        const visit = await step(siteId, "site.visit", {
            source: "instagram",
            ref: "Diwali-Post",
            path: "/shop/loaf?email=a@example.com",
        });
        const view = await analytics.ingestPublic(
            siteId,
            { type: "site.view", properties: { path: "/shop/loaf" } },
            "203.0.113.7",
        );

        const row = await prisma.analyticsEvent.findUniqueOrThrow({
            where: { id: visit.id },
        });
        expect(row).toMatchObject({
            organizationId: orgId,
            siteId,
            type: "site.visit",
            properties: { source: "instagram", ref: "diwali-post" },
            visitorHash: null,
            consent: "anonymous",
        });
        expect(row.expiresAt?.getTime()).toBeGreaterThan(Date.now());
        // A page view still groups its visitor, as before.
        const page = await prisma.analyticsEvent.findUniqueOrThrow({
            where: { id: view.id },
        });
        expect(page.visitorHash).toMatch(/^[0-9a-f]{64}$/);

        // A paid order can't be forged from the site.
        await expect(
            step(siteId, "order.paid", {
                orderId: "x",
                amountCents: 1,
                source: "instagram",
            }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("counts a label that isn't a live link of the site under its group alone (DEC-181)", async () => {
        // Never made in Saroh; archived; another business's; a name; a
        // booking's id: each is kept as its group with no label, never
        // refused.
        for (const ref of [
            "someones-name",
            "old-sale",
            "their-post",
            "asha-9876543210",
            "cmh2k9x0a0001qz8l3v5d7f9b",
        ]) {
            const made = await step(siteId, "site.looked", {
                source: "whatsapp",
                ref,
            });
            expect([ref, await stored(made.id)]).toEqual([
                ref,
                { source: "whatsapp" },
            ]);
        }
        // The other business's own label is kept on its own site.
        const theirs = await step(otherSiteId, "site.visit", {
            source: "whatsapp",
            ref: "their-post",
        });
        expect(await stored(theirs.id)).toEqual({
            source: "whatsapp",
            ref: "their-post",
        });
    });

    it("counts a link made a moment ago at once, and an archived one no more", async () => {
        const made = await prisma.siteLink.create({
            data: {
                organizationId: orgId,
                siteId,
                name: "Story",
                label: "story-oct",
            },
        });
        forgetAllSiteLinkLabels();
        const before = await step(siteId, "site.visit", {
            source: "instagram",
            ref: "story-oct",
        });
        expect(await stored(before.id)).toEqual({
            source: "instagram",
            ref: "story-oct",
        });
        await prisma.siteLink.update({
            where: { id: made.id },
            data: { archivedAt: new Date() },
        });
        forgetAllSiteLinkLabels();
        const after = await step(siteId, "site.visit", {
            source: "instagram",
            ref: "story-oct",
        });
        expect(await stored(after.id)).toEqual({ source: "instagram" });
        await prisma.analyticsEvent.deleteMany({
            where: { id: { in: [before.id, after.id] } },
        });
    });

    it("takes site.paid from the visitor's confirmation page with only the group and label (DEC-181)", async () => {
        const paid = await step(siteId, "site.paid", {
            source: "instagram",
            ref: "diwali-post",
            orderId: "ord_1",
            amountCents: 18_000,
        });
        expect(await stored(paid.id)).toEqual({
            source: "instagram",
            ref: "diwali-post",
        });
        // Validated like the other steps: a group it doesn't know is refused.
        await expect(
            step(siteId, "site.paid", { source: "tiktok" }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("keeps nothing about a visit on an order: no column, and order.paid is the order's alone", async () => {
        const columns = await prisma.$queryRaw<{ column_name: string }[]>`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'Order' AND column_name ILIKE 'visit%'`;
        expect(columns).toEqual([]);

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
        expect(
            "cameFrom" in (await orders.get(storeId, made.id, ownerId)),
        ).toBe(false);
    });

    it("the read counts visits and paid (site.paid) by source and label, from the day it began", async () => {
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
        // Two visits by "diwali-post" is under the three a label needs to
        // be shown on its own (U15 privacy review): it is in "Other links".
        expect(read.refs).toEqual([
            {
                ref: OTHER_LINKS_REF,
                visits: 2,
                looked: 1,
                started: 1,
                paid: 1,
            },
        ]);
        // A visit's step is stored to the hour, at a random id, with no
        // visitor (U15 privacy review).
        const steps = await prisma.analyticsEvent.findMany({
            where: {
                organizationId: orgId,
                type: {
                    in: [
                        "site.visit",
                        "site.looked",
                        "site.started",
                        "site.paid",
                    ],
                },
            },
        });
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
            expect(step.occurredAt.getTime() % (60 * 60 * 1000)).toBe(0);
            expect(step.receivedAt.getTime() % (60 * 60 * 1000)).toBe(0);
            expect(step.visitorHash).toBeNull();
            expect(step.consent).toBe("anonymous");
            expect(step.dedupeKey).toBeNull();
        }
        // Counted from the first day a visit's source was recorded.
        const first = await prisma.analyticsEvent.findFirstOrThrow({
            where: { organizationId: orgId, type: "site.visit" },
            orderBy: { occurredAt: "asc" },
        });
        expect(read.countedFrom?.toISOString().slice(0, 10)).toBe(
            first.occurredAt.toISOString().slice(0, 10),
        );

        // Narrowed to the site: the same, paid included (the confirmation
        // page's `site.paid` names its site, DEC-181).
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
