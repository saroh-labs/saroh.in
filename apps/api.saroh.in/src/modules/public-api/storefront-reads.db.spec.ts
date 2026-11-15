/**
 * The storefront API's other reads over HTTP against a real Postgres (plan
 * 2026-11-10-001, U7; review #11): hosted links on a business's connected
 * domain, and the plans, posts, stock, staff and days reads with a
 * publishable key, each answer exactly its contract schema, and another
 * business's ids as good as missing.
 * Runs in the integration project (TEST_DATABASE_URL), and with TEST_RLS=on.
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({
    isTrustedOrigin: (origin: string): boolean => {
        try {
            return new URL(origin).origin.endsWith(".saroh.in");
        } catch {
            return false;
        }
    },
}));

import {
    storefrontDays,
    storefrontPlans,
    storefrontPost,
    storefrontPosts,
    storefrontServices,
    storefrontStaff,
    storefrontStock,
} from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import {
    business,
    call,
    exactly,
    keyFor,
    tag,
    uniq,
    useStorefrontApp,
} from "../../../test/fixtures/storefront";

useStorefrontApp();

type Business = Awaited<ReturnType<typeof business>>;

async function flagOn(organizationId: string, key: string) {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: key, organizationId, enabled: true },
    });
}

async function read(org: Business, path: string) {
    const pk = await keyFor(org, "PUBLISHABLE");
    return call("GET", `/v1/storefront/${pk.token}${path}`);
}

/** A live post on the business's site, as publishing one stores it. */
async function livePost(org: Business, slug: string) {
    const post = await prisma.post.create({
        data: {
            siteId: org.siteId,
            title: "Our sourdough starter",
            slug,
            content: "<p>Fed every morning.</p>",
            status: "PUBLISHED",
            publishedAt: new Date(),
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: org.siteId,
            organizationId: org.id,
            postId: post.id,
            path: `/blog/${slug}`,
            templateId: "post",
            templateVersion: 1,
            snapshot: {
                post: {
                    title: "Our sourdough starter",
                    slug,
                    excerpt: "How we keep it alive.",
                    content: "<p>Fed every morning.</p>",
                    image: null,
                    featured: false,
                    category: null,
                    author: "Owner",
                    publishedAt: new Date().toISOString(),
                },
                path: `/blog/${slug}`,
            },
        },
    });
    await prisma.post.update({
        where: { id: post.id },
        data: { currentPublicationId: publication.id },
    });
}

/** A shop on the business's site selling one untracked product. */
async function shop(org: Business, slug: string) {
    for (const key of ["SITE_SHOP", "MODULE_COMMERCE"]) {
        await flagOn(org.id, key);
    }
    const store = await prisma.store.create({
        data: {
            name: "Online",
            slug: uniq("u7-store"),
            organizationId: org.id,
        },
    });
    await prisma.site.update({
        where: { id: org.siteId },
        data: { storefrontId: store.id },
    });
    const product = await prisma.product.create({
        data: {
            organizationId: org.id,
            name: "Sourdough",
            slug,
            price: "300.00",
            currency: "INR",
            status: "PUBLISHED",
            stockTracked: false,
        },
    });
    await prisma.productListing.create({
        data: {
            organizationId: org.id,
            storeId: store.id,
            productId: product.id,
        },
    });
    return product.id;
}

describe("storefront hosted links", () => {
    it("lead to the business's connected domain once it is verified", async () => {
        const org = await business("Pulse Fitness");
        const hostname = `pulse-${tag}.example.test`;
        await prisma.domain.create({
            data: {
                organizationId: org.id,
                siteId: org.siteId,
                hostname,
                status: "VERIFIED",
                verifiedAt: new Date(),
                verificationToken: "v",
            },
        });
        const answer = await read(org, "/services");
        expect(answer.status).toBe(200);
        exactly(storefrontServices, answer.body);
        expect(answer.body.data).toEqual([
            expect.objectContaining({
                id: org.serviceId,
                hostedUrl: `https://${hostname}/book?service=${org.serviceId}`,
            }),
        ]);
    });
});

