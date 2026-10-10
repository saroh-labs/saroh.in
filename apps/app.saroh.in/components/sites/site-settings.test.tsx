import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SiteDetail } from "@/lib/sites/service";
import type { SiteAddress } from "@/lib/sites/share-links";

import { SiteSettings } from "./site-settings";
import { SiteSettingsRead } from "./site-settings-read";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
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
    pendingSiteChanges: [],
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
        // A break opportunity is no space (the web address's <wbr>).
        .replace(/<wbr\/?>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, " ");

describe("the site's settings name each address (DEC-069, L12)", () => {
    const html = renderToStaticMarkup(
        <SiteSettings site={site} address={address} />,
    );
    const text = words(html);

    it("calls where customers find the site its web address, once", () => {
        expect(text).toContain("Web address rye.saroh.app");
        expect(text.match(/rye\.saroh\.app Copy/g)).toHaveLength(1);
        expect(text).not.toMatch(/Saroh address|Subdomain|Site status/);
    });

    it("gives the web address the row's width, breaking only at its parts", () => {
        // The value and its buttons share one cell, so the address keeps
        // one line where it fits instead of a narrow column of its own.
        expect(html).toMatch(
            /data-row-inline[\s\S]*data-web-address[^>]*>rye\.<wbr\/>saroh\.<wbr\/>app</,
        );
    });

    it("calls where the posts live the posts path", () => {
        expect(text).toContain(
            "Posts path Next publish /journal · where your posts live",
        );
        expect(text).not.toMatch(/Writing address|Writing/);
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
        expect(read).toContain("Web address rye.saroh.app");
        expect(read).toContain(
            "Posts path Next publish /journal · where your posts live",
        );
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

describe("the two save models, made visible (UX-081, the audit)", () => {
    const html = renderToStaticMarkup(
        <SiteSettings site={site} address={address} />,
    );
    const text = words(html);

    it("marks only the draft rows with Next publish", () => {
        const marks = Array.from(
            html.matchAll(/data-saves="(now|publish)"/g),
            (m: RegExpMatchArray) => m[1],
        );
        // Title, description, share image, menu, footer and posts path.
        expect(marks).toEqual(Array(6).fill("publish"));
        expect(text).not.toContain("Live as soon as it's saved");
        expect(text).not.toContain("Goes live with your next publish");
        expect(text).not.toContain("part of your draft");
    });

    it("says a draft isn't published, with the way to publish", () => {
        const draft = words(
            renderToStaticMarkup(
                <SiteSettings
                    site={
                        {
                            ...site,
                            can: { manageSettings: true, publish: true },
                        } as unknown as SiteDetail
                    }
                    address={address}
                />,
            ),
        );
        expect(draft).toContain(
            "Your site isn't published yet. Nobody can reach it until you publish. Review and publish",
        );
    });

    const liveSite = (pendingSiteChanges: string[]) =>
        ({
            ...site,
            can: { manageSettings: true, publish: true },
            currentPublication: { publishedAt: "2026-10-01T10:00:00Z" },
            pendingSectionChanges: 0,
            pendingSiteChanges,
        }) as unknown as SiteDetail;

    it("counts what waits on a live site", () => {
        const html = renderToStaticMarkup(
            <SiteSettings
                site={liveSite(["style", "footer", "menu"])}
                address={address}
            />,
        );
        expect(words(html)).toContain(
            "3 changes wait for your next publish: the style, the footer and the menu. Review and publish",
        );
        expect(html).toContain('href="/sites/site_rye"');
    });

    it("leaves room under the bar so the last rows scroll above it", () => {
        const html = renderToStaticMarkup(
            <SiteSettings site={liveSite(["menu"])} address={address} />,
        );
        // Measured once mounted; the room comes straight after the bar.
        expect(html).toMatch(
            /data-publish-bar[\s\S]*<\/div><div aria-hidden="true" data-publish-bar-room/,
        );
    });

    it("draws no bar when the live site matches the draft", () => {
        const html = renderToStaticMarkup(
            <SiteSettings site={liveSite([])} address={address} />,
        );
        expect(html).not.toContain("data-publish-bar");
    });
});

describe('values in use, not "Nothing set yet" (the audit)', () => {
    const text = words(
        renderToStaticMarkup(<SiteSettings site={site} address={address} />),
    );

    it("shows the site's name as the title the live site uses", () => {
        expect(text).toContain("Title Next publish Rye · your site's name");
        expect(text).not.toContain("Nothing set yet");
    });

    it("says what has no stand-in is not written, with the verb to fix it", () => {
        expect(text).toContain("Description Next publish Not written Write");
        expect(text).toContain("Share image Next publish None");
        expect(text).toContain("Footer Next publish Not written Write");
        expect(text).toContain("Menu Next publish Not built Build");
    });

    it("names the module pages a menu-less site still lists", () => {
        const withShop = {
            ...site,
            pages: [
                {
                    id: "p1",
                    path: "/",
                    title: "Home",
                    isHome: true,
                    hidden: false,
                },
                {
                    id: "p2",
                    path: "/shop",
                    title: "Shop",
                    isHome: false,
                    hidden: false,
                    kind: "SHOP",
                },
            ],
        } as unknown as SiteDetail;
        expect(
            words(
                renderToStaticMarkup(
                    <SiteSettings site={withShop} address={address} />,
                ),
            ),
        ).toContain("Not built · Shop shows on their own");
    });
});

describe("Before you share your site (the audit)", () => {
    it("starts from what is done, and jumps to each row left", () => {
        const html = renderToStaticMarkup(
            <SiteSettings site={site} address={address} />,
        );
        const text = words(html);
        expect(text).toContain("Before you share your site 1 of 3");
        expect(text).toContain("Done: Search title · using Rye");
        expect(html).toContain('href="#settings-description"');
        expect(html).toContain('href="#settings-share-image"');
    });

    it("is one quiet line for a live site with everything set", () => {
        const ready = {
            ...site,
            currentPublication: { publishedAt: "2026-10-01T10:00:00Z" },
            seoDescription: "Bread",
            socialImageUrl: "https://example.com/a.jpg",
        } as unknown as SiteDetail;
        const html = renderToStaticMarkup(
            <SiteSettings site={ready} address={address} />,
        );
        expect(html).toContain("data-share-ready");
        expect(html).not.toContain("data-share-checklist");
    });
});

describe("the groups, from a side list (owner, 9 Oct)", () => {
    const tabsOf = (html: string) =>
        Array.from(
            html.matchAll(
                /role="tab" aria-selected="(true|false)"[^>]*>([^<]+)</g,
            ),
            (m: RegExpMatchArray) => [m[2], m[1]],
        );

    it("lists the groups in order, Address open, one panel shown", () => {
        const html = renderToStaticMarkup(
            <SiteSettings
                site={site}
                address={address}
                approval={{ on: false, canChange: true }}
            />,
        );
        expect(html).toContain(
            'role="tablist" aria-label="Settings sections" aria-orientation="vertical"',
        );
        // Below 1024px the same choice is a select, never a second strip.
        expect(words(html)).toContain("Section");
        expect(html).toMatch(/<button[^>]*role="combobox"/);
        expect(tabsOf(html)).toEqual([
            ["Address", "true"],
            ["Search and sharing", "false"],
            ["Menu and footer", "false"],
            ["Shop", "false"],
            ["Tracking", "false"],
            ["Advanced", "false"],
        ]);
        const panels = Array.from(
            html.matchAll(
                /<div id="settings-panel-([a-z-]+)" role="tabpanel"[^>]*>/g,
            ),
            (m: RegExpMatchArray) => [
                m[1],
                m[0].includes(" hidden") ? "hidden" : "shown",
            ],
        );
        expect(panels.filter(([, v]) => v === "shown")).toEqual([
            ["address", "shown"],
        ]);
        // Every panel stays mounted, so a half-edited row survives a tab.
        expect(panels).toHaveLength(6);
        const ids = Array.from(
            html.matchAll(/data-settings-group="([a-z-]+)"/g),
            (m: RegExpMatchArray) => m[1],
        );
        expect(ids).toEqual([
            "address",
            "search-and-sharing",
            "menu-and-footer",
            "shop",
            "tracking",
            "advanced",
        ]);
    });

    it("leaves Shop and Advanced out when there's nothing in them", () => {
        const html = renderToStaticMarkup(
            <SiteSettings
                site={{ ...site, sellsFrom: null }}
                address={address}
            />,
        );
        expect(html).not.toContain('data-settings-group="shop"');
        expect(html).not.toContain('data-settings-group="advanced"');
        expect(tabsOf(html).map(([name]) => name)).toEqual([
            "Address",
            "Search and sharing",
            "Menu and footer",
            "Tracking",
        ]);
    });

    it("offers Change for the web address only where the owner may", () => {
        const can = renderToStaticMarkup(
            <SiteSettings site={site} address={address} canChangeAddress />,
        );
        expect(can).toContain('href="/settings/organization#web-address"');
        const cannot = renderToStaticMarkup(
            <SiteSettings site={site} address={address} />,
        );
        expect(cannot).not.toContain("/settings/organization#web-address");
    });

    it("groups the read-only view the same way, with no controls", () => {
        const html = renderToStaticMarkup(
            <SiteSettingsRead site={site} address={address} />,
        );
        expect(html).toContain('data-settings-group="search-and-sharing"');
        expect(tabsOf(html).map(([name]) => name)).toContain(
            "Search and sharing",
        );
        expect(html).not.toMatch(/<input|<textarea|>Edit<|>Write<|>Build</);
    });
});
