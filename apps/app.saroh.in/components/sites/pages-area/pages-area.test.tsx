import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SitePage } from "@/lib/sites/service";

import { PagesArea } from "./pages-area";

// The sheet primitive needs a real browser; what is pinned is the content.
vi.mock("@saroh/ui/form-sheet", () => ({
    FormSheet: ({
        open,
        title,
        children,
        footNote,
    }: {
        open: boolean;
        title: string;
        children: ReactNode;
        footNote: ReactNode;
    }) =>
        open ? (
            <div role="dialog" aria-label={title}>
                <h2>{title}</h2>
                {children}
                <footer>{footNote}</footer>
            </div>
        ) : null,
}));
const query = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
    usePathname: () => "/sites/s1/pages",
    useSearchParams: () => new URLSearchParams(query.value),
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

describe("a page hidden behind a built-in route", () => {
    const walk = page({ id: "p5", path: "/book", title: "Book a walkthrough" });
    const health = [
        {
            pageId: "p5",
            title: "Book a walkthrough",
            path: "/book",
            issues: ["hiddenByRoute" as const],
            hiddenBehind: {
                root: "/book",
                name: "your booking page",
                purpose: "your booking page",
            },
        },
    ];

    it("says so in To fix", () => {
        expect(render({ pages: [...pages, walk], health })).toContain(
            "Hidden behind your booking page",
        );
    });

    it("says why at its link in the sheet, and the link stays editable", () => {
        query.value = "page=p5";
        const html = render({ pages: [...pages, walk], health });
        query.value = "";
        expect(html).toContain(
            "This page can&#x27;t be reached at /book: that link is your booking page. Give it its own link so visitors can open it.",
        );
        expect(html).toMatch(
            /<input[^>]*value="\/book"(?![^>]*disabled)[^>]*>/,
        );
    });
});

describe("the page sheet's foot", () => {
    const open = (over: Partial<Parameters<typeof PagesArea>[0]> = {}) => {
        query.value = "page=p2";
        const html = render({
            health: null,
            edits: null,
            redirects: null,
            ...over,
        });
        query.value = "";
        return html.slice(html.indexOf('role="dialog"'));
    };

    it("says nothing on a fresh sheet with nothing waiting", () => {
        const text = open();
        expect(text).toContain("Page settings");
        expect(text).not.toContain("data-save-footer");
        expect(text).not.toContain("goes live when you publish");
    });

    it("says Changed when the page was edited since it last went live", () => {
        expect(
            open({
                edits: [
                    { pageId: "p2", at: "2026-11-18T05:00:00.000Z", by: null },
                ],
                lastPublishedAt: "2026-11-17T05:00:00.000Z",
            }),
        ).toContain("Changed · goes live when you publish");
        expect(
            open({
                edits: [
                    { pageId: "p2", at: "2026-11-16T05:00:00.000Z", by: null },
                ],
                lastPublishedAt: "2026-11-17T05:00:00.000Z",
            }),
        ).not.toContain("goes live when you publish");
    });
});
