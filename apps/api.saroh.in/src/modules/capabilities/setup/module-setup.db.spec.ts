/**
 * DEC-068 against a real Postgres: turning a module on with its minimum.
 *
 * - each module's setup creates the minimum and the module is ACTIVE, or
 *   shows only its "Finish setup" blockers (publish, a provider);
 * - an invalid setup is a 400 naming its fields, and writes nothing;
 * - a failure inside the transaction writes nothing — not the rows, not the
 *   switch, not its audit event;
 * - a second enable applies nothing (`alreadyEnabled`);
 * - the previous app's call, without setup, behaves as before;
 * - the defaults the sheet prefills, and how they follow the kind (K8,
 *   and Website's template, K15);
 * - Automations is refused and hidden, a setting already on kept;
 * - `module:manage`, and the action for what a setup creates, are enforced.
 *
 * Every business here is its own, made by this file.
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { EntitlementService } from "../../billing/entitlement.service";
import { FixedWindowRateLimiter } from "../../bookings/rate-limiter";
import { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { FLAG_KEYS } from "../../feature-flags/flags";
import type { OrgAction } from "../../organizations/organization-actions";
import { PublicCatalogueService } from "../../products/public-catalogue.service";
import { automaticStorefront } from "../../sites/sells-from";
import { ModuleAvailabilityService } from "../module-availability.service";
import { ModuleLifecycleService } from "../module-lifecycle.service";
import type { ModuleKey } from "../module-registry";
import { ModuleReadinessRegistry } from "../readiness/module-readiness.registry";
import { ModuleSetupService } from "./module-setup.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;

const flags = new FeatureFlagService();
const entitlements = new EntitlementService();
const readiness = new ModuleReadinessRegistry();
const lifecycle = new ModuleLifecycleService(
    readiness,
    prisma,
    undefined,
    flags,
);
const availability = new ModuleAvailabilityService(
    flags,
    entitlements,
    readiness,
);
const setup = new ModuleSetupService(lifecycle, entitlements, flags);

async function business(
    name = "Rye Studio",
    kind?: "BUSINESS" | "SOLO" | "WORK",
): Promise<OrganizationContext> {
    seq += 1;
    const user = await prisma.user.create({
        data: { email: `m1-${tag}-${seq}@example.com` },
    });
    const org = await prisma.organization.create({
        data: { name, slug: `m1-${seq}-${tag}`, ...(kind ? { kind } : {}) },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

function view(ctx: OrganizationContext, moduleKey: ModuleKey) {
    return availability.view({
        organizationId: ctx.organizationId,
        organizationRole: "OWNER",
        moduleKey,
    });
}

async function status(ctx: OrganizationContext, moduleKey: ModuleKey) {
    const row = await prisma.organizationModule.findUnique({
        where: {
            organizationId_moduleKey: {
                organizationId: ctx.organizationId,
                moduleKey,
            },
        },
        select: { status: true },
    });
    return row?.status ?? null;
}

function enabledEvents(ctx: OrganizationContext, moduleKey: ModuleKey) {
    return prisma.auditEvent.count({
        where: {
            organizationId: ctx.organizationId,
            action: "organization.module.enabled",
            targetId: moduleKey,
        },
    });
}

/** The refusal's response body, or fails. */
async function refusal(p: Promise<unknown>, type: unknown) {
    const e = await p.then(
        () => null,
        (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(type as never);
    return (e as BadRequestException).getResponse() as {
        message: string;
        details?: {
            field?: string;
            fields?: { field: string }[];
            suggestion?: string;
        };
    };
}

const HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    open: "10:00",
    close: "19:00",
}));

beforeAll(async () => {
    // Every module rolled out — Automations too, to show hiding it doesn't
    // wait on its flag.
    for (const key of FLAG_KEYS.filter((k) => k.startsWith("MODULE_"))) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
    }
});

