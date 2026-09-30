import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { addressSuggestionOf } from "@/lib/sites/service";

import { CreateSiteForm, UseSuggestedAddress } from "./create-site-form";

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
