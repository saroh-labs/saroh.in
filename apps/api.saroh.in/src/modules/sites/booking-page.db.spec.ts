/**
 * DEC-175 (#1158) against a real Postgres: a booking page on the
 * business's address without building a website.
 *
 * - turning Bookings on with no website makes the starter site on the
 *   business's address, Website on, its Book page ready, nothing published;
 * - so does adding the first service customers can book online, and not
 *   one they can't;
 * - a business with a website (or one it deleted) gets no second one;
 * - Publish booking page publishes that site, `site:publish` only, and
 *   another business can't reach it (404);
 * - Make my booking page, for a business with Bookings on and no website.
 *
 * Every business here is its own, made by this file.
 */
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { STARTER_TEMPLATE_ID } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { BookingsService } from "../bookings/bookings.service";
import { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { ModuleSetupService } from "../capabilities/setup/module-setup.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FLAG_KEYS } from "../feature-flags/flags";
import type { OrgAction } from "../organizations/organization-actions";
import { can } from "../organizations/organization-policy";
import { BookingPageService } from "./booking-page.service";
import { rendererHost } from "./site-origin";
import { SitesService } from "./sites.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;

const flags = new FeatureFlagService();
const entitlements = new EntitlementService();
const lifecycle = new ModuleLifecycleService(
    new ModuleReadinessRegistry(),
    prisma,
    undefined,
    flags,
);
const setup = new ModuleSetupService(lifecycle, entitlements, flags);
const sites = new SitesService(entitlements);
const bookingPage = new BookingPageService(sites, setup, flags);
const bookings = new BookingsService(undefined, undefined, setup);

const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    open: "10:00",
    close: "18:00",
}));
const FIRST = {
    hours: HOURS,
    service: { name: "Physio session", durationMinutes: 45, price: "800" },
};