describe("Sell (COMMERCE)", () => {
    it("makes the storefront with its ways, and Sell is ready", async () => {
        const ctx = await business();
        const out = await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Rye Bakery",
            fulfilment: ["LOCAL_DELIVERY", "PICKUP"],
        });
        expect(out.alreadyEnabled).toBe(false);
        const store = await prisma.store.findUniqueOrThrow({
            where: { id: out.created.storefrontId },
            include: { settings: true, owners: true },
        });
        expect(store).toMatchObject({
            name: "Rye Bakery",
            organizationId: ctx.organizationId,
            // No storefront "Web address" any more (DEC-069, L14).
            slug: null,
        });
        expect(store.settings).toMatchObject({
            // Table order, the old toggles in step, the business's currency.
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
            collectionEnabled: true,
            shippingEnabled: true,
            currency: "INR",
        });
        expect(store.owners).toEqual([
            expect.objectContaining({ userId: ctx.userId, role: "OWNER" }),
        ]);
        expect(await status(ctx, "COMMERCE")).toBe("ENABLED");
        expect(await enabledEvents(ctx, "COMMERCE")).toBe(1);
        expect((await view(ctx, "COMMERCE")).readiness).toBe("ACTIVE");
    });

    it("starts a pick-up location from the registered address (UX-025)", async () => {
        const ctx = await business();
        await prisma.businessProfile.create({
            data: {
                organizationId: ctx.organizationId,
                addressLine1: "12 Hill Road",
                city: "Mumbai",
                postalCode: "400050",
            },
        });
        const out = await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Hill Road",
            fulfilment: ["PICKUP"],
        });
        const settings = await prisma.storeSettings.findUniqueOrThrow({
            where: { storeId: out.created.storefrontId },
        });
        expect(settings).toMatchObject({
            kind: "SHOP",
            address: "12 Hill Road, Mumbai 400050",
        });
    });

    it("renames the first storefront there is and sets its ways; none added", async () => {
        const ctx = await business();
        const first = await prisma.store.create({
            data: {
                name: "Old name",
                slug: `m1-old-${tag}-${seq}`,
                organizationId: ctx.organizationId,
                settings: {
                    create: { currency: "INR", fulfilmentTypes: ["SHIPPING"] },
                },
            },
        });
        const out = await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Rye Counter",
            fulfilment: ["PICKUP"],
        });
        expect(out.created.storefrontId).toBe(first.id);
        const stores = await prisma.store.findMany({
            where: { organizationId: ctx.organizationId },
            include: { settings: true },
        });
        expect(stores).toHaveLength(1);
        expect(stores[0]?.name).toBe("Rye Counter");
        expect(stores[0]?.settings).toMatchObject({
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
            shippingEnabled: false,
        });
    });

    it("applies nothing the second time, and says it was on", async () => {
        const ctx = await business();
        await setup.enable(ctx, "COMMERCE", {
            storefrontName: "First",
            fulfilment: ["PICKUP"],
        });
        const again = await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Second",
            fulfilment: ["SHIPPING"],
        });
        expect(again).toEqual({ alreadyEnabled: true, created: {} });
        // Not validated either: a retry of a saved sheet never fails.
        await expect(
            setup.enable(ctx, "COMMERCE", { nonsense: true }),
        ).resolves.toEqual({ alreadyEnabled: true, created: {} });
        const stores = await prisma.store.findMany({
            where: { organizationId: ctx.organizationId },
        });
        expect(stores.map((s) => s.name)).toEqual(["First"]);
        expect(await enabledEvents(ctx, "COMMERCE")).toBe(1);
    });

    it("refuses an invalid setup with its fields, and writes nothing", async () => {
        const ctx = await business();
        const r = await refusal(
            setup.enable(ctx, "COMMERCE", {
                storefrontName: "",
                fulfilment: ["DIGITAL"],
            }),
            BadRequestException,
        );
        expect(r.details?.fields?.map((f) => f.field)).toEqual([
            "setup.storefrontName",
            "setup.fulfilment",
        ]);
        expect(await status(ctx, "COMMERCE")).toBeNull();
        expect(
            await prisma.store.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
    });
});

