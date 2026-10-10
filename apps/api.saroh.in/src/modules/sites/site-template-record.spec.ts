import { starterTemplate } from "@saroh/templates";

import {
    publicationTemplate,
    siteTemplate,
    templateFooterLine,
    templateFormerFooterLines,
} from "./site-template-record";

describe("a site's template record (KTD-7)", () => {
    it("reads the template, version and style a site was made with", () => {
        expect(
            siteTemplate({
                templateId: "personal",
                templateVersion: 1,
                templateStyleId: "dusk",
            }),
        ).toEqual({ id: "personal", version: 1, styleId: "dusk" });
    });

    it("reads no style as null", () => {
        expect(
            siteTemplate({ templateId: "personal", templateVersion: 1 }),
        ).toEqual({ id: "personal", version: 1, styleId: null });
    });

    it("is unknown, not guessed, for a site made before it was recorded", () => {
        expect(
            siteTemplate({
                templateId: null,
                templateVersion: null,
                templateStyleId: null,
            }),
        ).toBeNull();
    });

    it("stamps a publication with the site's own template", () => {
        expect(
            publicationTemplate({
                templateId: "portfolio",
                templateVersion: 1,
            }),
        ).toEqual({ id: "portfolio", version: 1 });
    });

    it("stamps the starter for a site with none, as every publish did before", () => {
        expect(
            publicationTemplate({ templateId: null, templateVersion: null }),
        ).toEqual({ id: starterTemplate.id, version: starterTemplate.version });
    });
});

describe("the template's own footer line (round 2)", () => {
    it("is the manifest's line for the template and version the site records", () => {
        expect(
            templateFooterLine({ templateId: "bakery", templateVersion: 1 }),
        ).toBe("Your street and area — and the day you close");
    });

    it("is null for an unknown site, an unknown template, or one with no line", () => {
        expect(
            templateFooterLine({ templateId: null, templateVersion: null }),
        ).toBeNull();
        expect(
            templateFooterLine({ templateId: "nope", templateVersion: 1 }),
        ).toBeNull();
        expect(
            templateFooterLine({
                templateId: starterTemplate.id,
                templateVersion: starterTemplate.version,
            }),
        ).toBeNull();
    });

    it("gives a shop on Store a line that names no other business, and keeps the old one known", () => {
        const store = { templateId: "ceramics", templateVersion: 1 };
        expect(templateFooterLine(store)).toBe(
            "Your area and town · when you are open",
        );
        expect(templateFormerFooterLines(store)).toEqual([
            "Your area and town — and when the studio is open",
        ]);
        expect(
            templateFormerFooterLines({
                templateId: null,
                templateVersion: null,
            }),
        ).toEqual([]);
        expect(
            templateFormerFooterLines({
                templateId: "bakery",
                templateVersion: 1,
            }),
        ).toEqual([]);
    });
});
