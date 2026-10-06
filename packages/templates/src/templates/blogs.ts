import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `blogs` — the Journal shape's industry template (industry templates plan,
 * U8; design `templates/Blogs`). Image-free by design: type is the whole
 * look, one family (Newsreader) and one accent.
 *
 * - **Home**: the writer's name and what the writing is about, small, as a
 *   masthead; then "Recent", the site's latest published posts as a list of
 *   titles and their lines, read live (G10); then a few words about the
 *   writer, which are theirs to replace.
 * - **Archive**: every published post, dated, as a bibliographic list (the
 *   Journal's `archive` look), read live too.
 *
 * Every post comes from the business: the template adds none, and with none
 * live both journals draw nothing on the site. Nothing here claims what the
 * site doesn't do: no reading time and no feed, since neither is served.
 *
 * Differs from `writing` (DEC-070, K13): no hero or button over the posts,
 * the About words sit on Home as the design has them, the posts are a list
 * rather than cards, and the whole archive has its own page. It makes no
 * Contact form; a contact email, when there is one, is a line in About.
 */

export const BLOGS_TEMPLATE_ID = "blogs";

/** What the writer has said about themselves, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

export const blogsTemplate: TemplateManifest = {
    id: BLOGS_TEMPLATE_ID,
    version: 1,
    name: "Blogs",
    description:
        "A journal for your writing (Home, Archive): your latest pieces on the front page, every one of them by date in the archive, and a few words about you.",
    slug: "blogs",
    kinds: ["creator", "coach"],
    shape: "journal",
    sample: { name: "Meera Shah", host: "meera.saroh.app" },
    uses: ["WEBSITE"],
    styles: [
        {
            id: "red",
            name: "Red",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "ink",
                    accent: "clay",
                    heroBackground: "bone",
                    footer: "chalk",
                },
                scalars: { cornerRadius: 0, pageMargin: 40 },
                fontPair: "newsreader",
            },
        },
        {
            id: "indigo",
            name: "Indigo",
            style: {
                colours: {
                    pageGround: "mist",
                    text: "ink",
                    accent: "steel",
                    heroBackground: "paper",
                    footer: "chalk",
                },
                scalars: { cornerRadius: 0, pageMargin: 40 },
                fontPair: "newsreader",
            },
        },
    ],
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const own = ownWords(ctx);
                        return {
                            variant: "none",
                            heading: ctx.organizationName,
                            ...(own ? { subheading: own } : {}),
                        };
                    },
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        title: "Recent",
                        count: 3,
                        layout: "list",
                        showExcerpts: true,
                        showImages: false,
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        value:
                            `<h2>About</h2>` +
                            `<p>This is a placeholder for a few words about ` +
                            `${escapeHtml(ctx.organizationName)}: who writes ` +
                            `here, what about, and how often. Replace it with ` +
                            `your own.</p>` +
                            (ctx.contactEmail
                                ? `<p>To write back: <a href="mailto:${escapeHtml(ctx.contactEmail)}">` +
                                  `${escapeHtml(ctx.contactEmail)}</a>.</p>`
                                : ""),
                    }),
                },
            ],
        },
        {
            path: "/archive",
            title: "Archive",
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "none",
                        heading: "Archive",
                        subheading: `Everything published by ${ctx.organizationName}, newest first.`,
                    }),
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "archive",
                        title: "By date",
                        showExcerpts: false,
                        showImages: false,
                    },
                },
            ],
        },
    ],
};