describe("Contacts, Bookings and what needs what", () => {
    it("Bookings waits for Contacts: the API never turns a dependency on", async () => {
        const ctx = await business();
        const r = await refusal(
            setup.enable(ctx, "APPOINTMENTS", {
                hours: HOURS,
                service: { name: "Haircut", durationMinutes: 45, price: "500" },
            }),
            BadRequestException,
        );
        expect(r.message).toBe("Appointments needs CRM. Turn on CRM first.");
        expect(await status(ctx, "APPOINTMENTS")).toBeNull();
        expect(await status(ctx, "CRM")).toBeNull();
        expect(
            await prisma.service.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
    });

    it("Contacts makes the Sales pipeline; Bookings its service and hours — both ready", async () => {
        const ctx = await business();
        const crm = await setup.enable(ctx, "CRM", {});
        const pipeline = await prisma.pipeline.findUniqueOrThrow({
            where: { id: crm.created.pipelineId },
            include: { stages: { orderBy: { order: "asc" } } },
        });
        expect(pipeline).toMatchObject({ name: "Sales", isDefault: true });
        expect(pipeline.stages.map((s) => s.name)).toEqual([
            "New",
            "Contacted",
            "Qualified",
            "Won",
            "Lost",
        ]);
        expect((await view(ctx, "CRM")).readiness).toBe("ACTIVE");

        const out = await setup.enable(ctx, "APPOINTMENTS", {
            hours: [...HOURS, { weekday: 0, open: "09:30", close: "12:00" }],
            service: { name: "Haircut", durationMinutes: 45, price: "499.50" },
        });
        const service = await prisma.service.findUniqueOrThrow({
            where: { id: out.created.serviceId },
            include: { availabilityRules: { orderBy: { dayOfWeek: "asc" } } },
        });
        expect(service).toMatchObject({
            name: "Haircut",
            durationMinutes: 45,
            priceCents: 49950,
            currency: "INR",
            timezone: "Asia/Kolkata",
            status: "ACTIVE",
        });
        expect(service.availabilityRules).toHaveLength(7);
        expect(service.availabilityRules[0]).toMatchObject({
            dayOfWeek: 0,
            startMinute: 570,
            endMinute: 720,
        });
        expect(service.availabilityRules[1]).toMatchObject({
            dayOfWeek: 1,
            startMinute: 600,
            endMinute: 1140,
        });
        expect((await view(ctx, "APPOINTMENTS")).readiness).toBe("ACTIVE");
    });

    it("prices the first service in the business's currency, not INR", async () => {
        const ctx = await business("Rye London");
        await prisma.store.create({
            data: {
                name: "Rye Counter",
                slug: `m1-gbp-${tag}-${seq}`,
                organizationId: ctx.organizationId,
                settings: { create: { currency: "GBP" } },
            },
        });
        await setup.enable(ctx, "CRM", {});
        const out = await setup.enable(ctx, "APPOINTMENTS", {
            hours: HOURS,
            service: { name: "Haircut", durationMinutes: 45, price: "35" },
        });
        const service = await prisma.service.findUniqueOrThrow({
            where: { id: out.created.serviceId },
        });
        expect(service).toMatchObject({ priceCents: 3500, currency: "GBP" });
    });

    it("keeps what a business had: no second pipeline or service, a blank price is none", async () => {
        const ctx = await business();
        await prisma.businessProfile.create({
            data: {
                organizationId: ctx.organizationId,
                timezone: "Europe/London",
            },
        });
        const own = await prisma.pipeline.create({
            data: { organizationId: ctx.organizationId, name: "Mine" },
        });
        const crm = await setup.enable(ctx, "CRM", {});
        expect(crm.created.pipelineId).toBe(own.id);
        expect(
            await prisma.pipeline.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(1);

        const first = await setup.enable(ctx, "APPOINTMENTS", {
            hours: HOURS,
            service: { name: "Consult", durationMinutes: 30, price: "" },
        });
        const service = await prisma.service.findUniqueOrThrow({
            where: { id: first.created.serviceId },
        });
        expect(service).toMatchObject({
            priceCents: null,
            currency: null,
            timezone: "Europe/London",
        });

        // Off and on again: its service and hours are still there.
        await lifecycle.disable(ctx, "APPOINTMENTS");
        const again = await setup.enable(ctx, "APPOINTMENTS", {
            hours: HOURS,
            service: { name: "Another", durationMinutes: 60, price: "100" },
        });
        expect(again).toEqual({
            alreadyEnabled: false,
            created: { serviceId: service.id },
        });
        expect(
            await prisma.service.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(1);
    });
});

describe("Website", () => {
    it("makes the starter site on its address, unpublished: Publish is all that's left", async () => {
        const ctx = await business("Pulse Yoga");
        const address = `pulse-${seq}-${tag}`;
        const out = await setup.enable(ctx, "WEBSITE", {
            siteName: "Pulse Yoga",
            address,
        });
        expect(out.created.siteAddress).toBe(address);
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: out.created.siteId },
            include: { pages: true },
        });
        expect(site).toMatchObject({ name: "Pulse Yoga", subdomain: address });
        expect(site.pages.length).toBeGreaterThan(0);
        expect(
            await prisma.publication.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        const v = await view(ctx, "WEBSITE");
        expect(v.readiness).toBe("SETUP_REQUIRED");
        expect(v.blockers.map((b) => b.code)).toEqual([
            "WEBSITE_NO_PUBLICATION",
        ]);
    });

    it("an address in use fails the whole transaction: no site, no switch, no event — and suggests a free one", async () => {
        const other = await business("Other");
        const taken = `taken-${seq}-${tag}`;
        await prisma.site.create({
            data: {
                organizationId: other.organizationId,
                name: "Other",
                slug: "other",
                subdomain: taken,
            },
        });
        const ctx = await business();
        const r = await refusal(
            setup.enable(ctx, "WEBSITE", { siteName: "Rye", address: taken }),
            ConflictException,
        );
        expect(r.details).toMatchObject({
            field: "setup.address",
            suggestion: `${taken}-2`,
        });
        // The switch and its audit event were written inside the
        // transaction before the site failed: both rolled back.
        expect(await status(ctx, "WEBSITE")).toBeNull();
        expect(await enabledEvents(ctx, "WEBSITE")).toBe(0);
        expect(
            await prisma.site.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
    });

    it("refuses another business's reserved address and a bad one, naming setup.address", async () => {
        const other = await business("Other");
        const ctx = await business();
        const reserved = await prisma.organization.findUniqueOrThrow({
            where: { id: other.organizationId },
            select: { slug: true },
        });
        const r = await refusal(
            setup.enable(ctx, "WEBSITE", {
                siteName: "Rye",
                address: reserved.slug,
            }),
            ConflictException,
        );
        expect(r.details).toMatchObject({
            field: "setup.address",
            suggestion: `${reserved.slug}-2`,
        });
        const bad = await refusal(
            setup.enable(ctx, "WEBSITE", { siteName: "Rye", address: "admin" }),
            BadRequestException,
        );
        expect(bad).toEqual({
            message: "That address is kept for Saroh",
            details: { field: "setup.address" },
        });
        expect(await status(ctx, "WEBSITE")).toBeNull();
    });

    it("keeps a website the business already has", async () => {
        const ctx = await business();
        const site = await prisma.site.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Kept",
                slug: "kept",
                subdomain: `kept-${seq}-${tag}`,
            },
        });
        const out = await setup.enable(ctx, "WEBSITE", {
            siteName: "Ignored",
            address: `new-${seq}-${tag}`,
        });
        expect(out.created).toEqual({
            siteId: site.id,
            siteAddress: site.subdomain,
        });
        expect(
            await prisma.site.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(1);
    });
});

