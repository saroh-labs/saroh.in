import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StorefrontChooser } from "@/components/commerce/storefront-chooser";

import { CreateStoreForm } from "./create-store-form";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/stores/actions", () => ({
    createStore: vi.fn(),
}));

/**
 * A location has no "Web address" of its own (DEC-069, L14): the storefront
 * slug went nowhere. The business's web address is its website's. Its
 * description and logo are a sheet on The place, checked for the same in
 * `place-rows.test.tsx`.
 */

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, " ");

describe("the location forms have no Web address (L14)", () => {
    it("the new-location form: a name and a description", () => {
        const html = renderToStaticMarkup(<CreateStoreForm />);
        const t = text(html);
        expect(t).toContain("Location name");
        expect(t).not.toContain("Web address");
        expect(html).not.toContain('name="slug"');
    });

    it("the location chooser names each location, with no /slug under it", () => {
        const html = renderToStaticMarkup(
            <StorefrontChooser
                section="Products"
                sectionHref="/commerce/products"
                crumb="New product"
                title="Where is it sold?"
                description="Pick a location."
                stores={[{ id: "st_hill", name: "Hill Road" }]}
                hrefFor={(id) => `/commerce/products/new?storefront=${id}`}
            />,
        );
        expect(text(html)).toContain("Hill Road");
        expect(text(html)).not.toMatch(/\/hill/);
    });
});
