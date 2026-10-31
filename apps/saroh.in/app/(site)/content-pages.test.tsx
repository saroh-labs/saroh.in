// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteFooter } from "@/components/shared/nav/site-footer";
import { docPages } from "@/lib/docs-pages";
import { docHubLinks } from "@/lib/search-page-route";

/**
 * /gst, /guides and /downloads on saroh.in (plan 2026-10-31-002, U6–U9):
 * thin routes over the package's templates, links only to what this build
 * has, and the footer's links to the hubs once a page is live.
 */
const env = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("@/env", () => ({ env }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

const publish = (live: string[], preview = false) => {
    env.SAROH_SEARCH_PAGES = JSON.stringify({ preview, live, takenOff: [] });
};
beforeEach(() => publish([], true));
afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
});

const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });
const SALON = "/gst/salon-and-beauty-services";

describe("/gst/[slug]", () => {
    it("draws a page not live as a draft, kept out of search, with its band's source", async () => {
        const route = await import("./gst/[slug]/page");
        const meta = await route.generateMetadata(
            slug("salon-and-beauty-services"),
        );
        expect(meta.robots).toEqual({ index: false, follow: false });
        const { container } = render(
            await route.default(slug("salon-and-beauty-services")),
        );
        expect(screen.getByText("Draft — not published yet")).toBeTruthy();
        expect(
            container.querySelector("[data-cta]")?.getAttribute("data-cta"),
        ).toBe("gst-salon-and-beauty-services");
        expect(container.querySelector(".sp-by-line")?.textContent).toContain(
            "not tax advice",
        );
        await expect(route.default(slug("no-such-page"))).rejects.toThrow(
            "NEXT_NOT_FOUND",
        );
    });

    it("links a GST tool and the trade's /for/ page only when they are live", async () => {
        const route = await import("./gst/[slug]/page");
        publish([SALON]);
        const bare = render(
            await route.default(slug("salon-and-beauty-services")),
        );
        expect(bare.container.querySelectorAll(".sp-rel-tool")).toHaveLength(0);
        cleanup();
        publish([SALON, "/tools/gst-calculator", "/for/salons"]);
        const { container } = render(
            await route.default(slug("salon-and-beauty-services")),
        );
        const hrefs = [...container.querySelectorAll(".sp-rel-tool")].map((a) =>
            a.getAttribute("href"),
        );
        expect(hrefs).toEqual(["/tools/gst-calculator", "/for/salons"]);
    });
});

describe("/guides and /downloads", () => {
    it("draws a guide with its outline and a download with its benefits", async () => {
        const guide = await import("./guides/[slug]/page");
        const g = render(await guide.default(slug("reduce-no-shows")));
        expect(
            g.container.querySelectorAll(".sp-otp a").length,
        ).toBeGreaterThan(0);
        cleanup();
        const download = await import("./downloads/[slug]/page");
        const d = render(
            await download.default(slug("customer-list-template")),
        );
        expect(d.container.querySelectorAll(".sp-dl-ben li").length).toBe(3);
    });

    it("each hub lists the pages this build has, noindex while none is live", async () => {
        for (const [kind, hub] of [
            ["gst", await import("./gst/page")],
            ["guides", await import("./guides/page")],
            ["downloads", await import("./downloads/page")],
        ] as const) {
            expect(hub.generateMetadata().robots).toEqual({
                index: false,
                follow: false,
            });
            const { container } = render(hub.default());
            expect(container.querySelectorAll(".sp-lc")).toHaveLength(
                docPages.list(kind).length,
            );
            cleanup();
        }
        publish([SALON]);
        expect((await import("./gst/page")).generateMetadata().robots).toBe(
            undefined,
        );
    });

    it("the guides' chips read ?for= in the browser", async () => {
        window.history.replaceState(null, "", "/guides?for=gyms-and-studios");
        const hub = await import("./guides/page");
        render(hub.default());
        const nav = screen.getByRole("navigation", {
            name: "Guides for your trade",
        });
        expect(
            within(nav).getByRole("link", { current: "page" }).textContent,
        ).toBe("Gyms and studios");
        const shown = docPages
            .list("guides")
            .filter((p) => p.trades.includes("gyms-and-studios"));
        expect(document.querySelectorAll(".sp-lc")).toHaveLength(shown.length);
    });
});

describe("the hubs in the menu and footer", () => {
    it("shows a hub only once one of its pages is live, marked new", () => {
        publish([]);
        expect(docHubLinks()).toEqual([]);
        publish([SALON, "/guides/reduce-no-shows"]);
        expect(docHubLinks().map((l) => [l.name, l.href, l.isNew])).toEqual([
            ["Guides", "/guides", true],
            ["GST guides", "/gst", true],
        ]);
    });

    it("draws the footer's small new tag beside them", () => {
        publish([SALON]);
        render(<SiteFooter resources={docHubLinks()} />);
        const link = screen.getByRole("link", { name: /GST guides/ });
        expect(link.textContent).toBe("GST guidesnew");
        expect(link.getAttribute("href")).toBe("/gst");
    });
});
