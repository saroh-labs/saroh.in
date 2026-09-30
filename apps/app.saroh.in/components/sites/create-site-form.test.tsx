import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { addressSuggestionOf } from "@/lib/sites/service";

import {
    CreateSiteForm,
    initialTemplateId,
    UseSuggestedAddress,
} from "./create-site-form";

const noop = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/sites/actions", () => ({ createSite: vi.fn() }));
vi.mock("@/lib/api/http", () => ({
    apiFetch: vi.fn(),
    getActiveOrgId: vi.fn(),
    getJson: vi.fn(),
    getList: vi.fn(),
}));

/**
 * `/sites/new` never makes a site without a web address (DEC-069, L5): the
 * field starts from the API's defaults, and a refusal for one in use offers
 * a free one to use.
 */
describe("CreateSiteForm (L5)", () => {
    it("starts from the business's name and its web address", () => {
        const html = renderToStaticMarkup(
            <CreateSiteForm
                templates={[]}
                defaults={{ siteName: "Rye & Co", address: "rye-co" }}
            />,
        );
        expect(html).toContain("Web address");
        expect(html).toContain('value="rye-co"');
        expect(html).toContain(".saroh.app");
        expect(html).toContain("Customers find this site at rye-co.saroh.app");
        expect(html).toContain('value="Rye &amp; Co"');
    });

    it("starts empty when the defaults couldn't be read", () => {
        const html = renderToStaticMarkup(<CreateSiteForm templates={[]} />);
        expect(html).toContain('value=""');
        expect(html).toContain("Letters, numbers and hyphens.");
    });
});

describe("a refused address (L5)", () => {
    it("reads the free address a 409 offers", () => {
        const body = {
            error: {
                message: "rye.saroh.app belongs to another business",
                details: {
                    field: "subdomain",
                    reason: "taken",
                    suggestion: "rye-2",
                },
            },
        };
        expect(addressSuggestionOf(body)).toBe("rye-2");
        expect(addressSuggestionOf({ error: { message: "No." } })).toBeNull();
        // A page's suggested path is not an address.
        expect(
            addressSuggestionOf({
                error: { details: { suggestion: "/menu" } },
            }),
        ).toBeNull();
    });

    it("offers Use ‹suggestion› on the field", () => {
        const html = renderToStaticMarkup(
            <UseSuggestedAddress
                suggestion="rye-2"
                current="rye"
                onUse={noop}
            />,
        );
        expect(html).toContain("Use rye-2.saroh.app");
        expect(html).toContain('type="button"');
        expect(html).toContain("cursor-pointer");
    });

    it("says nothing once the field holds it, or with none offered", () => {
        expect(
            renderToStaticMarkup(
                <UseSuggestedAddress
                    suggestion="rye-2"
                    current="rye-2"
                    onUse={noop}
                />,
            ),
        ).toBe("");
        expect(
            renderToStaticMarkup(
                <UseSuggestedAddress
                    suggestion={null}
                    current="rye"
                    onUse={noop}
                />,
            ),
        ).toBe("");
    });
});

/**
 * A new site starts from the template for what is being set up (DEC-070,
 * K15), picked in the form to start with; any other can be chosen.
 */
describe("the template picker (K15)", () => {
    const templates = [
        { id: "starter", version: 2, name: "Starter", description: "" },
        { id: "personal", version: 1, name: "Personal", description: "" },
        { id: "portfolio", version: 1, name: "Portfolio", description: "" },
        { id: "writing", version: 1, name: "Writing", description: "" },
    ];

    it("starts on the kind's template when it is listed", () => {
        expect(initialTemplateId(templates, "portfolio")).toBe("portfolio");
        expect(initialTemplateId(templates, "personal")).toBe("personal");
    });

    it("starts on the first listed when the kind's isn't, and on none with none listed", () => {
        expect(initialTemplateId(templates, "gone")).toBe("starter");
        expect(initialTemplateId(templates, null)).toBe("starter");
        expect(initialTemplateId([], "portfolio")).toBe("none");
    });

    it("offers no blank site: a site always starts from a template", () => {
        const html = renderToStaticMarkup(
            <CreateSiteForm
                templates={templates}
                defaults={{ siteName: "Asha Rao Studio", address: "asha" }}
                defaultTemplateId="portfolio"
            />,
        );
        expect(html).toContain("Template");
        expect(html).not.toContain("Blank site");
        expect(html).not.toContain("(optional)");
        // Radix draws the picked name only once hydrated; e2e reads it.
    });
});