describe("selling online leaves the shop ready to publish (DEC-069, L13)", () => {
    /** The shop open for the business (`SITE_SHOP`), as it is rolled out. */
    async function shopOpen(ctx: OrganizationContext) {
        await prisma.featureFlag.upsert({
            where: { key: "SITE_SHOP" },
            create: { key: "SITE_SHOP", enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "SITE_SHOP",
                organizationId: ctx.organizationId,
                enabled: true,
            },
        });
    }

    function siteOf(ctx: OrganizationContext) {
        return prisma.site.findFirstOrThrow({
            where: { organizationId: ctx.organizationId },
            include: {
                pages: {
                    include: { versions: { select: { status: true } } },
                },
            },
        });
    }

    const shopPages = (site: Awaited<ReturnType<typeof siteOf>>) =>
        site.pages.filter((p) => p.kind === "SHOP");

    /** Sell, then Website: the order the Turn on sheet sends them in. */
    async function sellThenWebsite(
        ctx: OrganizationContext,
        fulfilment: string[],
        address = `l13-${seq}-${tag}`,
    ) {
        const sell = await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Rye Counter",
            fulfilment,
        });
        const website = await setup.enable(ctx, "WEBSITE", {
            siteName: "Rye",
            address,
        });
        return { sell, website };
    }

    it("a fresh business with Delivery: the site sells from the new location and has a draft Shop page", async () => {
        const ctx = await business("Rye Bakery");
        await shopOpen(ctx);
        const { sell } = await sellThenWebsite(ctx, ["LOCAL_DELIVERY"]);

        const site = await siteOf(ctx);
        expect(site.storefrontId).toBe(sell.created.storefrontId);
        const shop = shopPages(site);
        expect(shop).toHaveLength(1);
        expect(shop[0]).toMatchObject({
            path: "/shop",
            title: "Shop",
            inMenu: true,
        });
        expect(shop[0]?.versions.map((v) => v.status)).toEqual(["DRAFT"]);

        // Ready to publish, not published: `/shop` is still a 404 — no
        // publication, and nothing listed yet.
        expect(
            await prisma.publication.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        await expect(
            new PublicCatalogueService(new FixedWindowRateLimiter(100)).list(
                site.id,
                "visitor",
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("pick-up only: no Shop page, and no website is made", async () => {
        const ctx = await business();
        await shopOpen(ctx);
        await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Counter",
            fulfilment: ["PICKUP"],
        });
        expect(
            await prisma.site.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        expect(
            await prisma.page.count({
                where: { organizationId: ctx.organizationId, kind: "SHOP" },
            }),
        ).toBe(0);
    });

    it("pick-up only with a website of its own: no Shop page, the site still sells from the location", async () => {
        const ctx = await business();
        await shopOpen(ctx);
        const { sell } = await sellThenWebsite(ctx, ["PICKUP"]);
        const site = await siteOf(ctx);
        expect(shopPages(site)).toHaveLength(0);
        expect(site.storefrontId).toBe(sell.created.storefrontId);
    });

    it("two open locations and none listed: nothing is chosen on its own, and the sheet's location is the one the site sells from", async () => {
        const ctx = await business();
        await shopOpen(ctx);
        const first = await prisma.store.create({
            data: {
                name: "Old name",
                slug: `l13-a-${seq}-${tag}`,
                organizationId: ctx.organizationId,
            },
        });
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `l13-b-${seq}-${tag}`,
                organizationId: ctx.organizationId,
            },
        });
        await expect(
            automaticStorefront(prisma, ctx.organizationId),
        ).resolves.toBeNull();

        const { sell } = await sellThenWebsite(ctx, ["SHIPPING", "PICKUP"]);
        expect(sell.created.storefrontId).toBe(first.id);
        const site = await siteOf(ctx);
        expect(site.storefrontId).toBe(first.id);
        expect(shopPages(site)).toHaveLength(1);
    });

    it("Website first, then Sell with Shipping: Sell completes the link", async () => {
        const ctx = await business();
        await shopOpen(ctx);
        await setup.enable(ctx, "WEBSITE", {
            siteName: "Rye",
            address: `l13-w-${seq}-${tag}`,
        });
        expect(shopPages(await siteOf(ctx))).toHaveLength(0);

        const sell = await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Rye Counter",
            fulfilment: ["SHIPPING"],
        });
        const site = await siteOf(ctx);
        expect(site.storefrontId).toBe(sell.created.storefrontId);
        expect(shopPages(site)).toHaveLength(1);
    });

    it("turned off and on again: nothing is duplicated, and a site's own Sells from and pages are kept", async () => {
        const ctx = await business();
        await shopOpen(ctx);
        await sellThenWebsite(ctx, ["LOCAL_DELIVERY"]);
        const before = await siteOf(ctx);

        // The merchant points the site elsewhere and renames the page.
        const other = await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `l13-c-${seq}-${tag}`,
                organizationId: ctx.organizationId,
            },
        });
        await prisma.site.update({
            where: { id: before.id },
            data: { storefrontId: other.id },
        });
        await prisma.page.updateMany({
            where: { siteId: before.id, kind: "SHOP" },
            data: { title: "Bakes" },
        });

        await lifecycle.disable(ctx, "WEBSITE");
        await lifecycle.disable(ctx, "COMMERCE");
        await sellThenWebsite(ctx, ["LOCAL_DELIVERY", "SHIPPING"]);

        const after = await siteOf(ctx);
        expect(
            await prisma.site.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(1);
        expect(after.storefrontId).toBe(other.id);
        expect(after.pages).toHaveLength(before.pages.length);
        expect(shopPages(after).map((p) => p.title)).toEqual(["Bakes"]);
    });

    it("a page of the merchant's own at /shop keeps it, and the turn-on still succeeds", async () => {
        const ctx = await business();
        await shopOpen(ctx);
        await setup.enable(ctx, "WEBSITE", {
            siteName: "Rye",
            address: `l13-h-${seq}-${tag}`,
        });
        const site = await siteOf(ctx);
        await prisma.page.create({
            data: {
                siteId: site.id,
                organizationId: ctx.organizationId,
                path: "/shop",
                title: "Our shop",
            },
        });
        const out = await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Counter",
            fulfilment: ["SHIPPING"],
        });
        expect(out.alreadyEnabled).toBe(false);
        const after = await siteOf(ctx);
        expect(shopPages(after)).toHaveLength(0);
        expect(after.pages.filter((p) => p.path === "/shop")).toHaveLength(1);
    });

    it("the shop not open for the business: no Shop page is made (DEC-057)", async () => {
        const ctx = await business();
        await sellThenWebsite(ctx, ["LOCAL_DELIVERY"]);
        const site = await siteOf(ctx);
        expect(shopPages(site)).toHaveLength(0);
        // The link is still made: it is the business's answer, shop or not.
        expect(site.storefrontId).not.toBeNull();
    });

    it("a business already listing at several locations is asked, not given the first", async () => {
        const ctx = await business();
        await shopOpen(ctx);
        const product = await prisma.product.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Loaf",
                slug: "loaf",
                price: "300.00",
                currency: "INR",
                status: "PUBLISHED",
            },
        });
        for (const name of ["Old name", "Hill Road"]) {
            const store = await prisma.store.create({
                data: {
                    name,
                    slug: `l13-${name.replace(" ", "")}-${seq}-${tag}`,
                    organizationId: ctx.organizationId,
                },
            });
            await prisma.productListing.create({
                data: {
                    organizationId: ctx.organizationId,
                    productId: product.id,
                    storeId: store.id,
                },
            });
        }
        // Sell first, with no site: nothing to link yet.
        await setup.enable(ctx, "COMMERCE", {
            storefrontName: "Old name",
            fulfilment: ["SHIPPING"],
        });
        await setup.enable(ctx, "WEBSITE", {
            siteName: "Rye",
            address: `l13-l-${seq}-${tag}`,
        });
        const site = await siteOf(ctx);
        expect(site.storefrontId).toBeNull();
        expect(shopPages(site)).toHaveLength(1);
    });
});

