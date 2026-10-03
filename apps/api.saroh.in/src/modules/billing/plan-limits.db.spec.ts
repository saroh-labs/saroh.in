/**
 * Every catalogue limit and lock, refused where the write happens (plans
 * catalogue U13, R7), against a real Postgres: products (made, copied,
 * brought back from the archive), orders a month taken by hand, bookings a
 * month (by hand, and the booking page told only that the business isn't
 * taking bookings), blog posts put live, team members invited, integrations
 * connected, and the switches — custom roles, themes, site review. Existing
 * things stay editable; only adding is refused. With `PLAN_ENFORCEMENT`
 * off, none of it is.
 *
 * The services run as the API builds them; `planMeter` reads the real
 * switch, turned on per business (an override). Catalogue numbers are
 * made up (`fakeMeteredCatalog`). The invitation email is stubbed. Runs in
 * the integration project (TEST_DATABASE_URL), plain and RLS.
 */
jest.mock("../../common/email", () => ({
    ...jest.requireActual<object>("../../common/email"),
    sendOrganizationInvitationEmail: jest.fn(() => Promise.resolve()),
}));

import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { Service } from "@saroh/database";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../test/business-details";
import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { reserve } from "../bookings/reservation";
import { CommunicationsService } from "../communications/communications.service";
import { PostsService } from "../content/posts.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { CreateOrderDto } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { OrganizationRolesService } from "../organizations/organization-roles.service";
import { ProductAccess } from "../products/product-access";
import { ProductsService } from "../products/products.service";
import { setPublishNeedsApproval } from "../sites/publish-approval";
import { SitesService } from "../sites/sites.service";
import { StoresService } from "../stores/stores.service";
import { EntitlementService } from "./entitlement.service";
import { monthWindow } from "./metering";
import { BOOKINGS_PAUSED_MESSAGE } from "./plan-limit-errors";

const tag = `${process.pid}-${Date.now()}`;
const V = 820_000 + Math.floor(Math.random() * 9_000);
const MINUTE = 60_000;
let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

const storeFlags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(storeFlags);
const productAccess = new ProductAccess(stores);
const products = new ProductsService(stores, undefined, productAccess);
const orders = new OrdersService(stores);
const posts = new PostsService();
const members = new OrganizationMembersService(new AuditService());
const roles = new OrganizationRolesService();
const comms = new CommunicationsService();
const sites = new SitesService(new EntitlementService());

interface Business {
    orgId: string;
    ownerId: string;
    storeId: string;
    owner: OrganizationContext;
}

/** A business on `planId`@V with its owner, a storefront and the switch. */
async function business(planId: string, enforce = true): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Limits", slug: uniq("lim") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.PLAN_ENFORCEMENT,
            organizationId: org.id,
            enabled: enforce,
        },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    const storeId = (
        await stores.createForUser(user.id, org.id, {
            name: "Hill Road",
            slug: uniq("hill"),
        })
    ).id;
    return {
        orgId: org.id,
        ownerId: user.id,
        storeId,
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
    };
}

async function scopeOf(b: Business) {
    return productAccess.write(b.owner, undefined, b.storeId);
}

/** The refusal's body, as the error filter would send it. */
async function refused<E extends ForbiddenException | ConflictException>(
    p: Promise<unknown>,
    type: new (...args: never[]) => E = ForbiddenException as never,
) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(type);
    return (err as E).getResponse() as {
        message: string;
        details: Record<string, unknown>;
    };
}

