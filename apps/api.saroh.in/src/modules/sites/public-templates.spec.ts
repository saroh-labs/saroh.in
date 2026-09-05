import { listTemplates } from "@saroh/templates";

import { PublicSitesController } from "./public-sites.controller";
import type { SitePreviewLinksService } from "./site-preview-links.service";
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
            pages: expect.arrayContaining([expect.any(String)]),
        });
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