describe("modules that ask nothing", () => {
    it("Payments switches on with nothing made; connecting a provider is left", async () => {
        const ctx = await business();
        const out = await setup.enable(ctx, "PAYMENTS", {});
        expect(out).toEqual({ alreadyEnabled: false, created: {} });
        const v = await view(ctx, "PAYMENTS");
        expect(v.readiness).toBe("SETUP_REQUIRED");
        expect(v.blockers.map((b) => b.code)).toEqual(["PAYMENTS_NO_PROVIDER"]);
    });

    it("refuses anything sent with them", async () => {
        const ctx = await business();
        const r = await refusal(
            setup.enable(ctx, "INSIGHTS", { provider: "x" }),
            BadRequestException,
        );
        expect(r.details?.field).toBe("setup.provider");
        expect(await status(ctx, "INSIGHTS")).toBeNull();
    });
});

describe("the previous app's call, without setup", () => {
    it("switches the module on and creates nothing, as before", async () => {
        const ctx = await business();
        await expect(lifecycle.enable(ctx, "CRM")).resolves.toBe(true);
        await expect(lifecycle.enable(ctx, "CRM")).resolves.toBe(false);
        expect(await status(ctx, "CRM")).toBe("ENABLED");
        expect(
            await prisma.pipeline.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
        expect((await view(ctx, "CRM")).blockers.map((b) => b.code)).toEqual([
            "CRM_NO_PIPELINE",
        ]);
    });
});

describe("setup-defaults", () => {
    it("prefills from the business", async () => {
        const ctx = await business("Northwind Salon");
        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: ctx.organizationId },
        });

        const commerce = await setup.defaults(ctx, "COMMERCE");
        expect(commerce).toEqual({
            moduleKey: "COMMERCE",
            hidden: false,
            dependencies: [],
            setup: {
                storefrontName: "Northwind Salon",
                fulfilment: ["PICKUP"],
            },
            existing: null,
            alsoWebsite: true,
        });

        const appointments = await setup.defaults(ctx, "APPOINTMENTS");
        expect(appointments).toMatchObject({
            dependencies: ["CRM"],
            existing: null,
            setup: {
                hours: HOURS,
                service: { name: "", durationMinutes: 60, price: "" },
            },
        });

        const website = await setup.defaults(ctx, "WEBSITE");
        expect(website.setup).toEqual({
            siteName: "Northwind Salon",
            address: org.slug,
        });

        // Class packs needs Bookings, which needs Contacts: Contacts first.
        expect((await setup.defaults(ctx, "CLASS_PACKS")).dependencies).toEqual(
            ["CRM", "APPOINTMENTS"],
        );
        // Every one it needs, on or off: the app skips those already on.
        await lifecycle.enable(ctx, "CRM");
        expect((await setup.defaults(ctx, "CLASS_PACKS")).dependencies).toEqual(
            ["CRM", "APPOINTMENTS"],
        );
        expect(await setup.defaults(ctx, "PAYMENTS")).toMatchObject({
            setup: {},
            existing: null,
            hidden: false,
        });
    });

    it("offers a free address when the business's own is in use, and names what there is", async () => {
        const other = await business("Other");
        const ctx = await business("Rye");
        const org = await prisma.organization.findUniqueOrThrow({
            where: { id: ctx.organizationId },
        });
        await prisma.site.create({
            data: {
                organizationId: other.organizationId,
                name: "Squatter",
                slug: "squatter",
                subdomain: org.slug,
            },
        });
        expect((await setup.defaults(ctx, "WEBSITE")).setup).toEqual({
            siteName: "Rye",
            address: `${org.slug}-2`,
        });

        const store = await prisma.store.create({
            data: {
                name: "Counter",
                slug: `m1-counter-${seq}-${tag}`,
                organizationId: ctx.organizationId,
                settings: {
                    create: {
                        currency: "INR",
                        fulfilmentTypes: ["PICKUP", "SHIPPING"],
                    },
                },
            },
        });
        expect(await setup.defaults(ctx, "COMMERCE")).toMatchObject({
            setup: {
                storefrontName: "Counter",
                fulfilment: ["PICKUP", "SHIPPING"],
            },
            existing: { storefrontId: store.id, name: "Counter" },
            alsoWebsite: true,
        });
        const site = await prisma.site.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Rye site",
                slug: "rye",
                subdomain: `${org.slug}-3`,
            },
        });
        expect(await setup.defaults(ctx, "COMMERCE")).toMatchObject({
            alsoWebsite: false,
        });
        expect(await setup.defaults(ctx, "WEBSITE")).toMatchObject({
            setup: { siteName: "Rye site", address: `${org.slug}-3` },
            existing: { siteId: site.id, address: `${org.slug}-3` },
        });
    });
});