beforeAll(async () => {
    const catalog = fakeMeteredCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - 24 * 60 * MINUTE),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("products (DB, U13)", () => {
    it("makes the last one, then refuses the next with the notice", async () => {
        const b = await business("free");
        const scope = await scopeOf(b);
        for (let i = 0; i < 3; i++) {
            await products.createIn(scope, { name: `Loaf ${i}`, price: "10" });
        }
        const body = await refused(
            products.createIn(scope, { name: "One more", price: "10" }),
        );
        expect(body).toMatchObject({
            message: "You've reached your 3 products on Plan A",
            details: { code: "PLAN_LIMIT_REACHED", limit: 3, used: 3 },
        });
        expect(
            await prisma.product.count({ where: { organizationId: b.orgId } }),
        ).toBe(3);
        // An archived product counts toward nothing.
        await expect(
            products.createIn(scope, {
                name: "Old stock",
                price: "10",
                status: "ARCHIVED",
            }),
        ).resolves.toHaveProperty("id");
    });

    it("refuses a copy, and bringing one back from the archive, at the cap", async () => {
        const b = await business("free");
        const scope = await scopeOf(b);
        const first = await products.createIn(scope, {
            name: "Loaf",
            price: "10",
        });
        const old = await products.createIn(scope, {
            name: "Old",
            price: "10",
            status: "ARCHIVED",
        });
        await products.duplicateIn(scope, first.id);
        await products.duplicateIn(scope, first.id);
        await refused(products.duplicateIn(scope, first.id));
        await refused(products.patchIn(scope, old.id, { status: "DRAFT" }));
        // What exists stays editable.
        await expect(
            products.patchIn(scope, first.id, { name: "Rye loaf" }),
        ).resolves.toBeDefined();
    });

    it("refuses nothing with the switch off", async () => {
        const b = await business("free", false);
        const scope = await scopeOf(b);
        for (let i = 0; i < 4; i++) {
            await products.createIn(scope, { name: `Loaf ${i}`, price: "10" });
        }
        expect(
            await prisma.product.count({ where: { organizationId: b.orgId } }),
        ).toBe(4);
    });
});

describe("orders a month (DB, U13)", () => {
    it("refuses an order taken by hand past this month's cap", async () => {
        const b = await business("free");
        await giveBusinessDetails(b.orgId);
        await prisma.storeSettings.upsert({
            where: { storeId: b.storeId },
            create: {
                storeId: b.storeId,
                currency: "INR",
                fulfilmentTypes: ["PICKUP"],
                collectionEnabled: true,
            },
            update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
        });
        const bread = (
            await products.create(b.storeId, b.ownerId, {
                name: "Bread",
                price: "10",
            })
        ).id;
        const place = () =>
            orders.create(b.storeId, b.ownerId, {
                items: [{ productId: bread, quantity: 1 }],
                fulfilment: "PICKUP",
                payment: { kind: "LATER" },
            } as CreateOrderDto);
        await place();
        await place();
        const body = await refused(place());
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "ordersPerMonth",
            per: "month",
            limit: 2,
        });
        expect(
            await prisma.order.count({ where: { organizationId: b.orgId } }),
        ).toBe(2);
    });
});

describe("bookings a month (DB, U13)", () => {
    let service: Service;
    let start = Date.now() + 3 * 24 * 60 * MINUTE;
    const book = (actorUserId: string | null) => {
        start += 60 * MINUTE;
        return reserve(
            undefined,
            service,
            new Date(start),
            new Date(start + 30 * MINUTE),
            {
                startAt: new Date(start).toISOString(),
                bookerName: "Asha",
                bookerEmail: `${uniq("asha")}@example.test`,
            },
            { source: "test", actorUserId },
        );
    };
    const seeded = (organizationId: string, createdAt: Date) =>
        prisma.booking.create({
            data: {
                organizationId,
                serviceId: service.id,
                startAt: new Date(start - 365 * 24 * 60 * MINUTE),
                endAt: new Date(start - 365 * 24 * 60 * MINUTE + 30 * MINUTE),
                timezone: "Asia/Kolkata",
                snapshot: {},
                bookerEmail: `${uniq("seed")}@example.test`,
                createdAt,
            },
        });

    it("counts the month in the business's zone, then refuses", async () => {
        const b = await business("free");
        service = await prisma.service.create({
            data: {
                organizationId: b.orgId,
                name: "Session",
                durationMinutes: 30,
                capacity: 5,
                timezone: "Asia/Kolkata",
            },
        });
        const { start: monthStart } = monthWindow(new Date(), "Asia/Kolkata");
        // Last month in India (the cap was full then): not counted.
        await seeded(b.orgId, new Date(monthStart.getTime() - 15 * MINUTE));
        await seeded(b.orgId, new Date(monthStart.getTime() - 10 * MINUTE));
        await expect(book(b.ownerId)).resolves.toHaveProperty("id");
        // This month in India, though still last month in UTC.
        await seeded(b.orgId, new Date(monthStart.getTime() + 15 * MINUTE));

        const byHand = await refused(book(b.ownerId));
        expect(byHand.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "bookingsPerMonth",
            limit: 2,
            used: 2,
        });
        // The booking page names no plan or limit, and holds nothing.
        const online = await refused(book(null), ConflictException);
        expect(online).toEqual({
            message: BOOKINGS_PAUSED_MESSAGE,
            details: { code: "BOOKINGS_PAUSED", reason: "bookingsPaused" },
        });
        expect(
            await prisma.booking.count({
                where: { organizationId: b.orgId, status: "PENDING" },
            }),
        ).toBe(0);
    });
});

