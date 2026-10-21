/**
 * DEC-141 against a real Postgres: the site a business gets when it turns
 * Website on, and what that site gains when the business switches another
 * module on afterwards.
 *
 * A new site starts from `starter@4`: a look of its own, sections for what
 * the business has switched on, one action, the module pages that go with
 * them, and no line that is not true of the business. (`starter@3` put a
 * note to the owner under every headline; `starter@1` pointed at images no
 * app serves.)
 *
 * Every business here is its own, made by this file.
 */
import { prisma } from "@saroh/database";
import {
    isOwnerNote,
    STARTER_TEMPLATE_ID,
    starterTemplate,
    templatePlaceholderIn,
} from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { ModuleSetupService } from "../capabilities/setup/module-setup.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FLAG_KEYS } from "../feature-flags/flags";
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

/** A week of mornings: what Bookings' setup asks for. */
const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    open: "10:00",
    close: "18:00",
}));

async function business(
    name: string,
    profile: { city?: string; contactEmail?: string } = {},
): Promise<OrganizationContext> {
    seq += 1;
    const user = await prisma.user.create({
        data: { email: `k10-${tag}-${seq}@example.com` },
    });
    const org = await prisma.organization.create({
        data: {
            name,
            slug: `k10-${seq}-${tag}`,
            ...(Object.keys(profile).length > 0
                ? { businessProfile: { create: profile } }
                : {}),
        },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

/** Turn Website on: the starter site, on an address of its own. */
async function website(ctx: OrganizationContext, name: string) {
    const out = await setup.enable(ctx, "WEBSITE", {
        siteName: name,
        address: `k10-${seq}-${tag}`,
    });
    // Bookings turned on first has made it already: the booking page is
    // this same starter on the business's address (DEC-175).
    const siteId =
        out.created.siteId ??
        (
            await prisma.site.findFirst({
                where: { organizationId: ctx.organizationId },
                select: { id: true },
            })
        )?.id;
    if (!siteId) throw new Error("no site was made");
    return siteId;
}

/** Turn Bookings on with one service, as the Turn on sheet does. */
async function bookings(ctx: OrganizationContext, service = "Haircut") {
    await setup.enable(ctx, "CRM", {});
    const out = await setup.enable(ctx, "APPOINTMENTS", {
        hours: HOURS,
        service: { name: service, durationMinutes: 45, price: "500" },
    });
    const serviceId = out.created.serviceId;
    if (!serviceId) throw new Error("no service was made");
    return serviceId;
}

/** The site's draft pages by path, each with its sections in order. */
async function draft(siteId: string) {
    const pages = await prisma.page.findMany({
        where: { siteId },
        orderBy: { path: "asc" },
        select: {
            id: true,
            path: true,
            kind: true,
            hidden: true,
            versions: {
                where: { status: "DRAFT" },
                select: {
                    revision: true,
                    sections: {
                        orderBy: { order: "asc" },
                        select: { key: true, type: true, content: true },
                    },
                },
            },
        },
    });
    return pages.map((p) => ({
        id: p.id,
        path: p.path,
        kind: p.kind,
        hidden: p.hidden,
        revision: p.versions[0]?.revision,
        sections: p.versions.flatMap((v) => v.sections),
    }));
}

type Draft = Awaited<ReturnType<typeof draft>>;

const pageAt = (pages: Draft, path: string) => {
    const page = pages.find((p) => p.path === path);
    if (!page) throw new Error(`no page at ${path}`);
    return page;
};

const typesAt = (pages: Draft, path: string) =>
    pageAt(pages, path).sections.map((s) => s.type);

/** Every string a visitor would read: briefs, links and photos left out. */
function visitorStrings(value: unknown, key = ""): string[] {
    if (typeof value === "string") {
        return ["imageBrief", "src", "alt", "href", "formId"].includes(key)
            ? []
            : [value];
    }
    if (Array.isArray(value)) {
        return value.flatMap((v) => visitorStrings(v, key));
    }
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => visitorStrings(v, k));
    }
    return [];
}

/** Every `src` anywhere in a section's content: the images it would draw. */
function imageSources(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(imageSources);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) =>
            k === "src" && typeof v === "string" ? [v] : imageSources(v),
        );
    }
    return [];
}

