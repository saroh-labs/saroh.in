/**
 * A site remembers the template it came from (industry templates, KTD-7),
 * against a real Postgres: making a site from `personal` records it on the
 * Site, publishing stamps the Publication with it, and a site made before it
 * was recorded (null) still publishes with the starter's stamp, as before.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and under
 * `TEST_RLS=on`.
 */
import { prisma } from "@saroh/database";
import { getTemplate, starterTemplate } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

/** A business with its setup address, and its owner. */
async function business(name = "Rye"): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("tpl") },
        select: { id: true },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("tpl-user")}@example.test` },
        select: { id: true },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

const personalVersion = getTemplate("personal")?.version;

describe("a site's menu from its template", () => {
    it("lists the template's other pages, in its order, and not the home page", async () => {
        const ctx = await business("Iron & Oak");
        const created = await sites.createFromTemplate(ctx, {
            name: "Iron & Oak",
            templateId: "portfolio",
        });
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: created.siteId },
            select: {
                navigation: true,
                pages: { select: { id: true, title: true, isHome: true } },
            },
        });
        const manifest = getTemplate("portfolio");
        const others = (manifest?.pages ?? []).filter((p) => !p.isHome);
        expect(others.length).toBeGreaterThan(0);
        const byTitle = new Map(site.pages.map((p) => [p.title, p.id]));
        expect(site.navigation).toEqual({
            items: others.map((p) => ({ pageId: byTitle.get(p.title) })),
        });
    });

    it("leaves a one-page site's menu empty", async () => {
        const ctx = await business();
        const created = await sites.createFromTemplate(ctx, {
            name: "Rye",
            templateId: "bakery",
        });
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: created.siteId },
            select: { navigation: true },
        });
        expect(site.navigation).toBeNull();
    });
});

describe("a site's template (KTD-7)", () => {
    it("is recorded when the site is made from personal", async () => {
        const ctx = await business();
        const created = await sites.createFromTemplate(ctx, {
            name: "Rye",
            templateId: "personal",
        });

        const site = await prisma.site.findUniqueOrThrow({
            where: { id: created.siteId },
            select: {
                templateId: true,
                templateVersion: true,
                templateStyleId: true,
            },
        });
        expect(site).toEqual({
            templateId: "personal",
            templateVersion: personalVersion,
            templateStyleId: null,
        });

        // And the site read says so.
        const read = await sites.getSite(ctx, created.siteId);
        expect(read.template).toEqual({
            id: "personal",
            version: personalVersion,
            styleId: null,
        });
    });

    it("stamps each publication with the site's own template", async () => {
        const ctx = await business();
        const created = await sites.createFromTemplate(ctx, {
            name: "Rye",
            templateId: "personal",
        });

        const published = await sites.publishSite(ctx, created.siteId);

        const publication = await prisma.publication.findUniqueOrThrow({
            where: { id: published.publicationId },
            select: { templateId: true, templateVersion: true },
        });
        expect(publication).toEqual({
            templateId: "personal",
            templateVersion: personalVersion,
        });
    });

    it("still publishes a site with none recorded, with the starter's stamp", async () => {
        const ctx = await business();
        const created = await sites.createFromTemplate(ctx, {
            name: "Rye",
            templateId: "personal",
        });
        // As a site made before the template was recorded.
        await prisma.site.update({
            where: { id: created.siteId },
            data: {
                templateId: null,
                templateVersion: null,
                templateStyleId: null,
            },
        });

        const read = await sites.getSite(ctx, created.siteId);
        expect(read.template).toBeNull();

        const published = await sites.publishSite(ctx, created.siteId);
        const publication = await prisma.publication.findUniqueOrThrow({
            where: { id: published.publicationId },
            select: { templateId: true, templateVersion: true },
        });
        expect(publication).toEqual({
            templateId: starterTemplate.id,
            templateVersion: starterTemplate.version,
        });
    });
});
