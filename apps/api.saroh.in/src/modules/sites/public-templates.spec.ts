// The org-scoped controller pulls in better-auth's ESM through its guards,
// which ts-jest cannot transform; stubbed as `sites.controller.spec.ts` does.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));

import { listTemplates } from "@saroh/templates";

import type { PublicFooterService } from "./public-footer.service";
import type { PublicHeadService } from "./public-head.service";
import { PublicSitesController } from "./public-sites.controller";
import type { PublicVisitService } from "./public-visit.service";
import type { SitePreviewLinksService } from "./site-preview-links.service";
import { SitesController } from "./sites.controller";
import type { SitesService } from "./sites.service";

/**
 * The public template catalogue (#107).
 *
 * Unauthenticated and unscoped, so what it may return is the whole question.
 * These assert the shape rather than the copy: the registry is allowed to grow
 * a template without this file changing, but it is not allowed to start
 * leaking anything about an Organization through a route with no guards on it.
 */
describe("GET /public/sites/templates", () => {
    const controller = new PublicSitesController(
        {} as unknown as SitesService,
        {} as unknown as SitePreviewLinksService,
        {} as unknown as PublicVisitService,
        {} as unknown as PublicFooterService,
        {} as unknown as PublicHeadService,
    );

    it("returns every registered template", () => {
        expect(controller.templates()).toHaveLength(listTemplates().length);
        expect(controller.templates().length).toBeGreaterThan(0);
    });

    it("describes a template well enough for a showcase to render it", () => {
        const [template] = controller.templates();

        expect(template).toEqual({
            id: expect.any(String),
            version: expect.any(Number),
            name: expect.any(String),
            description: expect.any(String),
            slug: expect.any(String),
            kinds: expect.any(Array),
            shape: null,
            uses: expect.any(Array),
            colourways: expect.any(Array),
            pages: expect.arrayContaining([expect.any(String)]),
        });
    });

    // What the picker (U12) and the gallery read: who it is for, what it
    // is built around, the modules it needs and its colourways as chips.
    it("carries the picker's metadata, from the manifest", () => {
        const bakery = controller.templates().find((t) => t.id === "bakery");
        expect(bakery).toMatchObject({
            slug: "bakery",
            kinds: ["food"],
            shape: "store",
            uses: ["COMMERCE"],
        });
        expect(bakery?.colourways.length).toBeGreaterThan(0);
        for (const colourway of bakery?.colourways ?? []) {
            expect(Object.keys(colourway).sort()).toEqual([
                "chips",
                "id",
                "name",
            ]);
            expect(colourway.chips).toHaveLength(3);
            for (const chip of colourway.chips) {
                // An HSL triple, as Website › Style draws its chips.
                expect(chip).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/);
            }
        }
    });

    it("offers every colourway create accepts as a styleId, default first", () => {
        for (const template of controller.templates()) {
            const source = listTemplates().find((t) => t.id === template.id);
            expect(template.colourways.map((c) => c.id)).toEqual(
                (source?.styles ?? []).map((s) => s.id),
            );
            expect(template.slug).toBe(source?.slug ?? source?.id);
        }
    });

    it("is the catalogue the org-scoped picker route returns", () => {
        const scoped = new SitesController(
            {} as unknown as SitesService,
            {} as unknown as SitePreviewLinksService,
        );
        expect(scoped.templates()).toEqual(controller.templates());
    });

    // The route has no BetterAuthGuard and no OrganizationGuard, so anything
    // it returns is world-readable. Page TITLES are a claim about the product;
    // page SECTIONS are the instantiated content, and that must stay behind
    // the org-scoped route.
    it("exposes page titles only, never section content", () => {
        for (const template of controller.templates()) {
            for (const page of template.pages) {
                expect(typeof page).toBe("string");
            }
        }

        const serialized = JSON.stringify(controller.templates());
        expect(serialized).not.toContain("sections");
        expect(serialized).not.toContain("organizationId");
        expect(serialized).not.toContain("siteId");
    });

    it("agrees with the registry the API instantiates sites from", () => {
        const registry = listTemplates();

        for (const template of controller.templates()) {
            const source = registry.find(
                (candidate) =>
                    candidate.id === template.id &&
                    candidate.version === template.version,
            );

            expect(source).toBeDefined();
            expect(template.name).toBe(source?.name);
            expect(template.pages).toEqual(
                source?.pages.map((page) => page.title),
            );
        }
    });
});
