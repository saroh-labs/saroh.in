import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SitePage } from "@/lib/sites/service";

import { PagesArea } from "./pages-area";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
    usePathname: () => "/sites/s1/pages",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/sites/actions", () => ({
    createPage: vi.fn(),
    updatePage: vi.fn(),
    deletePage: vi.fn(),
    duplicatePage: vi.fn(),
}));

const page = (over: Partial<SitePage>): SitePage => ({
    id: "p",
    path: "/x",
    title: "X",
    isHome: false,
    hidden: false,
    kind: "FREE",
    inMenu: true,
    ...over,
});
const pages = [
    page({ id: "p1", path: "/", title: "Home", isHome: true }),
    page({ id: "p2", path: "/bridal", title: "Bridal makeup packages" }),
    page({ id: "p3", path: "/shop", title: "Shop", kind: "SHOP" }),
    page({
        id: "p4",
        path: "/diwali-offers",
        title: "Diwali offers",
        hidden: true,
        inMenu: false,
    }),
];

const render = (over: Partial<Parameters<typeof PagesArea>[0]> = {}) =>
    renderToStaticMarkup(
        <PagesArea
            siteId="s1"
            siteName="Gulmohar Salon"
            pages={pages}
            host="gulmohar.saroh.app"
            live
            siteImageUrl={null}
            canUpdate
            health={[
                {
                    pageId: "p2",
                    title: "Bridal makeup packages",
                    path: "/bridal",
                    issues: ["googleText"],
                },
            ]}
            edits={[
                {
                    pageId: "p2",
                    at: "2026-11-18T05:00:00.000Z",
                    by: "Ritika Sharma",
                },
            ]}
            redirects={[
                {
                    id: "r1",
                    fromPath: "/services/bridal-makeup-packages",
                    toPath: "/bridal",
                    toTitle: "Bridal makeup packages",
                    source: "AUTO",
                    live: false,
                    createdAt: "2026-11-18T05:00:00.000Z",
                },
            ]}
            {...over}
        />,
    );

describe("Pages (WXPPages)", () => {
    it("lists every page with what it needs, and the counts in the filters", () => {
        const html = render();
        expect(html).toContain("Bridal makeup packages");
        expect(html).toContain("No text for Google");
        expect(html).toContain("All good");
        expect(html).toContain("From your products");
        expect(html).toContain("Hidden");
        // All 4, In menu 3 (Home always), Needs fixing 1: Overview's count.
        expect(html).toMatch(/All[^]*?4/);
        expect(html).toMatch(/In menu[^]*?3/);
        expect(html).toMatch(/Needs fixing[^]*?1/);
        expect(html).toContain("New page");
    });

    it("says a changed link waits for Publish, and who changed it", () => {
        expect(render()).toContain(
            "Link changed by Ritika Sharma · goes live when you publish",
        );
    });

    it("drops the health column and filter when it couldn't be read", () => {
        const html = render({ health: null });
        expect(html).not.toContain("Needs fixing");
        expect(html).not.toContain("All good");
    });

    it("gives a reader the list and nothing to add", () => {
        expect(render({ canUpdate: false })).not.toContain("New page");
    });
});
