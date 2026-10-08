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
    setPublishNeedsApproval: vi.fn(),
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

/**
 * "Publishing needs approval" (DEC-071, T13): the owner gets the switch,
 * everyone else reads whether it's on and that only the owner can change it,
 * and nothing shows while the business has no test releases.
 */
describe("the site's settings show whether publishing needs approval (T13)", () => {
    const render = (approval: { on: boolean; canChange: boolean } | null) =>
        renderToStaticMarkup(
            <SiteSettings site={site} address={address} approval={approval} />,
        );

    it("gives the owner the switch, with what it does", () => {
        const html = render({ on: false, canChange: true });
        expect(html).toContain('role="switch"');
        expect(html).toContain('aria-checked="false"');
        expect(html).toContain('aria-label="Publishing needs approval"');
        const text = words(html);
        expect(text).toContain(
            "Only an approved test release can go live. You can still go live without approval; it's recorded.",
        );
        expect(text).not.toContain("only the owner can change this");
    });

    it("shows the owner's switch on when the setting is on", () => {
        expect(render({ on: true, canChange: true })).toContain(
            'aria-checked="true"',
        );
    });

    it("gives an admin the read-only line, and no switch", () => {
        const html = render({ on: true, canChange: false });
        expect(html).not.toContain('role="switch"');
        const text = words(html);
        expect(text).toContain(
            "Needs approval On · only the owner can change this",
        );
        expect(text).toContain("Only an approved test release can go live.");
        expect(text).not.toContain("it's recorded");
    });

    it("tells an admin when it's off, too", () => {
        const text = words(render({ on: false, canChange: false }));
        expect(text).toContain("Off · only the owner can change this");
    });

    it("leaves the row out while it's hidden", () => {
        const text = words(render(null));
        expect(text).not.toContain("Needs approval");
        expect(text).not.toContain("only the owner can change this");
    });

    it("says the same in the read-only view", () => {
        const read = words(
            renderToStaticMarkup(
                <SiteSettingsRead
                    site={site}
                    address={address}
                    approval={{ on: true, canChange: false }}
                />,
            ),
        );
        expect(read).toContain(
            "Needs approval On · only the owner can change this",
        );
    });
});

describe("each settings section says when it goes live (UX-081)", () => {
    const html = renderToStaticMarkup(
        <SiteSettings site={site} address={address} />,
    );
    const marks = Array.from(
        html.matchAll(/data-saves="(now|publish)"/g),
        (m: RegExpMatchArray) => m[1],
    );

    it("marks the address and domain live at once, the rest with a publish", () => {
        expect(marks.filter((m) => m === "now")).toHaveLength(2);
        expect(marks.filter((m) => m === "publish")).toHaveLength(5);
        expect(words(html)).toContain("Live as soon as it's saved");
        expect(words(html)).toContain("Goes live with your next publish");
    });
});
