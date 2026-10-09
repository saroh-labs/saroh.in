/**
 * Every catalogue limit and lock, refused where the write happens (plans
 * catalogue U13, R7), against a real Postgres: products (made, copied,
 * brought back from the archive), orders a month taken by hand, bookings a
 * month made online (the booking page told only that the business isn't
 * taking bookings; the team's own bookings never capped, DEC-095), blog posts put live, team members invited, integrations
 * connected, websites made, locations turned into places customers visit,
 * Reviewers left off the team count, the soft caps (storage, visits) that
 * tell and never refuse, and the switches — custom roles, themes, site
 * review. Existing
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
// Connecting a provider encrypts its credentials: the test key the other
// specs use, so CI (which sets no PAYMENTS_ENC_KEY) runs it too.
jest.mock("../../env", () => {
    const actual = jest.requireActual<{ env: Record<string, unknown> }>(
        "../../env",
    );
    return {
        ...actual,
        env: {
            ...actual.env,
            PAYMENTS_ENC_KEY:
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
    };
});

import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { Service } from "@saroh/database";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../test/business-details";
import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    ANALYTICS_AGGREGATE_TYPE,
    AnalyticsAggregateHandler,
} from "../analytics/analytics-aggregate.handler";
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
import { SiteTrackingService } from "../sites/site-tracking.service";
import { SitesService } from "../sites/sites.service";
import { StaffService } from "../staff/staff.service";
import { StorefrontsService } from "../stores/storefronts.service";
import { StoresService } from "../stores/stores.service";
import { EntitlementService } from "./entitlement.service";
import { countUsage, monthWindow } from "./metering";
import { PLAN_LIMIT_NOTICE_TYPE } from "./metering.service";
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
const tracking = new SiteTrackingService();
const storefronts = new StorefrontsService();
const staff = new StaffService();
const aggregate = new AnalyticsAggregateHandler();

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
    // An override needs the flag's definition row (FeatureFlagOverride_flagKey_fkey).
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
        update: {},
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
                walkIn: { name: "Asha" },
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
                bookedOnline: true,
                createdAt,
            },
        });

    it("counts the month's online bookings in the business's zone, then pauses the booking page only", async () => {
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
        // One made online counts…
        await expect(book(null)).resolves.toMatchObject({
            bookedOnline: true,
        });
        // This month in India, though still last month in UTC.
        await seeded(b.orgId, new Date(monthStart.getTime() + 15 * MINUTE));
        expect(await countUsage(prisma, b.orgId, "bookingsPerMonth")).toBe(2);

        // …one the team makes at the desk is never capped, nor counted
        // (DEC-095).
        await expect(book(b.ownerId)).resolves.toMatchObject({
            bookedOnline: false,
        });
        await expect(book(b.ownerId)).resolves.toHaveProperty("id");
        expect(await countUsage(prisma, b.orgId, "bookingsPerMonth")).toBe(2);

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

describe("bookable staff use team seats (DB, DEC-105, UX-053)", () => {
    it("counts someone on the diary with no login, and frees the seat when archived", async () => {
        const b = await business("free");
        // The owner and one person with no login fill Plan A's two seats.
        const asha = await staff.create(b.owner, { name: "Asha" });
        expect(await countUsage(prisma, b.orgId, "teamMembers")).toBe(2);
        const body = await refused(staff.create(b.owner, { name: "Ravi" }));
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "teamMembers",
            limit: 2,
            used: 2,
        });
        // Invites stop too: the seat is taken.
        await refused(
            members.invite(b.owner, {
                email: `${uniq("meena")}@example.test`,
                role: "MEMBER",
            } as never),
        );

        await staff.archive(b.owner, asha.id);
        const ravi = await staff.create(b.owner, { name: "Ravi" });
        // Asha back would take a third seat.
        await refused(staff.update(b.owner, asha.id, { status: "ACTIVE" }));
        // The owner on the diary is counted once, through their membership.
        const own = await prisma.membership.findFirstOrThrow({
            where: { organizationId: b.orgId, userId: b.ownerId },
        });
        await staff.archive(b.owner, ravi.id);
        await staff.create(b.owner, { name: "Owner", membershipId: own.id });
        expect(await countUsage(prisma, b.orgId, "teamMembers")).toBe(1);
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

describe("websites (DB, U13)", () => {
    it("makes the plan's last website, then refuses the next with the notice", async () => {
        const b = await business("free");
        await giveBusinessDetails(b.orgId);
        await sites.createFromTemplate(b.owner, { name: "Rye" });
        const body = await refused(
            sites.createFromTemplate(b.owner, {
                name: "Rye two",
                subdomain: uniq("rye"),
            }),
        );
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "sites",
            limit: 1,
            used: 1,
        });
        expect(
            await prisma.site.count({ where: { organizationId: b.orgId } }),
        ).toBe(1);
    });

    it("lets a plan that sells two have two", async () => {
        const b = await business("grow");
        await giveBusinessDetails(b.orgId);
        await sites.createFromTemplate(b.owner, { name: "Rye" });
        await expect(
            sites.createFromTemplate(b.owner, {
                name: "Rye two",
                subdomain: uniq("rye"),
            }),
        ).resolves.toHaveProperty("siteId");
    });

    it("with the switch off, one website per business as before", async () => {
        const b = await business("grow", false);
        await giveBusinessDetails(b.orgId);
        await sites.createFromTemplate(b.owner, { name: "Rye" });
        const body = await refused(
            sites.createFromTemplate(b.owner, {
                name: "Rye two",
                subdomain: uniq("rye"),
            }),
            ConflictException,
        );
        expect(body.message).toMatch(/already has its website/);
    });
});

describe("locations customers visit (DB, U13)", () => {
    it("refuses a storefront becoming a shop past the cap; online ones are free", async () => {
        const b = await business("free");
        await storefronts.update(b.orgId, b.storeId, { kind: "SHOP" });
        // The old floor of storefronts isn't asked: online ones don't count.
        const more: string[] = [];
        for (let i = 0; i < 5; i++) {
            more.push(
                (
                    await stores.createForUser(b.ownerId, b.orgId, {
                        name: `Online ${i}`,
                    })
                ).id,
            );
        }
        const body = await refused(
            storefronts.update(b.orgId, more[0], { kind: "SHOP" }),
        );
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "shopLocations",
            limit: 1,
            used: 1,
        });
        const saved = await prisma.storeSettings.findUnique({
            where: { storeId: more[0] },
            select: { kind: true },
        });
        expect(saved?.kind ?? "ONLINE").toBe("ONLINE");
        // Saving the shop again adds nothing.
        await expect(
            storefronts.update(b.orgId, b.storeId, { kind: "SHOP" }),
        ).resolves.toMatchObject({ kind: "SHOP" });
    });

    it("with the switch off, the old floor caps shops, never online storefronts", async () => {
        const b = await business("free", false);
        // Online-only ones are 0 locations (owner, 8 Oct): past the floor's
        // five storefronts, a sixth is still made.
        const more: string[] = [];
        for (let i = 0; i < 5; i++) {
            more.push(
                (
                    await stores.createForUser(b.ownerId, b.orgId, {
                        name: `S ${i}`,
                    })
                ).id,
            );
        }
        // Five become shops: the floor's five places customers visit.
        await storefronts.update(b.orgId, b.storeId, { kind: "SHOP" });
        for (const id of more.slice(0, 4)) {
            await storefronts.update(b.orgId, id, { kind: "SHOP" });
        }
        expect(await countUsage(prisma, b.orgId, "shopLocations")).toBe(5);
        const body = await refused(
            storefronts.update(b.orgId, more[4], { kind: "SHOP" }),
        );
        expect(body.message).toBe(
            "Your plan includes 5 places customers visit. A bigger plan adds more.",
        );
        const saved = await prisma.storeSettings.findUnique({
            where: { storeId: more[4] },
            select: { kind: true },
        });
        expect(saved?.kind ?? "ONLINE").toBe("ONLINE");
    });
});

describe("team members leave Reviewers out (DB, U13)", () => {
    it("invites a Reviewer at the cap, and refuses making them a Member", async () => {
        const b = await business("free");
        const site = await prisma.site.create({
            data: { organizationId: b.orgId, name: "Site", slug: uniq("s") },
        });
        // Plan A has 2: the owner and one open invitation.
        await members.invite(b.owner, {
            email: `${uniq("asha")}@example.test`,
            role: "MEMBER",
        } as never);
        await expect(
            members.invite(b.owner, {
                email: `${uniq("rev")}@example.test`,
                role: "REVIEWER",
                siteIds: [site.id],
            } as never),
        ).resolves.toBeDefined();

        const reviewer = await prisma.user.create({
            data: { email: `${uniq("r")}@example.test` },
        });
        await prisma.membership.create({
            data: {
                organizationId: b.orgId,
                userId: reviewer.id,
                role: "REVIEWER",
            },
        });
        const body = await refused(
            members.updateRole(b.owner, reviewer.id, { role: "MEMBER" }),
        );
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "teamMembers",
            limit: 2,
            used: 2,
        });
        const still = await prisma.membership.findUniqueOrThrow({
            where: {
                organizationId_userId: {
                    organizationId: b.orgId,
                    userId: reviewer.id,
                },
            },
            select: { role: true },
        });
        expect(still.role).toBe("REVIEWER");
    });
});

describe("site visits, soft (DB, U13)", () => {
    it("tells the business from the rollup, and never stops the site", async () => {
        const b = await business("free");
        const today = new Date();
        // Plan A has 11 visits a month: 9 is 80%.
        for (let i = 0; i < 9; i++) {
            await prisma.analyticsEvent.create({
                data: {
                    organizationId: b.orgId,
                    type: "site.view",
                    properties: { path: "/" },
                    occurredAt: today,
                },
            });
        }
        await aggregate.handle({
            id: uniq("job"),
            type: ANALYTICS_AGGREGATE_TYPE,
            payload: {
                organizationId: b.orgId,
                date: today.toISOString(),
            },
        } as never);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.orgId,
                    type: PLAN_LIMIT_NOTICE_TYPE,
                },
            }),
        ).toBe(1);
        // Recounting the same day adds nothing, and tells nothing again.
        await aggregate.handle({
            id: uniq("job"),
            type: ANALYTICS_AGGREGATE_TYPE,
            payload: {
                organizationId: b.orgId,
                date: today.toISOString(),
            },
        } as never);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.orgId,
                    type: PLAN_LIMIT_NOTICE_TYPE,
                },
            }),
        ).toBe(1);
    });
});

describe("a merchant's own trackers (DB, DEC-108)", () => {
    const siteOf = (b: Business) =>
        prisma.site.create({
            data: { organizationId: b.orgId, name: "Site", slug: uniq("s") },
        });
    const ga4 = { trackers: { ga4: { id: "G-ABC1234" } } };

    it("refuses adding one where the plan leaves it off, and not where it's on", async () => {
        const free = await business("free");
        const freeSite = await siteOf(free);
        expect(
            (await refused(tracking.save(free.owner, freeSite.id, ga4)))
                .details,
        ).toMatchObject({ code: "MODULE_LOCKED", moduleId: "site-trackers" });
        // Verification codes are on every plan.
        await expect(
            tracking.save(free.owner, freeSite.id, {
                verifications: { google: "abcDEF123_-ghiJKL456mnoPQR" },
            }),
        ).resolves.toMatchObject({
            verifications: { google: "abcDEF123_-ghiJKL456mnoPQR" },
        });

        const grow = await business("grow");
        const growSite = await siteOf(grow);
        await expect(
            tracking.save(grow.owner, growSite.id, ga4),
        ).resolves.toMatchObject({
            trackers: [{ kind: "ga4", trackerId: "G-ABC1234", enabled: true }],
        });
    });

    it("lets a business that moved to Free change or remove what it kept", async () => {
        const b = await business("free");
        const site = await siteOf(b);
        // Saved while on a paid plan.
        await prisma.siteTracker.create({
            data: {
                siteId: site.id,
                organizationId: b.orgId,
                kind: "ga4",
                trackerId: "G-ABC1234",
            },
        });
        await expect(
            tracking.save(b.owner, site.id, {
                trackers: { ga4: { id: "G-NEW9999" } },
            }),
        ).resolves.toMatchObject({ trackers: [{ trackerId: "G-NEW9999" }] });
        await expect(
            tracking.save(b.owner, site.id, { trackers: { ga4: null } }),
        ).resolves.toMatchObject({ trackers: [] });
    });

    it("with the switch off, refuses nothing", async () => {
        const b = await business("free", false);
        const site = await siteOf(b);
        await expect(
            tracking.save(b.owner, site.id, ga4),
        ).resolves.toBeDefined();
    });
});
