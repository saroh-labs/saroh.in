import { getTemplate } from "@saroh/templates";

import { recordedTemplate } from "./site-style-offer";
import { syncSiteWithModules } from "./template-sync";

/**
 * KD10 (site templates plan U9): a redesigned template is a new version
 * for NEW sites only. A site keeps the version it was made from, so a
 * module switched on later plans against that stored version, never the
 * newest one.
 */
describe("template sync plans against the site's stored version (KD10)", () => {
    it("reads the version the site was made from, not the newest", () => {
        const newest = getTemplate("bakery");
        expect(newest?.version).toBeGreaterThan(1);
        const made = recordedTemplate({
            templateId: "bakery",
            templateVersion: 1,
        });
        expect(made?.version).toBe(1);
        expect(made).toBe(getTemplate("bakery", 1));
    });

    it("leaves a bakery@1 site's pages alone when Products is switched on", async () => {
        const tx = {
            site: {
                findFirst: jest.fn().mockResolvedValue({
                    id: "site_1",
                    name: "Rye & Co.",
                    templateId: "bakery",
                    templateVersion: 1,
                }),
            },
            page: { findMany: jest.fn() },
        };
        const result = await syncSiteWithModules(
            tx as never,
            { organizationId: "org_1" } as never,
            "COMMERCE",
        );
        // bakery@1 lays down no module pages, so nothing is planned and no
        // page is read, let alone given bakery@2's redesign.
        expect(result).toBeNull();
        expect(tx.page.findMany).not.toHaveBeenCalled();
    });
});
