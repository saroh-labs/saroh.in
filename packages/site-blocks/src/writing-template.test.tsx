import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { instantiateTemplate, writingTemplate } from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { JournalFeed } from "./blocks/journal";
import SectionRenderer from "./section-renderer";

/**
 * The writing template on a live site with no posts yet (DEC-070, K13).
 *
 * The template adds no sample posts: Home's journal reads the site's own,
 * live. A new writer has none, so the page must not promise any: the journal
 * draws nothing, and nothing else on Home points at posts. The one-post case
 * is the control: it shows the journal is drawn when there is something to
 * show, so an empty run means "left off", not "never rendered".
 */

const ctx: TemplateContext = { organizationName: "Sample Writer" };

/** Draw a page as the live site does: with the feed the server read. */
function renderPage(path: string, journal: JournalFeed) {
    const page = instantiateTemplate(writingTemplate, ctx).pages.find(
        (p) => p.path === path,
    );
    if (!page) throw new Error(`No page at ${path}`);
    const resolvePage = () => undefined;
    return render(
        <>
            {page.sections.map((section) => (
                <SectionRenderer
                    key={section.order}
                    siteId="site-writing"
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

describe("the writing template, rendered live", () => {
    it("with no posts, Home is the name and a way in touch, and claims no posts", () => {
        const { container } = renderPage("/", { posts: [], basePath: "/blog" });
        const home = within(container);
        expect(
            home.getByRole("heading", { name: "Sample Writer" }),
        ).toBeVisible();
        expect(home.getByText("Writing by Sample Writer.")).toBeVisible();
        expect(
            home.getByRole("link", { name: "Get in touch" }),
        ).toHaveAttribute("href", "/contact");
        expect(home.queryByText("Latest writing")).toBeNull();
        expect(container.textContent).not.toMatch(
            /no posts|latest|coming soon/i,
        );
        expect(container.querySelectorAll("img")).toHaveLength(0);
    });

    it("the control: with a post live, the journal lists it", () => {
        const { container } = renderPage("/", {
            posts: [
                {
                    title: "A first note",
                    slug: "a-first-note",
                    excerpt: "Placeholder excerpt.",
                    publishedAt: "2026-09-01T00:00:00.000Z",
                },
            ],
            basePath: "/blog",
        });
        const home = within(container);
        expect(
            home.getByRole("heading", { name: "Latest writing" }),
        ).toBeVisible();
        expect(
            home.getByRole("link", { name: /A first note/ }),
        ).toHaveAttribute("href", "/blog/a-first-note");
    });

    it("About says whose words go there, as a placeholder", () => {
        const { container } = renderPage("/about", {
            posts: [],
            basePath: "/blog",
        });
        const about = within(container);
        expect(
            about.getByRole("heading", { name: "About Sample Writer" }),
        ).toBeVisible();
        expect(about.getByText(/This is a placeholder/)).toBeVisible();
    });
});
