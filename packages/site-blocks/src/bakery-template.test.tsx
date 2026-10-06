import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { bakeryTemplate, instantiateTemplate } from "@saroh/templates";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_POSTS, SAMPLE_PRODUCTS } from "./block-fixture-preview";
import type { JournalFeed } from "./blocks/journal";
import type { ProductGridFeed } from "./blocks/product-grid";
import type { PublicVisit } from "./lib/public-visit";
import { PageSections } from "./section-renderer";

/**
 * The bakery template (industry templates U4) on a live site, drawn by the
 * real blocks with the feeds the server would read: the design's order, the
 * bread, hours and posts from the business, and nothing drawn for data the
 * business does not have.
 */

/** Rye & Co.'s week, as the design lists it: Monday closed. */
const BAKERY_VISIT: PublicVisit = {
    source: "business",
    storeId: null,
    name: "Rye & Co.",
    address: null,
    phone: null,
    hours: [
        { day: "MON", open: "07:00", close: "15:00", closed: true },
        { day: "TUE", open: "07:00", close: "15:00", closed: false },
        { day: "WED", open: "07:00", close: "15:00", closed: false },
        { day: "THU", open: "07:00", close: "15:00", closed: false },
        { day: "FRI", open: "07:00", close: "15:00", closed: false },
        { day: "SAT", open: "07:00", close: "16:00", closed: false },
        { day: "SUN", open: "08:00", close: "13:00", closed: false },
    ],
    timezone: "Asia/Kolkata",
};

const ctx: TemplateContext = {
    organizationName: "Rye & Co.",
    modules: ["WEBSITE", "COMMERCE"],
};

function stubVisit(visit: PublicVisit | null) {
    const fetchMock = vi.fn((url: string) =>
        Promise.resolve(
            url.endsWith("/visit") && visit
                ? new Response(JSON.stringify(visit), { status: 200 })
                : new Response("{}", { status: 404 }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderHome(
    context: TemplateContext,
    feeds: { products: ProductGridFeed; journal: JournalFeed },
) {
    const home = instantiateTemplate(bakeryTemplate, context).pages[0];
    const resolvePage = () => undefined;
    const sections = home.sections.map((s) => ({
        type: s.type,
        content: toRendered(s.type, s.content, { resolvePage }),
    }));
    return render(
        <PageSections
            sections={sections}
            siteId="site-bakery"
            apiUrl="https://api.example"
            journal={feeds.journal}
            productGrids={sections.map((s) =>
                s.type === "productGrid" ? feeds.products : undefined,
            )}
        />,
    );
}

beforeEach(() => {
    // Tuesday 6 Oct 2026, 10:00 in Mumbai.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T04:30:00.000Z"));
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("the bakery template, rendered live", () => {
    it("reads in the design's order: photo and open line, bread, story, hours, journal", async () => {
        const fetchMock = stubVisit(BAKERY_VISIT);
        const { container } = renderHome(ctx, {
            products: { products: SAMPLE_PRODUCTS, basePath: "/shop" },
            journal: { posts: SAMPLE_POSTS, basePath: "/journal" },
        });

        // The menu lies over the photo: the first section is marked for it.
        expect(
            container.querySelector('[data-site-first-hero="fullBleed"]'),
        ).not.toBeNull();
        expect(
            container.querySelector('[data-hero-look="fullBleed"]'),
        ).not.toBeNull();

        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Come in the morning" }),
            ).toBeVisible(),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.example/public/sites/site-bakery/visit",
            expect.anything(),
        );

        const headings = Array.from(container.querySelectorAll("h1, h2")).map(
            (h) => String(h.textContent).trim(),
        );
        expect(headings).toEqual([
            "Bread worth the walk",
            "Today's bread",
            "Everything here begins in a clip-top jar",
            "Come in the morning",
            "From the bakery",
        ]);

        // Open now, in words, over the photo and above the week.
        expect(screen.getAllByText(/^Open now · closes 3/)).toHaveLength(2);
        // The bread is the business's, and sold out is said in words.
        expect(screen.getByText("Sourdough loaf")).toBeVisible();
        expect(screen.getByText("Sold out")).toBeVisible();
        // Monday is stated closed, not left out.
        const monday = screen.getByRole("rowheader", { name: "Monday" });
        expect(monday.closest("tr")?.textContent).toContain("Closed");
        // Every post, as a dated list.
        for (const post of SAMPLE_POSTS) {
            expect(
                screen.getByRole("link", { name: new RegExp(post.title) }),
            ).toHaveAttribute("href", `/journal/${post.slug}`);
        }
        // The story's photo is a brief for the owner, not drawn for visitors.
        expect(container.textContent).not.toContain("Hands folding dough");
        expect(container.textContent).not.toContain("Loaves cooling");
        expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("with no products, hours or posts, draws only the photo and the story", async () => {
        const fetchMock = stubVisit(null);
        const { container } = renderHome(ctx, {
            products: { products: [], basePath: "/shop" },
            journal: { posts: [], basePath: "/journal" },
        });
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        await waitFor(() =>
            expect(container.textContent).not.toMatch(/Loading/),
        );
        const headings = Array.from(container.querySelectorAll("h1, h2")).map(
            (h) => String(h.textContent).trim(),
        );
        expect(headings).toEqual([
            "Bread worth the walk",
            "Everything here begins in a clip-top jar",
        ]);
        expect(container.textContent).not.toMatch(/Open now|Closed|Sold out/);
    });
});