describe("the Bookings prefill follows the kind (DEC-070, K8)", () => {
    const weekdays = (from: number, to: number, close: string) =>
        Array.from({ length: to - from + 1 }, (_, i) => ({
            weekday: from + i,
            open: "10:00",
            close,
        }));

    it("Just me: Mon–Fri 10:00–18:00 and an hour's Consultation, no price", async () => {
        const ctx = await business("Asha Rao", "SOLO");
        expect((await setup.defaults(ctx, "APPOINTMENTS")).setup).toEqual({
            hours: weekdays(1, 5, "18:00"),
            service: {
                name: "Consultation",
                durationMinutes: 60,
                price: "",
            },
        });
    });

    it("a business, one from before the kind, and a site for my work keep DEC-068's", async () => {
        const dec068 = {
            hours: HOURS,
            service: { name: "", durationMinutes: 60, price: "" },
        };
        for (const kind of ["BUSINESS", undefined, "WORK"] as const) {
            const ctx = await business("Northwind Salon", kind);
            expect((await setup.defaults(ctx, "APPOINTMENTS")).setup).toEqual(
                dec068,
            );
        }
    });

    it("only the prefill: Just me's edited suggestion is saved as sent", async () => {
        const ctx = await business("Asha Rao", "SOLO");
        await setup.enable(ctx, "CRM", {});
        const out = await setup.enable(ctx, "APPOINTMENTS", {
            hours: [{ weekday: 2, open: "09:00", close: "13:00" }],
            service: {
                name: "Portfolio review",
                durationMinutes: 30,
                price: "1500",
            },
        });
        const service = await prisma.service.findUniqueOrThrow({
            where: { id: out.created.serviceId },
            include: { availabilityRules: { orderBy: { dayOfWeek: "asc" } } },
        });
        expect(service).toMatchObject({
            name: "Portfolio review",
            durationMinutes: 30,
            priceCents: 150000,
        });
        // Not the prefill's Mon–Fri: the one day sent.
        expect(service.availabilityRules).toEqual([
            expect.objectContaining({
                dayOfWeek: 2,
                startMinute: 540,
                endMinute: 780,
            }),
        ]);
        expect(
            await prisma.service.count({
                where: {
                    organizationId: ctx.organizationId,
                    name: "Consultation",
                },
            }),
        ).toBe(0);
    });

    it("the other sheets don't change with the kind", async () => {
        const solo = await business("Asha Rao", "SOLO");
        const firm = await business("Asha Rao", "BUSINESS");
        for (const key of ["COMMERCE", "CRM", "PAYMENTS"] as const) {
            expect((await setup.defaults(solo, key)).setup).toEqual(
                (await setup.defaults(firm, key)).setup,
            );
        }
    });
});

