import type { RenderedJournal } from "@saroh/block-contract";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageSections } from "../section-renderer";
import type { JournalPost } from "./journal";
import JournalSection, {
    postExcerpt,
    postEyebrow,
    withoutScriptsAndStyles,
    withoutTags,
} from "./journal";

/** Four live posts, newest first, as the public read returns them. */
const POSTS: JournalPost[] = [
    {
        title: "Diwali hampers are back",
        slug: "diwali-hampers",
        excerpt: "Order by the 20th.",
        image: "https://cdn.test/hamper.jpg",
        author: "Asha",
        publishedAt: "2026-09-20T09:00:00.000Z",
    },
    {
        title: "Why our sourdough takes two days",
        slug: "two-day-sourdough",
        excerpt: "A slow, cold rise.",
        image: "https://cdn.test/loaf.jpg",
        author: "Asha",
        publishedAt: "2026-09-12T09:00:00.000Z",
    },
    {
        title: "The new rye starter",
        slug: "rye-starter",
        excerpt: null,
        content: "<p>Six weeks of feeding &amp; it&#39;s ready.</p>",
        image: null,
        author: null,
        publishedAt: "2026-09-04T09:00:00.000Z",
    },
    {
        title: "Monsoon hours",
        slug: "monsoon-hours",
        excerpt: "We open at 8.",
        image: null,
        author: "Asha",
        publishedAt: "2026-07-01T09:00:00.000Z",
    },
];

const content: RenderedJournal = { title: "Journal" };

