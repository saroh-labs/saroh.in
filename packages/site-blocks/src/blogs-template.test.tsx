import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { blogsTemplate, instantiateTemplate } from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { JournalFeed, JournalPost } from "./blocks/journal";
import SectionRenderer from "./section-renderer";

/**
 * The Blogs template (industry templates U8) drawn as the live site draws
 * it, with the posts the server read. One page: the newest piece opened on
 * the page, the next few as Recent, the rest by year, then About. The
 * template types no posts: every title here comes from the feed, and with
 * none live the journals draw nothing, so Home is About alone, claiming
 * nothing.
 */

const ctx: TemplateContext = {
    organizationName: "Sample Writer",
    tagline: "Writing about practice, mostly",
};

const POSTS: JournalPost[] = [
    {
        title: "First fixture piece",
        slug: "first",
        excerpt: "The first piece's line.",
        content:
            "<p>The first paragraph of the first piece.</p><p>Its second paragraph.</p>",
        publishedAt: "2026-04-02T00:00:00.000Z",
    },
    {
        title: "Second fixture piece",
        slug: "second",
        excerpt: "The second piece's line.",
        publishedAt: "2026-03-12T00:00:00.000Z",
    },
    {
        title: "Third fixture piece",
        slug: "third",
        excerpt: "The third piece's line.",
        publishedAt: "2026-02-28T00:00:00.000Z",
    },
    {
        title: "Fourth fixture piece",
        slug: "fourth",
        excerpt: "The fourth piece's line.",
        publishedAt: "2025-12-19T00:00:00.000Z",
    },
    {
        title: "Fifth fixture piece",
        slug: "fifth",
        excerpt: "The fifth piece's line.",
        publishedAt: "2025-11-02T00:00:00.000Z",
    },
];

function renderPage(path: string, journal: JournalFeed) {
    const page = instantiateTemplate(blogsTemplate, ctx).pages.find(
        (p) => p.path === path,
    );
    if (!page) throw new Error(`No page at ${path}`);
    const resolvePage = () => undefined;
    return render(
        <>
            {page.sections.map((section) => (
                <SectionRenderer
                    key={section.order}
                    siteId="site-blogs"
                    journal={journal}
                    section={{
                        type: section.type,
                        content: toRendered(section.type, section.content, {
                            resolvePage,
                        }),
                    }}
                />
            ))}
        </>,
    );
}

/** Where `needle` first appears in the page's text; -1 if nowhere. */
function at(container: HTMLElement, needle: string): number {
    return container.textContent.indexOf(needle);
}

describe("the Blogs template, rendered live", () => {
    it("Home: the newest piece in depth, then Recent, the archive by year and About, in that order", () => {
        const { container } = renderPage("/", {
            posts: POSTS,
            basePath: "/blog",
        });
        const home = within(container);
        // The name is the header's: the page's h1 is for screen readers.
        expect(
            home.getByRole("heading", { level: 1, name: "Sample Writer" })
                .className,
        ).toContain("sr-only");
        expect(home.getByText("Writing about practice, mostly")).toBeVisible();
        // The lead: its own title, opening paragraphs and Continue reading.
        expect(
            home.getByRole("heading", {
                level: 2,
                name: "First fixture piece",
            }),
        ).toBeVisible();
        expect(
            home.getByText("The first paragraph of the first piece."),
        ).toBeVisible();
        expect(home.getByRole("heading", { name: "Recent" })).toBeVisible();
        expect(home.getByRole("heading", { name: "Archive" })).toBeVisible();
        // Counted from every post live, not typed.
        expect(home.getByText("5 pieces in all")).toBeVisible();
        expect(home.getByRole("heading", { name: "About" })).toBeVisible();

        const order = [
            "First fixture piece",
            "The first paragraph of the first piece.",
            "Recent",
            "Second fixture piece",
            "Fourth fixture piece",
            "Archive",
            "Fifth fixture piece",
            // Not "About": the lead's reading time says "About 1 minute".
            "This is a placeholder for a few words",
        ].map((word) => at(container, word));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(container.querySelectorAll("img")).toHaveLength(0);
        // No claim the site cannot keep.
        expect(container.textContent).not.toMatch(/subscribe|feed/i);
    });

    it("Home: the archive files the rest under their year, titles only", () => {
        const { container } = renderPage("/", {
            posts: POSTS,
            basePath: "/blog",
        });
        const archive = within(container)
            .getByRole("heading", { name: "Archive" })
            .closest("section");
        if (!archive) throw new Error("No archive section");
        const years = within(archive).getAllByRole("region");
        expect(years.map((y) => y.getAttribute("aria-label"))).toEqual([
            "2026",
            "2025",
        ]);
        expect(
            within(archive).getByRole("link", { name: /Fifth fixture piece/ }),
        ).toHaveAttribute("href", "/blog/fifth");
        // The newest is opened above, so the archive starts after it.
        expect(within(archive).queryByText("First fixture piece")).toBeNull();
        expect(
            within(archive).queryByText("The second piece's line."),
        ).toBeNull();
    });

    it("Home with no posts live: About alone, no empty journal", () => {
        const { container } = renderPage("/", { posts: [], basePath: "/blog" });
        const home = within(container);
        expect(home.queryByText("Recent")).toBeNull();
        expect(home.queryByText("Archive")).toBeNull();
        expect(home.getByRole("heading", { name: "About" })).toBeVisible();
        expect(container.textContent).not.toMatch(/no posts|coming soon/i);
    });
});