describe("Website starts from the kind's template (DEC-070, K15)", () => {
    it("the sheet names the template a new site starts from", async () => {
        for (const [kind, template] of [
            ["BUSINESS", { id: "starter", name: "Starter" }],
            [undefined, { id: "starter", name: "Starter" }],
            ["SOLO", { id: "personal", name: "Personal" }],
            ["WORK", { id: "portfolio", name: "Portfolio" }],
        ] as const) {
            const ctx = await business("Asha Rao", kind);
            expect((await setup.defaults(ctx, "WEBSITE")).template).toEqual(
                template,
            );
        }
    });

    it("says nothing of a template once there is a site", async () => {
        const ctx = await business("Asha Rao", "WORK");
        await prisma.site.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Asha Rao",
                slug: "asha",
                subdomain: `k15-${seq}-${tag}`,
            },
        });
        expect((await setup.defaults(ctx, "WEBSITE")).template).toBeUndefined();
    });

    it("offers the catalogue to choose from instead, with the kind (U12)", async () => {
        const ctx = await business("Asha Rao", "WORK");
        const read = await setup.defaults(ctx, "WEBSITE");
        expect(read.kind).toBe("WORK");
        expect(read.templates).toContainEqual({
            id: "bakery",
            name: "Bakery",
            kinds: ["food"],
            uses: ["COMMERCE"],
        });
    });

    it("starts the site from the template chosen in the sheet (U12)", async () => {
        const ctx = await business("Asha Rao", "WORK");
        const out = await setup.enable(ctx, "WEBSITE", {
            siteName: "Asha Rao",
            address: `u12-${seq}-${tag}`,
            templateId: "writing",
        });
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: out.created.siteId },
            select: { templateId: true },
        });
        expect(site.templateId).toBe("writing");
    });

    it.each([
        ["WORK", ["/", "/about", "/work"]],
        ["BUSINESS", ["/", "/about"]],
    ] as const)(
        "%s: turning Website on drafts the kind's pages",
        async (kind, paths) => {
            const ctx = await business("Asha Rao", kind);
            const out = await setup.enable(ctx, "WEBSITE", {
                siteName: "Asha Rao",
                address: `k15-${seq}-${tag}`,
            });
            const pages = await prisma.page.findMany({
                where: { siteId: out.created.siteId },
                orderBy: { path: "asc" },
                select: { path: true },
            });
            expect(pages.map((p) => p.path)).toEqual(paths);
        },
    );
});

