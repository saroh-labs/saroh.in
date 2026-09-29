/**
 * Module pages against a real Postgres (round-2 G14): adding one with its
 * default sections, one of each kind per site, the fixed addresses of Book
 * and Shop, the reserved addresses a free-form page can't take, the pages
 * already at one (flagged, never moved), the module gates (DEC-057), and what
 * a publish writes: each module page with its kind, in the menu.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    HttpException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { checkRenderability } from "./publication-renderability";
import { SitePreviewLinksService } from "./site-preview-links.service";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

/** The rollout flags a module page kind asks, all off for everyone. */
const FLAGS = [
    "SITE_SHOP",
    "MODULE_COMMERCE",
    "MODULE_APPOINTMENTS",
    "MODULE_PAYMENTS",
    "MODULE_CLASS_PACKS",
] as const;
type Flag = (typeof FLAGS)[number];

beforeAll(async () => {
    for (const key of FLAGS) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: { enabledByDefault: false },
        });
    }
});

/**
 * A business with a site whose home page is at /. Every module is rolled
 * out for it unless `notRolledOut` names one; each module row is ENABLED
 * unless `switchedOff` names it.
 */
async function business(
    over: {
        notRolledOut?: Flag[];
        switchedOff?: (
            "COMMERCE" | "APPOINTMENTS" | "PAYMENTS" | "CLASS_PACKS"
        )[];
    } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Pulse Studio", slug: uniq("g14-org-") },
    });
    for (const flagKey of FLAGS) {
        if (over.notRolledOut?.includes(flagKey)) continue;
        await prisma.featureFlagOverride.create({
            data: { flagKey, organizationId: org.id, enabled: true },
        });
    }
    for (const moduleKey of over.switchedOff ?? []) {
        await prisma.organizationModule.create({
            data: { organizationId: org.id, moduleKey, status: "DISABLED" },
        });
    }
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Pulse",
            slug: uniq("g14-site-"),
        },
    });
    await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    return { ctx, siteId: site.id };
}

async function service(organizationId: string, name: string, shown = true) {
    return prisma.service.create({
        data: {
            organizationId,
            name,
            durationMinutes: 60,
            timezone: "Asia/Kolkata",
            showOnBookingPage: shown,
        },
        select: { id: true },
    });
}

/** A free-form page placed directly, as one made before G14 would be. */
async function freePage(
    b: { ctx: OrganizationContext; siteId: string },
    path: string,
    title: string,
) {
    return prisma.page.create({
        data: {
            siteId: b.siteId,
            organizationId: b.ctx.organizationId,
            path,
            title,
        },
        select: { id: true },
    });
}

async function draftSections(pageId: string) {
    const version = await prisma.pageVersion.findFirstOrThrow({
        where: { pageId, status: "DRAFT" },
        select: {
            sections: {
                orderBy: { order: "asc" },
                select: { type: true, content: true, key: true },
            },
        },
    });
    return version.sections;
}

/** The error a promise rejected with, for its status and body. */
async function rejection(promise: Promise<unknown>) {
    const error = await promise.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpException);
    const http = error as HttpException;
    return {
        status: http.getStatus(),
        body: http.getResponse() as {
            message: string;
            details?: Record<string, unknown>;
        },
    };
}

async function publishedSnapshot(b: {
    ctx: OrganizationContext;
    siteId: string;
}) {
    const { publicationId } = await sites.publishSite(b.ctx, b.siteId);
    const row = await prisma.publication.findUniqueOrThrow({
        where: { id: publicationId },
        select: { snapshot: true },
    });
    return row.snapshot as {
        site: { navigation: { label: string; href: string; kind?: string }[] };
        pages: {
            path: string;
            title: string;
            kind?: string;
            sections: { type: string; content: Record<string, unknown> }[];
        }[];
    };
}