async function business(name = "Bend Physio"): Promise<OrganizationContext> {
    seq += 1;
    const user = await prisma.user.create({
        data: { email: `bp-${tag}-${seq}@example.com` },
    });
    const org = await prisma.organization.create({
        data: { name, slug: `bp-${seq}-${tag}` },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

/** The same business as someone in another role. */
function as(
    ctx: OrganizationContext,
    role: OrganizationContext["role"],
    extra: OrgAction[] = [],
): OrganizationContext {
    const actions = new Set<OrgAction>(extra);
    for (const action of [
        "service:read",
        "service:write",
        "site:read",
        "site:create",
        "site:publish",
        "module:manage",
    ] as OrgAction[]) {
        if (can(role, action)) actions.add(action);
    }
    return { ...ctx, role, actions };
}

function sitesOf(ctx: OrganizationContext) {
    return prisma.site.findMany({
        where: { organizationId: ctx.organizationId },
        select: {
            id: true,
            subdomain: true,
            templateId: true,
            currentPublicationId: true,
            deletedAt: true,
        },
    });
}

async function status(ctx: OrganizationContext, moduleKey: string) {
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

async function slugOf(ctx: OrganizationContext): Promise<string> {
    const org = await prisma.organization.findUniqueOrThrow({
        where: { id: ctx.organizationId },
        select: { slug: true },
    });
    return org.slug;
}

/** Bookings on without its setup: no service, no booking page. */
async function bookingsOnly(ctx: OrganizationContext) {
    await lifecycle.enable(ctx, "CRM");
    await lifecycle.enable(ctx, "APPOINTMENTS");
}

function newService(
    ctx: OrganizationContext,
    over: Partial<{ showOnBookingPage: boolean }> = {},
) {
    return bookings.createService(ctx, {
        name: "Assessment",
        durationMinutes: 30,
        timezone: "Asia/Kolkata",
        ...over,
    });
}

beforeAll(async () => {
    for (const key of FLAG_KEYS.filter((k) => k.startsWith("MODULE_"))) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
    }
});

describe("turning Bookings on makes the booking page", () => {
    it("with no website: the starter on the business's address, Book ready, not live", async () => {
        const ctx = await business();
        // The sheet says it is coming before anything is saved.
        expect(
            (await setup.defaults(ctx, "APPOINTMENTS")).alsoBookingPage,
        ).toEqual({ address: await slugOf(ctx) });

        await setup.enable(ctx, "CRM", {});
        await setup.enable(ctx, "APPOINTMENTS", FIRST);

        const made = await sitesOf(ctx);
        expect(made).toHaveLength(1);
        expect(made[0]).toMatchObject({
            subdomain: await slugOf(ctx),
            templateId: STARTER_TEMPLATE_ID,
            currentPublicationId: null,
        });
        expect(await status(ctx, "WEBSITE")).toBe("ENABLED");
        const pages = await prisma.page.findMany({
            where: { siteId: made[0]!.id },
            select: { kind: true, isHome: true },
        });
        expect(
            pages.flatMap((p) => (p.kind === "FREE" ? [] : [p.kind])).sort(),
        ).toEqual(["BOOK", "CONTACT"]);
        expect(pages.some((p) => p.isHome)).toBe(true);

        const read = await bookingPage.read(ctx);
        expect(read).toMatchObject({
            state: "draft",
            site: { id: made[0]!.id, address: await slugOf(ctx) },
            host: `${await slugOf(ctx)}.${rendererHost()}`,
            url: `https://${await slugOf(ctx)}.${rendererHost()}/book`,
            published: false,
            mayPublish: true,
            make: null,
        });
    });

    it("the plain switch makes it too, once a service customers can book is there", async () => {
        const ctx = await business();
        await bookingsOnly(ctx);
        // Nothing to book yet: no page.
        expect(await sitesOf(ctx)).toHaveLength(0);
        expect((await bookingPage.read(ctx)).make).toBe("no-service");

        await newService(ctx);
        expect(await sitesOf(ctx)).toHaveLength(1);
        expect((await bookingPage.read(ctx)).state).toBe("draft");
    });

    it("a service customers can't book online makes none, until it is opened to them", async () => {
        const ctx = await business();
        await bookingsOnly(ctx);
        const hidden = await newService(ctx, { showOnBookingPage: false });
        expect(await sitesOf(ctx)).toHaveLength(0);

        await bookings.updateService(ctx, hidden.id, {
            showOnBookingPage: true,
        });
        expect(await sitesOf(ctx)).toHaveLength(1);
    });

    it("its address taken since setup: the free one offered instead", async () => {
        const ctx = await business();
        const other = await business("Another Physio");
        await setup.enable(other, "WEBSITE", {
            siteName: "Another Physio",
            address: `bp-taken-${tag}`,
        });
        // This business's own address went to the other's website.
        await prisma.organization.update({
            where: { id: ctx.organizationId },
            data: { slug: `bp-taken-${tag}` },
        });
        await setup.enable(ctx, "CRM", {});
        await setup.enable(ctx, "APPOINTMENTS", FIRST);
        const [site] = await sitesOf(ctx);
        expect(site?.subdomain).toBeTruthy();
        expect(site?.subdomain).not.toBe(`bp-taken-${tag}`);
    });
});

describe("one site, never two", () => {
    it("a business with a website keeps it and gains its Book page", async () => {
        const ctx = await business();
        await setup.enable(ctx, "WEBSITE", {
            siteName: "Bend Physio",
            address: await slugOf(ctx),
        });
        const [own] = await sitesOf(ctx);
        expect(
            (await setup.defaults(ctx, "APPOINTMENTS")).alsoBookingPage,
        ).toBeUndefined();

        await setup.enable(ctx, "CRM", {});
        await setup.enable(ctx, "APPOINTMENTS", FIRST);
        await newService(ctx);

        const after = await sitesOf(ctx);
        expect(after.map((s) => s.id)).toEqual([own!.id]);
        expect(
            await prisma.page.count({
                where: { siteId: own!.id, kind: "BOOK" },
            }),
        ).toBe(1);
        expect((await bookingPage.read(ctx)).site?.id).toBe(own!.id);
    });

    it("a website its owner deleted is not brought back by itself", async () => {
        const ctx = await business();
        await setup.enable(ctx, "WEBSITE", {
            siteName: "Bend Physio",
            address: await slugOf(ctx),
        });
        const [own] = await sitesOf(ctx);
        await prisma.site.update({
            where: { id: own!.id },
            data: { deletedAt: new Date() },
        });

        await setup.enable(ctx, "CRM", {});
        await setup.enable(ctx, "APPOINTMENTS", FIRST);
        await newService(ctx);
        expect(
            (await sitesOf(ctx)).filter((s) => s.deletedAt === null),
        ).toHaveLength(0);
        // Nor when asked: Website is where it is set up again.
        expect((await bookingPage.read(ctx)).make).toBe("website");
        await expect(bookingPage.make(ctx)).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it("Make my booking page twice is still one site", async () => {
        const ctx = await business();
        await bookingsOnly(ctx);
        // A service made before DEC-175, with no booking page made.
        await prisma.service.create({
            data: {
                organizationId: ctx.organizationId,
                name: "Old service",
                durationMinutes: 30,
                timezone: "Asia/Kolkata",
            },
        });
        expect((await bookingPage.read(ctx)).state).toBe("none");
        await bookingPage.make(ctx);
        await bookingPage.make(ctx);
        expect(await sitesOf(ctx)).toHaveLength(1);
    });
});

describe("who may", () => {
    it("someone who may add services but not make a website makes no site", async () => {
        const ctx = await business();
        await bookingsOnly(ctx);
        const member = as(ctx, "MEMBER", ["service:write"]);
        await newService(member);
        expect(await sitesOf(ctx)).toHaveLength(0);
        expect((await bookingPage.read(member)).make).toBe("permission");
        await expect(bookingPage.make(member)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it("a Member can see it but not publish it; an Admin can", async () => {
        const ctx = await business();
        await setup.enable(ctx, "CRM", {});
        await setup.enable(ctx, "APPOINTMENTS", FIRST);

        const member = as(ctx, "MEMBER");
        expect(await bookingPage.read(member)).toMatchObject({
            state: "draft",
            mayPublish: false,
        });
        await expect(bookingPage.publish(member)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect((await sitesOf(ctx))[0]?.currentPublicationId).toBeNull();

        const admin = as(ctx, "ADMIN");
        const live = await bookingPage.publish(admin);
        expect(live).toMatchObject({ state: "live", published: true });
        expect((await sitesOf(ctx))[0]?.currentPublicationId).not.toBeNull();
    });

    it("Publish booking page goes live once, and the read says so", async () => {
        const ctx = await business();
        await setup.enable(ctx, "CRM", {});
        await setup.enable(ctx, "APPOINTMENTS", FIRST);
        const live = await bookingPage.publish(ctx);
        expect(live.state).toBe("live");
        const [site] = await sitesOf(ctx);
        const publication = await prisma.publication.findUniqueOrThrow({
            where: { id: site!.currentPublicationId! },
            select: { snapshot: true },
        });
        const pages = (publication.snapshot as { pages: { kind?: string }[] })
            .pages;
        expect(pages.some((p) => p.kind === "BOOK")).toBe(true);
    });

    it("with Publishing needs approval on, it is refused as Website › Publish refuses it", async () => {
        const ctx = await business();
        await setup.enable(ctx, "CRM", {});
        await setup.enable(ctx, "APPOINTMENTS", FIRST);
        const [site] = await sitesOf(ctx);
        await prisma.site.update({
            where: { id: site!.id },
            data: { publishNeedsApproval: true },
        });
        await expect(
            bookingPage.publish(as(ctx, "ADMIN")),
        ).rejects.toBeInstanceOf(ConflictException);
        expect((await sitesOf(ctx))[0]?.currentPublicationId).toBeNull();
    });
});

describe("another business", () => {
    it("gets a 404 and never sees or publishes this one's page", async () => {
        const mine = await business();
        await setup.enable(mine, "CRM", {});
        await setup.enable(mine, "APPOINTMENTS", FIRST);

        const theirs = await business("Other Studio");
        await bookingsOnly(theirs);
        expect(await bookingPage.read(theirs)).toMatchObject({
            state: "none",
            site: null,
        });
        await expect(bookingPage.publish(theirs)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect((await sitesOf(mine))[0]?.currentPublicationId).toBeNull();
    });
});