describe("storefront reads (publishable key)", () => {
    it("lists the plans on sale, each linking to the site's plan page", async () => {
        const org = await business("Pulse Fitness");
        await flagOn(org.id, "MODULE_PAYMENTS");
        await prisma.organizationModule.create({
            data: {
                organizationId: org.id,
                moduleKey: "PAYMENTS",
                status: "ENABLED",
            },
        });
        const plan = await prisma.subscriptionPlan.create({
            data: {
                organizationId: org.id,
                name: "Monthly",
                price: "999.00",
                currency: "INR",
                interval: "MONTH",
                status: "ACTIVE",
            },
        });
        const answer = await read(org, "/plans");
        expect(answer.status).toBe(200);
        exactly(storefrontPlans, answer.body);
        expect(answer.body.data).toEqual([
            expect.objectContaining({
                id: plan.id,
                name: "Monthly",
                price: { amountMinor: 99_900, currency: "INR" },
                interval: "month",
                hostedUrl: `https://${org.address}.saroh.app/account/plan`,
            }),
        ]);
    });

    it("lists the live posts and reads one; another business's post is 404", async () => {
        const org = await business("Rye");
        const other = await business("Pulse");
        const slug = uniq("starter");
        const theirs = uniq("theirs");
        await livePost(org, slug);
        await livePost(other, theirs);
        const list = await read(org, "/posts");
        expect(list.status).toBe(200);
        exactly(storefrontPosts, list.body);
        expect(list.body.data).toEqual([
            expect.objectContaining({
                slug,
                title: "Our sourdough starter",
                excerpt: "How we keep it alive.",
                hostedUrl: `https://${org.address}.saroh.app/blog/${slug}`,
            }),
        ]);
        const one = await read(org, `/posts/${slug}`);
        expect(one.status).toBe(200);
        exactly(storefrontPost, one.body);
        expect(one.body).toMatchObject({
            slug,
            content: "<p>Fed every morning.</p>",
        });
        expect((await read(org, `/posts/${theirs}`)).status).toBe(404);
    });

    it("reads the shop's stock; another business's product is 404", async () => {
        const org = await business("Rye");
        const other = await business("Pulse");
        const productId = await shop(org, "sourdough");
        const theirs = uniq("rye-loaf");
        await shop(other, theirs);
        const stock = await read(org, "/stock");
        expect(stock.status).toBe(200);
        exactly(storefrontStock, stock.body);
        expect(stock.body.data).toEqual([
            expect.objectContaining({ productId, soldOut: false }),
        ]);
        expect((await read(org, `/products/${theirs}`)).status).toBe(404);
    });

    it("reads a service's staff and days; another business's service is 404", async () => {
        const org = await business("Rye");
        const other = await business("Pulse");
        const staff = await prisma.staffMember.create({
            data: { organizationId: org.id, name: "Dr. Meera" },
        });
        await prisma.staffService.create({
            data: {
                organizationId: org.id,
                staffId: staff.id,
                serviceId: org.serviceId,
            },
        });
        const people = await read(org, `/services/${org.serviceId}/staff`);
        expect(people.status).toBe(200);
        exactly(storefrontStaff, people.body);
        expect(people.body).toEqual({
            data: [{ id: staff.id, name: "Dr. Meera" }],
            nextCursor: null,
        });

        const days = await read(other, `/services/${other.serviceId}/days`);
        expect(days.status).toBe(200);
        exactly(storefrontDays, days.body);
        expect(days.body).toMatchObject({ timezone: "UTC", kind: "one" });
        const open = (
            days.body.days as { open: boolean; starts: unknown[] }[]
        ).filter((d) => d.open);
        expect(open.length).toBeGreaterThan(0);
        expect(open[0].starts.length).toBeGreaterThan(0);

        for (const path of ["staff", "days"]) {
            const theirs = await read(
                org,
                `/services/${other.serviceId}/${path}`,
            );
            expect({ path, status: theirs.status }).toEqual({
                path,
                status: 404,
            });
            expect(theirs.body.error?.code).toBe("not_found");
        }
    });
});
