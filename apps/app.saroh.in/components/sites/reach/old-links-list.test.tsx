import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SiteRedirect } from "@/lib/sites/service";

import { oldLinkPath } from "./add-old-link-sheet";
import { LinksList } from "./links-list";
import { OldLinksList, whyLine } from "./old-links-list";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/sites/actions", () => ({
    createSiteRedirect: vi.fn(),
    removeSiteRedirect: vi.fn(),
}));

const pages = [
    { id: "p1", path: "/", title: "Home", isHome: true, hidden: false },
    {
        id: "p2",
        path: "/bridal",
        title: "Bridal",
        isHome: false,
        hidden: false,
    },
];
const auto: SiteRedirect = {
    id: "r1",
    fromPath: "/services/bridal-makeup-packages",
    toPath: "/bridal",
    toTitle: "Bridal",
    source: "AUTO",
    live: false,
    createdAt: "2026-11-18T05:00:00.000Z",
};
const own: SiteRedirect = {
    ...auto,
    id: "r2",
    fromPath: "/bridal-packages",
    source: "OWN",
    live: true,
};

const render = (redirects: SiteRedirect[] | null, canEdit = true): string =>
    renderToStaticMarkup(
        <OldLinksList
            siteId="s1"
            host="gulmohar.saroh.app"
            pages={pages}
            redirects={redirects}
            canEdit={canEdit}
        />,
    );

describe("Old links that forward here", () => {
    it("lets the merchant remove only an old link they added", () => {
        const html = render([auto, own]);
        expect(html).toContain("Add an old link");
        expect(html).toContain('aria-label="Remove /bridal-packages"');
        expect(html).not.toContain(
            'aria-label="Remove /services/bridal-makeup-packages"',
        );
        // The reason one made for them stays.
        expect(html).toContain("Old links made for you can&#x27;t be removed");
    });

    it("gives a reader the list and nothing to change", () => {
        const html = render([auto, own], false);
        expect(html).toContain("/bridal-packages");
        expect(html).not.toContain("Add an old link");
        expect(html).not.toContain("Remove /");
    });

    it("says a failed read apart from none yet", () => {
        expect(render(null)).toContain("Couldn&#x27;t load old links");
        expect(render([])).toContain("No old links yet");
    });

    it("says why each forwards, and when it waits for Publish", () => {
        expect(whyLine(auto)).toBe(
            "Made for you when the page link changed · goes live when you publish",
        );
        expect(whyLine(own)).toBe("Added by hand");
    });

    it("never says redirect or slug", () => {
        const html = render([auto, own]).toLowerCase();
        expect(html).not.toMatch(/redirect|slug/);
    });
});

describe("Page links you share", () => {
    it("marks a page whose link changed since the last publish", () => {
        const html = renderToStaticMarkup(
            <LinksList
                siteId="s1"
                host="gulmohar.saroh.app"
                pages={pages}
                currentPublicationId="pub1"
                redirects={[auto]}
            />,
        );
        expect(html).toContain("gulmohar.saroh.app/bridal");
        expect(html).toContain("Changed · goes live when you publish");
        // Home is the bare address; it didn't change.
        expect(html).toContain(">gulmohar.saroh.app<");
        expect(html).toContain("Live");
    });
});

describe("oldLinkPath", () => {
    it("takes a typed or pasted old link as a page link", () => {
        expect(oldLinkPath("old-prices")).toBe("/old-prices");
        expect(oldLinkPath(" /old-prices ")).toBe("/old-prices");
        expect(oldLinkPath("https://gulmohar.saroh.app/old-prices")).toBe(
            "/old-prices",
        );
    });
});