function titles(): string[] {
    return screen
        .queryAllByRole("link")
        .filter((a) => a.getAttribute("href")?.startsWith("/blog/"))
        .map((a) => a.querySelector(".font-site-heading")?.textContent ?? "");
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/** The public read's rows: each post's snapshot with the path it went out at. */
function publicRows(posts: JournalPost[], prefix = "blog") {
    return {
        posts: posts.map((post) => ({
            post,
            path: `/${prefix}/${post.slug}`,
            publishedAt: post.publishedAt,
        })),
    };
}

describe("journal on the live site (G10)", () => {
    it("shows the newest three of four, in order, linking under the posts prefix", () => {
        render(
            <JournalSection
                content={content}
                feed={{ posts: POSTS, basePath: "/blog" }}
            />,
        );
        expect(titles()).toEqual([
            "Diwali hampers are back",
            "Why our sourdough takes two days",
            "The new rye starter",
        ]);
        const hrefs = screen
            .getAllByRole("link")
            .map((a) => a.getAttribute("href"));
        expect(hrefs).toEqual([
            "/blog",
            "/blog/diwali-hampers",
            "/blog/two-day-sourdough",
            "/blog/rye-starter",
        ]);
        expect(screen.getByRole("link", { name: /All posts/ })).toBeTruthy();
    });

    it("shows six when asked, and never more than there are", () => {
        render(
            <JournalSection
                content={{ ...content, count: 6 }}
                feed={{ posts: POSTS, basePath: "/blog" }}
            />,
        );
        expect(titles()).toHaveLength(4);
    });

    it("follows a prefix the merchant chose", () => {
        render(
            <JournalSection
                content={content}
                feed={{ posts: POSTS.slice(0, 1), basePath: "/news/" }}
            />,
        );
        expect(
            screen.getByRole("link", { name: /Diwali/ }).getAttribute("href"),
        ).toBe("/news/diwali-hampers");
        expect(
            screen
                .getByRole("link", { name: /All posts/ })
                .getAttribute("href"),
        ).toBe("/news");
    });

    it("renders nothing at all when no post is live", () => {
        const { container } = render(
            <JournalSection
                content={content}
                feed={{ posts: [], basePath: "/blog" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("leaves photos and excerpts out when switched off", () => {
        const { container } = render(
            <JournalSection
                content={{ ...content, showImages: false, showExcerpts: false }}
                feed={{ posts: POSTS, basePath: "/blog" }}
            />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(screen.queryByText("Order by the 20th.")).toBeNull();
    });

    it("draws a photo only where a post has one", () => {
        const { container } = render(
            <JournalSection
                content={content}
                feed={{ posts: POSTS, basePath: "/blog" }}
            />,
        );
        expect(
            Array.from(container.querySelectorAll("img")).map((i) =>
                i.getAttribute("src"),
            ),
        ).toEqual(["https://cdn.test/hamper.jpg", "https://cdn.test/loaf.jpg"]);
    });

    it("says the section's own title, or Journal when it has none", () => {
        render(
            <JournalSection
                content={{ title: "  " }}
                feed={{ posts: POSTS, basePath: "/blog" }}
            />,
        );
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
            "Journal",
        );
    });

    it("never fetches when the page handed it the posts", () => {
        const fetchMock = vi.fn();
        const realFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;
        try {
            render(
                <PageSections
                    sections={[{ type: "journal", content }]}
                    siteId="site_rye"
                    journal={{ posts: POSTS, basePath: "/blog" }}
                />,
            );
            expect(fetchMock).not.toHaveBeenCalled();
            expect(titles()).toHaveLength(3);
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it("draws nothing on a live page that could not tell which site it is", () => {
        const { container } = render(
            <JournalSection content={content} siteId={null} />,
        );
        expect(container.innerHTML).toBe("");
    });
});

describe("journal behind a preview token (G10)", () => {
    it("shows the draft's posts, and says which have not gone out", () => {
        render(
            <JournalSection
                content={content}
                feed={{
                    posts: [
                        {
                            title: "Coming soon: croissants",
                            slug: "croissants",
                            author: "Asha",
                            publishedAt: null,
                            live: false,
                        },
                        { ...POSTS[0], live: true },
                    ],
                    basePath: "/preview/tok/blog",
                }}
            />,
        );
        expect(
            screen
                .getByRole("link", { name: /croissants/ })
                .getAttribute("href"),
        ).toBe("/preview/tok/blog/croissants");
        expect(screen.getByText("Asha · Not published")).toBeTruthy();
        expect(screen.getByText("Asha · 20 Sep 2026")).toBeTruthy();
    });
});

describe("journal on the editor canvas (G10)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function renderReading(response: Response | Error) {
        const fetchMock = vi.fn((_url: string) =>
            response instanceof Error
                ? Promise.reject(response)
                : Promise.resolve(response),
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const view = render(
            <JournalSection
                content={content}
                siteId="site_rye"
                apiUrl="https://api.test"
            />,
        );
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        return { ...view, fetchMock };
    }

    it("reads the site's live posts itself, and links where they went out", async () => {
        const { fetchMock } = await renderReading(
            json(publicRows(POSTS, "journal")),
        );
        expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
            "https://api.test/public/sites/site_rye/posts",
        );
        expect(
            screen.getByRole("link", { name: /Diwali/ }).getAttribute("href"),
        ).toBe("/journal/diwali-hampers");
        expect(
            screen
                .getByRole("link", { name: /All posts/ })
                .getAttribute("href"),
        ).toBe("/journal");
    });

    it('says "No posts yet" rather than vanishing', async () => {
        await renderReading(json({ posts: [] }));
        expect(screen.getByRole("status").textContent).toContain(
            "No posts yet",
        );
        expect(screen.getByRole("heading", { name: "Journal" })).toBeTruthy();
    });

    it("drops a row without a post or a slug instead of drawing a broken link", async () => {
        await renderReading(
            json({
                posts: [
                    null,
                    { post: { title: "No slug", slug: "" }, path: "/blog/" },
                    { path: "/blog/x" },
                    ...publicRows(POSTS.slice(0, 1)).posts,
                ],
            }),
        );
        expect(titles()).toEqual(["Diwali hampers are back"]);
    });

    it("says it couldn't load, and tries again", async () => {
        await renderReading(json({ message: "down" }, 503));
        expect(screen.getByRole("alert").textContent).toContain(
            "couldn't load your posts",
        );
        globalThis.fetch = vi.fn(() =>
            Promise.resolve(json(publicRows(POSTS))),
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Try again" }));
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(titles()).toHaveLength(3);
    });

    it("treats a wrong shape as an error, not a crash (#264)", async () => {
        await renderReading(json({ posts: "nope" }));
        expect(screen.getByRole("alert")).toBeTruthy();
    });

    it("treats a network failure as an error", async () => {
        await renderReading(new Error("offline"));
        expect(screen.getByRole("alert")).toBeTruthy();
    });

    it("where there is no site at all, says what will show and fetches nothing", () => {
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        render(<JournalSection content={content} />);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByText(/latest posts show here/)).toBeTruthy();
    });
});

describe("the words on a card", () => {
    it("uses the excerpt when there is one", () => {
        expect(postExcerpt(POSTS[0])).toBe("Order by the 20th.");
    });

    it("falls back to the body as plain text", () => {
        expect(postExcerpt(POSTS[2])).toBe(
            "Six weeks of feeding & it's ready.",
        );
    });

    it("cuts a long body at a word, never mid-word", () => {
        const long = `<p>${"Flour water salt ".repeat(20)}</p>`;
        const cut = postExcerpt({ ...POSTS[2], content: long });
        expect(cut?.endsWith("…")).toBe(true);
        expect(cut?.length ?? 0).toBeLessThanOrEqual(161);
        expect(cut).toMatch(/(Flour|water|salt)…$/);
    });

    it("says nothing when the body is empty", () => {
        expect(postExcerpt({ ...POSTS[2], content: "<p> </p>" })).toBeNull();
    });

    it("leaves out a script's text", () => {
        expect(
            postExcerpt({
                ...POSTS[2],
                content: "<script>alert(1)</script><p>Hello</p>",
            }),
        ).toBe("Hello");
    });

    it("names the author and the day, or just the day", () => {
        expect(postEyebrow(POSTS[0])).toBe("Asha · 20 Sep 2026");
        expect(postEyebrow(POSTS[2])).toBe("4 Sep 2026");
    });
});

describe("withoutScriptsAndStyles", () => {
    it("cuts scripts and styles, in any case, and keeps the rest", () => {
        expect(
            withoutScriptsAndStyles(
                "<p>Hi</p><SCRIPT>x()</SCRIPT><style>p{}</style><p>there</p>",
            ),
        ).toBe("<p>Hi</p>  <p>there</p>");
    });

    it("runs an unclosed one to the end", () => {
        expect(withoutScriptsAndStyles("Hi<style>p{}")).toBe("Hi ");
    });

    it("stays fast on many unclosed <style", () => {
        const input = "<style".repeat(50_000);
        const started = Date.now();
        withoutScriptsAndStyles(input);
        expect(Date.now() - started).toBeLessThan(200);
    });
});

describe("withoutTags", () => {
    it("replaces each tag with a space and keeps a stray <", () => {
        expect(withoutTags("<p>Hi <b>there</b></p>")).toBe(" Hi  there  ");
        expect(withoutTags("1 < 2")).toBe("1 < 2");
    });

    it("stays fast on many < with no >", () => {
        const input = "<".repeat(100_000);
        const started = Date.now();
        expect(withoutTags(input)).toBe(input);
        expect(Date.now() - started).toBeLessThan(200);
    });
});