/** The site's menu, as the paths it lists, in order. */
async function menu(siteId: string): Promise<(string | undefined)[]> {
    const site = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
            navigation: true,
            pages: { select: { id: true, path: true } },
        },
    });
    const paths = new Map(site.pages.map((p) => [p.id, p.path]));
    const items =
        (site.navigation as { items: { pageId: string }[] } | null)?.items ??
        [];
    return items.map((i) => paths.get(i.pageId));
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

describe("Turning Website on drafts starter@4", () => {
    it("a business with nothing else on: a headline, a way to get in touch, and a Contact page", async () => {
        expect(starterTemplate).toMatchObject({
            id: STARTER_TEMPLATE_ID,
            version: 4,
        });
        const ctx = await business("Asha Rao");
        const siteId = await website(ctx, "Asha Rao");

        const pages = await draft(siteId);
        // No About: nothing is known of the business to put on one.
        expect(pages.map((p) => p.path)).toEqual(["/", "/contact"]);
        expect(pageAt(pages, "/contact").kind).toBe("CONTACT");
        expect(typesAt(pages, "/")).toEqual(["hero", "enquiry"]);

        const hero = pageAt(pages, "/").sections[0]?.content as Record<
            string,
            unknown
        >;
        expect(hero).toMatchObject({
            variant: "centered",
            heading: "Asha Rao",
            cta: { label: "Get in touch", href: "/contact" },
        });
        // No line where nothing true can be said. Never a prompt.
        expect(hero).not.toHaveProperty("subheading");

        for (const section of pages.flatMap((p) => p.sections)) {
            expect(imageSources(section.content)).toEqual([]);
            for (const text of visitorStrings(section.content)) {
                expect(isOwnerNote(text)).toBe(false);
                expect(templatePlaceholderIn(text)).toBeNull();
            }
        }

        // Its look, its record and its foot.
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: {
                templateId: true,
                templateVersion: true,
                templateStyleId: true,
                style: true,
                footer: true,
            },
        });
        expect(site).toMatchObject({
            templateId: STARTER_TEMPLATE_ID,
            templateVersion: 4,
            templateStyleId: "stone",
            style: { fontPair: "source-serif-inter" },
            footer: { value: "", layout: "left" },
        });

        // A real menu from the first draft: Home, then Contact.
        expect(await menu(siteId)).toEqual(["/", "/contact"]);

        // And it can go live as it stands: nothing in it is a note to the
        // owner.
        await expect(sites.publishSite(ctx, siteId)).resolves.toMatchObject({
            bypassed: false,
        });
    });

    it("a salon: its services, its line, its Book page, and one thing to do", async () => {
        const ctx = await business("Kesar Salon", { city: "Bengaluru" });
        const serviceId = await bookings(ctx);
        const siteId = await website(ctx, "Kesar Salon");

        const pages = await draft(siteId);
        expect(pages.map((p) => p.path)).toEqual([
            "/",
            "/about",
            "/book",
            "/contact",
        ]);
        expect(pageAt(pages, "/book").kind).toBe("BOOK");
        // The town is where it is: Visit us has a place to show.
        expect(typesAt(pages, "/")).toEqual([
            "hero",
            "servicesList",
            "features",
            "visitUs",
            "cta",
        ]);

        const [hero, services] = pageAt(pages, "/").sections;
        // Composed from what the business already told Saroh.
        expect(hero?.content).toMatchObject({
            heading: "Kesar Salon",
            subheading: "Haircut in Bengaluru",
            cta: { label: "Book a time", href: "/book" },
            onToday: true,
        });
        expect(services?.content).toMatchObject({ serviceIds: [serviceId] });

        // The closing band asks for the same thing.
        expect(pageAt(pages, "/").sections.at(-1)?.content).toMatchObject({
            label: "Book a time",
            href: "/book",
        });

        // What it offers straight after Home; Contact last.
        expect(await menu(siteId)).toEqual([
            "/",
            "/book",
            "/about",
            "/contact",
        ]);
        // The foot carries the same line.
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { footer: true },
        });
        expect(site.footer).toMatchObject({
            value: "Haircut in Bengaluru",
            layout: "left",
        });
    });

    it("links only to pages the site has", async () => {
        const ctx = await business("Northlight Studio", { city: "Pune" });
        await bookings(ctx, "Portrait sitting");
        const siteId = await website(ctx, "Northlight Studio");
        const pages = await draft(siteId);
        const paths = new Set(pages.map((p) => p.path));
        const hrefs = pages
            .flatMap((p) => p.sections)
            .flatMap((s) => {
                const c = s.content as {
                    href?: unknown;
                    cta?: { href?: unknown };
                    value?: unknown;
                };
                const inText =
                    typeof c.value === "string"
                        ? [...c.value.matchAll(/href="([^"]+)"/g)].map(
                              (m) => m[1],
                          )
                        : [];
                return [c.href, c.cta?.href, ...inText].filter(
                    (h): h is string => typeof h === "string",
                );
            });
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) {
            expect(paths.has(href.split("#")[0] || "/")).toBe(true);
        }
    });
});