describe("module pages (G14, real database)", () => {
    it("adds a Book page at /book with an intro and the booking page's services, published with its kind", async () => {
        const b = await business();
        const first = await service(b.ctx.organizationId, "Strength");
        const second = await service(b.ctx.organizationId, "Mobility");
        await service(b.ctx.organizationId, "Staff only", false);

        const page = await sites.createPage(b.ctx, b.siteId, { kind: "BOOK" });
        expect(page).toMatchObject({
            path: "/book",
            title: "Book",
            kind: "BOOK",
            inMenu: true,
            isHome: false,
            hidden: false,
        });

        const sections = await draftSections(page.id);
        expect(sections.map((s) => s.type)).toEqual([
            "richText",
            "servicesList",
        ]);
        // The services shown on the booking page, in its order; each section
        // keyed from the moment it exists, so a note can pin to it.
        expect(sections[1]?.content).toMatchObject({
            serviceIds: [first.id, second.id],
            showPrices: true,
        });
        expect(sections.every((s) => s.key.length > 0)).toBe(true);

        const snapshot = await publishedSnapshot(b);
        const book = snapshot.pages.find((p) => p.path === "/book");
        expect(book).toMatchObject({ kind: "BOOK", title: "Book" });
        expect(book?.sections.map((s) => s.type)).toEqual([
            "richText",
            "servicesList",
        ]);
        // Home keeps its shape: a free-form page carries no kind.
        expect(snapshot.pages.find((p) => p.path === "/")).not.toHaveProperty(
            "kind",
        );
        expect(snapshot.site.navigation).toEqual([
            { label: "Book", href: "/book", kind: "BOOK" },
        ]);
        expect(checkRenderability(snapshot).renderable).toBe(true);
    });

    it("starts a Book page with the intro alone while no service is shown", async () => {
        const b = await business();
        const page = await sites.createPage(b.ctx, b.siteId, { kind: "BOOK" });
        expect((await draftSections(page.id)).map((s) => s.type)).toEqual([
            "richText",
        ]);
    });

    it("refuses a second Book page", async () => {
        const b = await business();
        await sites.createPage(b.ctx, b.siteId, { kind: "BOOK" });
        const { status, body } = await rejection(
            sites.createPage(b.ctx, b.siteId, { kind: "BOOK" }),
        );
        expect(status).toBe(409);
        expect(body.message).toBe("This site already has a Book page.");
    });

    it("keeps a Book page at /book: its title and menu name change, its address doesn't", async () => {
        const b = await business();
        const page = await sites.createPage(b.ctx, b.siteId, {
            kind: "BOOK",
            title: "Classes",
        });
        expect(page.title).toBe("Classes");

        await expect(
            sites.updatePage(b.ctx, b.siteId, page.id, { path: "/classes" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            sites.createPage(b.ctx, b.siteId, {
                kind: "SHOP",
                path: "/store",
            }),
        ).rejects.toThrow(/always at \/shop/);

        await sites.updatePage(b.ctx, b.siteId, page.id, {
            title: "Book a class",
        });
        const snapshot = await publishedSnapshot(b);
        expect(snapshot.site.navigation).toEqual([
            { label: "Book a class", href: "/book", kind: "BOOK" },
        ]);
    });

    it.each(["/book", "/shop/sale", "/checkout"])(
        "refuses a free-form page at %s with the reason and another address",
        async (path) => {
            const b = await business();
            const { status, body } = await rejection(
                sites.createPage(b.ctx, b.siteId, {
                    title: "Summer sale",
                    path,
                }),
            );
            expect(status).toBe(400);
            expect(body.message).toMatch(/Pick another address, such as/);
            expect(body.details).toMatchObject({
                field: "path",
                reason: "reserved",
                suggestion: "/summer-sale",
            });
            expect(
                await prisma.page.count({ where: { siteId: b.siteId } }),
            ).toBe(1);
        },
    );

    it("keeps a free-form page already at /shop, flags it, and refuses a Shop page naming it", async () => {
        const b = await business();
        const range = await freePage(b, "/shop", "Our range");

        const { status, body } = await rejection(
            sites.createPage(b.ctx, b.siteId, { kind: "SHOP" }),
        );
        expect(status).toBe(409);
        expect(body.message).toBe(
            'Your page "Our range" uses /shop. Change its address first.',
        );

        const { flags } = await sites.getSiteFlags(b.ctx, b.siteId);
        expect(flags.filter((f) => f.type === "reservedAddress")).toMatchObject(
            [{ pageId: range.id, field: "path" }],
        );
        // Never moved or lost.
        expect(
            await prisma.page.findUniqueOrThrow({ where: { id: range.id } }),
        ).toMatchObject({ path: "/shop", kind: "FREE" });
    });

    it("flags a free-form page already at /book: it can't be seen", async () => {
        const b = await business();
        const walk = await freePage(b, "/book", "Book a walkthrough");

        const { flags } = await sites.getSiteFlags(b.ctx, b.siteId);
        expect(flags.find((f) => f.type === "reservedAddress")).toMatchObject({
            pageId: walk.id,
            message:
                "This page can't be seen: /book is your booking page. Change its address so visitors can reach it.",
        });

        // And a Book page waits for it to move.
        await expect(
            sites.createPage(b.ctx, b.siteId, { kind: "BOOK" }),
        ).rejects.toThrow(/Book a walkthrough/);
        await sites.updatePage(b.ctx, b.siteId, walk.id, {
            path: "/walkthrough",
        });
        await expect(
            sites.createPage(b.ctx, b.siteId, { kind: "BOOK" }),
        ).resolves.toMatchObject({ path: "/book" });
    });

    it("refuses a Shop page with Commerce off, naming the module", async () => {
        const b = await business({ switchedOff: ["COMMERCE"] });
        const { status, body } = await rejection(
            sites.createPage(b.ctx, b.siteId, { kind: "SHOP" }),
        );
        expect(status).toBe(409);
        expect(body.message).toBe(
            "Commerce is switched off. Turn it on in Settings › Modules to add a Shop page.",
        );
        expect(body.details).toMatchObject({ reason: "module_off" });
    });

    it("names only a rolled-out module when a Prices page can't be added", async () => {
        const b = await business({
            notRolledOut: ["MODULE_CLASS_PACKS"],
            switchedOff: ["PAYMENTS"],
        });
        const { status, body } = await rejection(
            sites.createPage(b.ctx, b.siteId, { kind: "PRICES" }),
        );
        expect(status).toBe(409);
        expect(body.message).toBe(
            "Payments is switched off. Turn it on in Settings › Modules to add a Prices page.",
        );
        expect(body.message).not.toMatch(/Class packs/);
    });

    it("never offers, nor names, a kind whose module isn't rolled out (DEC-057)", async () => {
        const b = await business({ notRolledOut: ["MODULE_APPOINTMENTS"] });
        const { status, body } = await rejection(
            sites.createPage(b.ctx, b.siteId, { kind: "BOOK" }),
        );
        expect(status).toBe(409);
        expect(body.message).toBe(
            "A Book page isn't available for this business.",
        );
        expect(body.message).not.toMatch(/Appointments|ROLLOUT/);

        const detail = await sites.getSite(b.ctx, b.siteId);
        expect(detail.addablePageKinds).toEqual([
            "SHOP",
            "PRICES",
            "JOURNAL",
            "CONTACT",
        ]);
    });

    it("offers only what is on and not yet added, and nothing without site:update", async () => {
        const b = await business({
            notRolledOut: ["SITE_SHOP"],
            switchedOff: ["PAYMENTS", "CLASS_PACKS"],
        });
        await sites.createPage(b.ctx, b.siteId, { kind: "JOURNAL" });

        const detail = await sites.getSite(b.ctx, b.siteId);
        expect(detail.addablePageKinds).toEqual(["BOOK", "CONTACT"]);
        expect(detail.pages.find((p) => p.path === "/journal")).toMatchObject({
            kind: "JOURNAL",
            inMenu: true,
        });

        const member = await sites.getSite(
            { ...b.ctx, role: "MEMBER" },
            b.siteId,
        );
        expect(member.addablePageKinds).toEqual([]);
    });

    it("gives Prices, Journal and Contact their default addresses and sections", async () => {
        const b = await business();
        const shop = await prisma.store.create({
            data: {
                name: "Indiranagar",
                slug: uniq("g14-store-"),
                organizationId: b.ctx.organizationId,
                settings: { create: { kind: "SHOP", address: "12th Main" } },
            },
            select: { id: true },
        });

        const prices = await sites.createPage(b.ctx, b.siteId, {
            kind: "PRICES",
        });
        const journal = await sites.createPage(b.ctx, b.siteId, {
            kind: "JOURNAL",
        });
        const contact = await sites.createPage(b.ctx, b.siteId, {
            kind: "CONTACT",
        });
        expect([prices.path, journal.path, contact.path]).toEqual([
            "/prices",
            "/journal",
            "/contact",
        ]);
        expect((await draftSections(prices.id)).map((s) => s.type)).toEqual([
            "plans",
        ]);
        expect((await draftSections(journal.id)).map((s) => s.type)).toEqual([
            "journal",
        ]);

        const [visit, enquiry] = await draftSections(contact.id);
        expect(visit).toMatchObject({
            type: "visitUs",
            content: { storeId: shop.id },
        });
        // The enquiry's Form is the site's, and takes enquiries at once.
        const formId = (enquiry?.content as { formId?: string }).formId;
        expect(
            await prisma.form.findUniqueOrThrow({ where: { id: formId } }),
        ).toMatchObject({
            siteId: b.siteId,
            organizationId: b.ctx.organizationId,
            status: "ACTIVE",
        });

        // A Prices address can move; the menu follows it.
        await sites.updatePage(b.ctx, b.siteId, prices.id, {
            path: "/pricing",
        });
        const snapshot = await publishedSnapshot(b);
        expect(snapshot.site.navigation.map((i) => i.href)).toEqual([
            "/pricing",
            "/journal",
            "/contact",
        ]);
        expect(checkRenderability(snapshot).renderable).toBe(true);
    });

    it("says to pick another address when a Contact page's is taken, and suggests one", async () => {
        const b = await business();
        await freePage(b, "/contact", "Contact us");

        const { status, body } = await rejection(
            sites.createPage(b.ctx, b.siteId, { kind: "CONTACT" }),
        );
        expect(status).toBe(400);
        expect(body.message).toContain("Pick another address");
        expect(body.details).toMatchObject({
            field: "path",
            reason: "taken",
            suggestion: "/contact-us",
        });
        // No half-made page, and no stray Form.
        expect(await prisma.form.count({ where: { siteId: b.siteId } })).toBe(
            0,
        );

        await expect(
            sites.createPage(b.ctx, b.siteId, {
                kind: "CONTACT",
                path: "/contact-us",
            }),
        ).resolves.toMatchObject({ path: "/contact-us", kind: "CONTACT" });
    });

    it("keeps a page with Show in menu off out of the menu, though it is published", async () => {
        const b = await business();
        const journal = await sites.createPage(b.ctx, b.siteId, {
            kind: "JOURNAL",
            inMenu: false,
        });
        let snapshot = await publishedSnapshot(b);
        expect(snapshot.site.navigation).toEqual([]);
        expect(snapshot.pages.map((p) => p.path)).toContain("/journal");

        await sites.updatePage(b.ctx, b.siteId, journal.id, { inMenu: true });
        snapshot = await publishedSnapshot(b);
        expect(snapshot.site.navigation).toEqual([
            { label: "Journal", href: "/journal", kind: "JOURNAL" },
        ]);
    });

    it("holds one page of each module kind per site in the database itself", async () => {
        const b = await business();
        const data = {
            siteId: b.siteId,
            organizationId: b.ctx.organizationId,
            kind: "PRICES" as const,
        };
        await prisma.page.create({
            data: { ...data, path: "/prices", title: "Prices" },
        });
        await expect(
            prisma.page.create({
                data: { ...data, path: "/rates", title: "Rates" },
            }),
        ).rejects.toMatchObject({ code: "P2002" });
        // Free-form pages are as many as the merchant likes.
        await freePage(b, "/a", "A");
        await freePage(b, "/b", "B");
    });

    it("publishes a site without module pages exactly as before", async () => {
        const b = await business();
        const about = await freePage(b, "/about", "About");
        await sites.updateNavigation(b.ctx, b.siteId, {
            items: [{ pageId: about.id, label: "Our story" }],
        });

        const snapshot = await publishedSnapshot(b);
        expect(snapshot.site.navigation).toEqual([
            { label: "Our story", href: "/about" },
        ]);
        for (const page of snapshot.pages) {
            expect(page).not.toHaveProperty("kind");
        }
        // Publishing again changes nothing.
        const detail = await sites.getSite(b.ctx, b.siteId);
        expect(detail.pendingSiteChanges).toEqual([]);
        expect(detail.pendingSectionChanges).toBe(0);
    });

    it("refuses a conflicting request as a ConflictException, never a 500", async () => {
        const b = await business();
        await sites.createPage(b.ctx, b.siteId, { kind: "CONTACT" });
        await expect(
            sites.createPage(b.ctx, b.siteId, { kind: "CONTACT" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});

describe("module pages on the public site read (G15, real database)", () => {
    it("says each published module page is on while its module is", async () => {
        const b = await business();
        await sites.createPage(b.ctx, b.siteId, { kind: "BOOK" });
        await sites.createPage(b.ctx, b.siteId, { kind: "JOURNAL" });
        await sites.publishSite(b.ctx, b.siteId);

        const view = await sites.getPublicationBySiteId(b.siteId);
        expect(view.modules).toEqual({ BOOK: "on", JOURNAL: "on" });
    });

    it("says a Book page is off once Appointments is switched off, without a republish", async () => {
        const b = await business();
        await sites.createPage(b.ctx, b.siteId, { kind: "BOOK" });
        await sites.publishSite(b.ctx, b.siteId);

        await prisma.organizationModule.create({
            data: {
                organizationId: b.ctx.organizationId,
                moduleKey: "APPOINTMENTS",
                status: "DISABLED",
            },
        });
        const view = await sites.getPublicationBySiteId(b.siteId);
        expect(view.modules).toEqual({ BOOK: "off" });
    });

    it("says off, naming nothing, when the module is no longer rolled out (DEC-057)", async () => {
        const b = await business();
        await sites.createPage(b.ctx, b.siteId, { kind: "BOOK" });
        await sites.publishSite(b.ctx, b.siteId);

        await prisma.featureFlagOverride.deleteMany({
            where: {
                organizationId: b.ctx.organizationId,
                flagKey: "MODULE_APPOINTMENTS",
            },
        });
        const view = await sites.getPublicationBySiteId(b.siteId);
        expect(view.modules).toEqual({ BOOK: "off" });
    });

    it("adds nothing to the read of a site without module pages", async () => {
        const b = await business();
        await freePage(b, "/about", "About");
        await sites.publishSite(b.ctx, b.siteId);

        const view = await sites.getPublicationBySiteId(b.siteId);
        expect(view).not.toHaveProperty("modules");
        expect(Object.keys(view).sort()).toEqual([
            "publishedAt",
            "siteId",
            "snapshot",
        ]);
    });
});

describe("the menu follows the modules (G19, real database)", () => {
    type Snapshot = {
        site: { navigation: { label: string; href: string; kind?: string }[] };
    };
    const commerce = (organizationId: string, status: "ENABLED" | "DISABLED") =>
        prisma.organizationModule.upsert({
            where: {
                organizationId_moduleKey: {
                    organizationId,
                    moduleKey: "COMMERCE",
                },
            },
            create: { organizationId, moduleKey: "COMMERCE", status },
            update: { status },
        });

    it("Commerce off takes Shop out, and on again brings it back, with one publish", async () => {
        const b = await business();
        await freePage(b, "/about", "About");
        await sites.createPage(b.ctx, b.siteId, { kind: "SHOP" });
        await sites.publishSite(b.ctx, b.siteId);

        const on = await sites.getPublicationBySiteId(b.siteId);
        // The published menu keeps Shop, tagged, whatever the module does:
        // the site decides at view time.
        const menu = (on.snapshot as Snapshot).site.navigation;
        expect(menu).toContainEqual({
            label: "Shop",
            href: "/shop",
            kind: "SHOP",
        });
        expect(on.modules).toEqual({ SHOP: "on" });

        await commerce(b.ctx.organizationId, "DISABLED");
        const off = await sites.getPublicationBySiteId(b.siteId);
        expect(off.snapshot).toEqual(on.snapshot);
        expect(off.modules).toEqual({ SHOP: "off" });

        await commerce(b.ctx.organizationId, "ENABLED");
        expect((await sites.getPublicationBySiteId(b.siteId)).modules).toEqual({
            SHOP: "on",
        });
    });

    it("tells the draft preview which module pages show, as the live read does", async () => {
        const b = await business();
        // Added while Appointments was on, then switched off.
        await sites.createPage(b.ctx, b.siteId, { kind: "BOOK" });
        await sites.createPage(b.ctx, b.siteId, { kind: "CONTACT" });
        await prisma.organizationModule.create({
            data: {
                organizationId: b.ctx.organizationId,
                moduleKey: "APPOINTMENTS",
                status: "DISABLED",
            },
        });

        // A link is made by someone.
        const user = await prisma.user.create({
            data: {
                name: "Demo Owner",
                email: `${uniq("g19-owner-")}@example.test`,
            },
            select: { id: true },
        });
        const previews = new SitePreviewLinksService(sites);
        const link = await previews.create(
            { ...b.ctx, userId: user.id },
            b.siteId,
            {
                expiresInDays: 1,
            },
        );
        const view = await previews.resolve(link.token);
        expect(view.modules).toEqual({ BOOK: "off", CONTACT: "on" });
    });

    it("says what leaves the website when Commerce goes off, by the page's menu name", async () => {
        const b = await business();
        const shop = await sites.createPage(b.ctx, b.siteId, { kind: "SHOP" });
        await prisma.page.update({
            where: { id: shop.id },
            data: { title: "Bakes" },
        });
        await sites.publishSite(b.ctx, b.siteId);

        const items = await new ModuleReadinessRegistry(
            prisma,
        ).deactivationImpact("COMMERCE", {
            organizationId: b.ctx.organizationId,
        });
        expect(items).toContainEqual({
            code: "COMMERCE_SITE_SHOP_PAGE",
            moduleKey: "COMMERCE",
            count: 1,
            message: "Your website stops showing Bakes.",
        });
    });

    it("says nothing of a website that never added a Shop page", async () => {
        const b = await business();
        await freePage(b, "/about", "About");
        await sites.publishSite(b.ctx, b.siteId);

        const items = await new ModuleReadinessRegistry(
            prisma,
        ).deactivationImpact("COMMERCE", {
            organizationId: b.ctx.organizationId,
        });
        expect(items.map((i) => i.code)).not.toContain(
            "COMMERCE_SITE_SHOP_PAGE",
        );
    });
});
