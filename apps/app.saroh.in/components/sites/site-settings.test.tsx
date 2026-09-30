import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SiteDetail } from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";

import { SiteSettings } from "./site-settings";
import { SiteSettingsRead } from "./site-settings-read";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/sites/actions", () => ({
    updateSiteFooter: vi.fn(),
    updateSiteNavigation: vi.fn(),
    updateSiteSettings: vi.fn(),
}));
// Each reads on its own once mounted; the words around them are what is
// under test here.
vi.mock("@/components/sites/custom-domain", () => ({
    CustomDomain: () => null,
}));
vi.mock("@/components/sites/media-picker", () => ({
    MediaPicker: () => null,
}));

/**
 * The four addresses named apart (DEC-069, L12): the site's settings say
 * "Web address" for where customers find it and "Posts path" for where its
 * posts live — never a bare "Address", "Saroh address", "Subdomain" or
 * "Writing address".
 */

const site = {
    id: "site_rye",
    name: "Rye",
    can: { manageSettings: true },
    currentPublication: null,
    footer: null,
    navigation: null,
    pages: [],
    pendingSectionChanges: 0,
    pendingSiteChanges: 0,
    postsPrefix: "journal",
    sellsFrom: {
        storefront: { id: "st_1", name: "Online" },
        choices: [{ id: "st_1", name: "Online", products: 4 }],
    },
    shopAwaitsSellsFrom: false,
    seoTitle: null,
    seoDescription: null,
    socialImageUrl: null,
    socialImageWidth: null,
    socialImageHeight: null,
    socialImageBytes: null,
} as unknown as SiteDetail;

const address: SiteAddress = {
    host: "rye.saroh.app",
    url: "https://rye.saroh.app",
    platformHost: "rye.saroh.app",
};

/** The text a merchant reads, tags and entities aside. */
const words = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, " ");

describe("the site's settings name each address (DEC-069, L12)", () => {
    const html = renderToStaticMarkup(
        <SiteSettings site={site} address={address} />,
    );
    const text = words(html);

    it("calls where customers find the site its web address", () => {
        expect(text).toContain("Web address rye.saroh.app");
        expect(text).toContain("On Saroh rye.saroh.app");
        expect(text).not.toMatch(/Saroh address|Subdomain/);
    });

    it("calls where the posts live the posts path", () => {
        expect(text).toContain("Posts path /journal");
        expect(text).not.toContain("Writing address");
    });

    it("says the online shop sells from a location", () => {
        expect(text).toContain("Your online shop sells from Online");
        expect(text).not.toMatch(/storefront/i);
    });

    it("says the same in the read-only view", () => {
        const read = words(
            renderToStaticMarkup(
                <SiteSettingsRead site={site} address={address} />,
            ),
        );
        expect(read).toContain("Web address On Saroh rye.saroh.app");
        expect(read).not.toMatch(/Saroh address/);
    });
});
