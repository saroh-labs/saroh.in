/**
 * A site made from a template starts in the template's colourway (industry
 * templates plan, KTD-1, U1), against a real Postgres: the style is written
 * with the site, and its first publish carries the colours and the font
 * pair's key to the renderer. A template without colourways leaves the site
 * in the default look, exactly as before.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import type { SitePlan } from "./site-create";
import { planTemplateStyle, writeSiteFromTemplate } from "./site-create";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

async function business(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Crumb", slug: uniq("u1") },
        select: { id: true },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("u1-user")}@example.test` },
        select: { id: true },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

describe("a site made from a template with colourways (KTD-1)", () => {
    it("is written in the colourway and publishes its font pair", async () => {
        const ctx = await business();
        const plan: SitePlan = {
            name: "Crumb",
            slug: "crumb",
            pages: [
                {
                    path: "/",
                    title: "Home",
                    isHome: true,
                    sections: [],
                },
            ],
            style: planTemplateStyle({
                id: "bakery",
                version: 1,
                styles: [
                    {
                        id: "original",
                        name: "Original",
                        style: {
                            colours: { accent: "moss" },
                            fontPair: "fraunces-inter-tight",
                        },
                    },
                ],
            }),
        };

        const { siteId } = await prisma.$transaction((tx) =>
            writeSiteFromTemplate(tx, ctx, plan),
        );

        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { style: true },
        });
        expect(site.style).toMatchObject({
            colours: { accent: "moss" },
            fontPair: "fraunces-inter-tight",
        });

        await sites.publishSite(ctx, siteId);
        const publication = await prisma.publication.findFirstOrThrow({
            where: { siteId },
            select: { snapshot: true },
        });
        const snapshot = publication.snapshot as {
            site: { styleVariables: Record<string, string> };
        };
        expect(snapshot.site.styleVariables).toMatchObject({
            "--site-font-heading": "fraunces-inter-tight",
            "--site-font-body": "fraunces-inter-tight",
        });
    });

    it("leaves a site from a template without colourways unstyled", async () => {
        const ctx = await business();
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Crumb",
        });
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { style: true },
        });
        expect(site.style).toBeNull();
    });
});