describe("blog posts (DB, U13)", () => {
    it("refuses putting a post live past the cap; republishing is free", async () => {
        const b = await business("free");
        const site = await prisma.site.create({
            data: { organizationId: b.orgId, name: "Site", slug: uniq("s") },
        });
        const draft = () =>
            prisma.post.create({
                data: {
                    siteId: site.id,
                    title: "Post",
                    slug: uniq("p"),
                    content: "<p>Hi</p>",
                },
            });
        const one = await draft();
        await posts.publish(b.owner, site.id, one.id);
        await posts.publish(b.owner, site.id, (await draft()).id);
        const body = await refused(
            posts.publish(b.owner, site.id, (await draft()).id),
        );
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "blogPosts",
        });
        await expect(
            posts.publish(b.owner, site.id, one.id),
        ).resolves.toHaveProperty("publicationId");
    });
});

describe("team members (DB, U13)", () => {
    it("counts open invitations, and lets one be sent again", async () => {
        const b = await business("free");
        const invite = (email: string) =>
            members.invite(b.owner, { email, role: "MEMBER" } as never);
        const asha = `${uniq("asha")}@example.test`;
        await invite(asha);
        const body = await refused(invite(`${uniq("ravi")}@example.test`));
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "teamMembers",
            limit: 2,
            used: 2,
        });
        await expect(invite(asha)).resolves.toBeDefined();
    });
});

describe("integrations (DB, U13)", () => {
    it("refuses a new connection past the cap; changing one is free", async () => {
        const b = await business("free");
        const email = () =>
            comms.connectProvider(b.owner, {
                channel: "EMAIL",
                provider: "RESEND",
                fromAddress: "hi@example.test",
                credentials: { apiKey: "fake-key" },
            });
        await email();
        const body = await refused(
            comms.connectProvider(b.owner, {
                channel: "WHATSAPP",
                provider: "TWILIO",
                credentials: { apiKey: "fake-key" },
            }),
        );
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "integrations",
        });
        await expect(email()).resolves.toBeDefined();
    });
});

describe("switches: custom roles, themes, site review (DB, U13)", () => {
    it("refuses each where the plan leaves it off, and not where it's on", async () => {
        const free = await business("free");
        const pro = await business("pro");
        const role = (b: Business) =>
            roles.create(b.owner, { label: uniq("Baker"), actions: [] });
        expect((await refused(role(free))).details).toMatchObject({
            code: "MODULE_LOCKED",
            moduleId: "roles",
            upgradeTo: { planId: "pro" },
        });
        await expect(role(pro)).resolves.toHaveProperty("key");

        const siteOf = (b: Business) =>
            prisma.site.create({
                data: {
                    organizationId: b.orgId,
                    name: "Site",
                    slug: uniq("s"),
                },
            });
        const look = { colours: { accent: "teal" } };
        const freeSite = await siteOf(free);
        expect(
            (await refused(sites.updateStyle(free.owner, freeSite.id, look)))
                .details,
        ).toMatchObject({ code: "MODULE_LOCKED", moduleId: "themes" });
        const proSite = await siteOf(pro);
        await expect(
            sites.updateStyle(pro.owner, proSite.id, look),
        ).resolves.toHaveProperty("style");

        expect(
            (
                await refused(
                    prisma.$transaction((tx) =>
                        setPublishNeedsApproval(
                            tx,
                            free.owner,
                            freeSite.id,
                            true,
                        ),
                    ),
                )
            ).details,
        ).toMatchObject({ code: "MODULE_LOCKED", moduleId: "review" });
    });
});
