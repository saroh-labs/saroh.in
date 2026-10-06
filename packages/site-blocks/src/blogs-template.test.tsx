import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { blogsTemplate, instantiateTemplate } from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { JournalFeed, JournalPost } from "./blocks/journal";
import SectionRenderer from "./section-renderer";

/**
 * The Blogs template (industry templates U8) drawn as the live site draws
 * it, with the posts the server read. The template types no posts: every
 * title here comes from the feed, and with none live both journals draw
 * nothing, so Home is the masthead and About alone, claiming nothing.
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
    it("Home: masthead, the three newest as Recent, then About, in that order", () => {
        const { container } = renderPage("/", {
            posts: POSTS,
            basePath: "/blog",
        });
        const home = within(container);
        expect(
            home.getByRole("heading", { level: 1, name: "Sample Writer" }),
        ).toBeVisible();
        expect(home.getByText("Writing about practice, mostly")).toBeVisible();
        expect(home.getByRole("heading", { name: "Recent" })).toBeVisible();
        expect(
            home.getByRole("link", { name: /First fixture piece/ }),
        ).toHaveAttribute("href", "/blog/first");
        expect(home.getByText("The first piece's line.")).toBeVisible();
        // Three, newest first: the fourth waits for the archive.
        expect(home.queryByText("Fourth fixture piece")).toBeNull();
        expect(home.getByRole("heading", { name: "About" })).toBeVisible();

        const order = [
            "Sample Writer",
            "Recent",
            "First fixture piece",
            "Second fixture piece",
            "Third fixture piece",
            "About",
        ].map((word) => at(container, word));
        expect(order.every((i) => i >= 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("Home with no posts live: the masthead and About, no empty Recent", () => {
        const { container } = renderPage("/", { posts: [], basePath: "/blog" });
        const home = within(container);
        expect(home.queryByText("Recent")).toBeNull();
        expect(home.getByRole("heading", { name: "About" })).toBeVisible();
        expect(container.textContent).not.toMatch(/no posts|coming soon/i);
    });

    it("Archive: every post, dated, titles only", () => {
        const { container } = renderPage("/archive", {
            posts: POSTS,
            basePath: "/blog",
        });
        const archive = within(container);
        expect(
            archive.getByRole("heading", { level: 1, name: "Archive" }),
        ).toBeVisible();
        expect(archive.getAllByRole("listitem")).toHaveLength(POSTS.length);
        expect(
            archive.getByRole("link", { name: /Fourth fixture piece/ }),
        ).toHaveAttribute("href", "/blog/fourth");
        expect(archive.getByText("19 Dec 2025")).toBeVisible();
        expect(archive.queryByText("The first piece's line.")).toBeNull();
        expect(container.querySelectorAll("img")).toHaveLength(0);
    });
});