describe("A module switched on after the site exists", () => {
    it("an untouched Home becomes the Home a site made today would have, and the Book page is added", async () => {
        const ctx = await business("Asha Rao");
        const siteId = await website(ctx, "Asha Rao");
        expect(typesAt(await draft(siteId), "/")).toEqual(["hero", "enquiry"]);

        const serviceId = await bookings(ctx);

        const pages = await draft(siteId);
        expect(pages.map((p) => p.path)).toEqual(["/", "/book", "/contact"]);
        expect(pageAt(pages, "/book").kind).toBe("BOOK");
        const home = pageAt(pages, "/");
        expect(home.sections.map((s) => s.type)).toEqual([
            "hero",
            "servicesList",
            "features",
            "cta",
        ]);
        expect(home.sections[0]?.content).toMatchObject({
            subheading: "Haircut",
            cta: { label: "Book a time", href: "/book" },
        });
        expect(home.sections[1]?.content).toMatchObject({
            serviceIds: [serviceId],
        });
        // Still nobody's edit: the next module finds it untouched too.
        expect(home.revision).toBe(0);
        // Nothing was published by it.
        expect(await prisma.publication.count({ where: { siteId } })).toBe(0);
    });

    it("an edited Home keeps every word and gains only the services list", async () => {
        const ctx = await business("Asha Rao");
        const siteId = await website(ctx, "Asha Rao");
        const before = pageAt(await draft(siteId), "/");

        // The owner writes their own headline.
        await sites.replaceDraftSections(ctx, siteId, before.id, {
            sections: before.sections.map((s, i) => ({
                key: s.key,
                type: s.type,
                contractVersion: 1,
                content:
                    i === 0
                        ? {
                              ...(s.content as object),
                              heading: "Hair, done properly",
                          }
                        : s.content,
            })),
        });

        await bookings(ctx);

        const home = pageAt(await draft(siteId), "/");
        expect(home.sections.map((s) => s.type)).toEqual([
            "hero",
            "servicesList",
            "enquiry",
        ]);
        // Their headline and their button, as they left them.
        expect(home.sections[0]?.content).toMatchObject({
            heading: "Hair, done properly",
            cta: { label: "Get in touch" },
        });
        // Every section they had keeps its key (and so its notes).
        expect(home.sections[0]?.key).toBe(before.sections[0]?.key);
        expect(home.sections[2]?.key).toBe(before.sections[1]?.key);
        // Their save, then Saroh's: an open editor is told to reload.
        expect(home.revision).toBe(2);
    });

    it("switching it off and on again adds nothing twice", async () => {
        const ctx = await business("Asha Rao");
        const siteId = await website(ctx, "Asha Rao");
        await bookings(ctx);
        const before = await draft(siteId);

        await lifecycle.disable(ctx, "APPOINTMENTS");
        await lifecycle.enable(ctx, "APPOINTMENTS");

        const after = await draft(siteId);
        expect(after.map((p) => p.path)).toEqual(before.map((p) => p.path));
        expect(typesAt(after, "/")).toEqual(typesAt(before, "/"));
    });

    it("a site made from another template is left exactly as it is", async () => {
        const ctx = await business("Ink Notes");
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Ink Notes",
            templateId: "writing",
        });
        const before = await draft(siteId);
        await bookings(ctx);
        expect(await draft(siteId)).toEqual(before);
    });
});