describe("Automations (hidden, DEC-068)", () => {
    it("is refused in words, even with its flag on", async () => {
        const ctx = await business();
        await lifecycle.enable(ctx, "CRM");
        const r = await refusal(
            setup.enable(ctx, "AUTOMATIONS", {}),
            BadRequestException,
        );
        expect(r.message).toBe(
            "Automations isn't available for your business yet.",
        );
        await expect(lifecycle.enable(ctx, "AUTOMATIONS")).rejects.toThrow(
            "Automations isn't available for your business yet.",
        );
        expect(await status(ctx, "AUTOMATIONS")).toBeNull();
        expect((await setup.defaults(ctx, "AUTOMATIONS")).hidden).toBe(true);
    });

    it("is listed as not rolled out, and a business that had it on keeps its setting", async () => {
        const ctx = await business();
        await prisma.organizationModule.create({
            data: {
                organizationId: ctx.organizationId,
                moduleKey: "AUTOMATIONS",
                status: "ENABLED",
            },
        });
        const views = await availability.listViews({
            organizationId: ctx.organizationId,
            organizationRole: "OWNER",
        });
        const automations = views.find((v) => v.key === "AUTOMATIONS");
        expect(automations).toMatchObject({
            lifecycle: "ENABLED",
            readiness: "DISABLED",
        });
        expect(automations?.blockers.map((b) => b.code)).toContain(
            "ROLLOUT_DISABLED",
        );
        // Enabling it again is a no-op, not a refusal: it is on.
        await expect(setup.enable(ctx, "AUTOMATIONS", {})).resolves.toEqual({
            alreadyEnabled: true,
            created: {},
        });
        expect(await status(ctx, "AUTOMATIONS")).toBe("ENABLED");
    });
});

describe("who may", () => {
    it("needs module:manage to turn on or read the defaults", async () => {
        const owner = await business();
        const member: OrganizationContext = { ...owner, role: "MEMBER" };
        await expect(setup.enable(member, "CRM", {})).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(setup.defaults(member, "COMMERCE")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(await status(owner, "CRM")).toBeNull();
    });

    it("needs the action for what the setup creates, too", async () => {
        const owner = await business();
        const custom: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            roleKey: "switcher",
            actions: new Set<OrgAction>(["module:manage", "module:read"]),
        };
        await expect(
            setup.enable(custom, "COMMERCE", {
                storefrontName: "Rye",
                fulfilment: ["PICKUP"],
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await status(owner, "COMMERCE")).toBeNull();
        // Nothing to create: the switch alone is theirs to flip.
        await expect(setup.enable(custom, "INSIGHTS", {})).resolves.toEqual({
            alreadyEnabled: false,
            created: {},
        });
    });
});
