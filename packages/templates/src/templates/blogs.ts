import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `blogs` — the Journal shape's industry template (industry templates plan,
 * U8; design `templates/Blogs`). Image-free by design: type is the whole
 * look, one family (Newsreader), and the one red (or indigo) used exactly
 * once, on the lead piece's date.
 *
 * One page, in the design's order:
 *
 * - **The page's name** for screen readers only (hero `none`, title hidden):
 *   the header already shows the writer's name, so the page does not open on
 *   it twice. Their own line, when they have one, sits under the header.
 * - **The lead piece**: the newest post opened on the page, its opening
 *   paragraphs and a reading time worked out from its length, then
 *   "Continue reading" (the Journal's `lead` look).
 * - **Recent**: the next few posts, titles and their lines (`afterLead`, so
 *   the lead is not shown twice).
 * - **Archive**: every other post, under its year, with the total counted
 *   from every post the site has live ("{n} pieces in all").
 * - **About**: a few words about the writer, which are theirs to replace.
 *
 * Archive and About lead the header menu as in-page links, as the design's
 * header reads. Every post comes from the business: the template adds none,
 * and with none live the journals draw nothing on the site. Nothing here
 * claims what the site doesn't do: the reading time is counted, never
 * typed, and there is no "Subscribe" or "Feed available", since no feed is
 * served.
 *
 * Differs from `writing` (DEC-070, K13): no hero or button over the posts,
 * the newest post opens in depth rather than as a card, the archive is
 * bibliographic, and About sits on the same page. It makes no Contact form;
 * a contact email, when there is one, is a line in About.
 */

export const BLOGS_TEMPLATE_ID = "blogs";

/** What the writer has said about themselves, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/**
 * The design's type: a 44px lead title, 18.5px body set long, section
 * labels as small wide capitals, on a 980px page.
 */
const TYPE = {
    displaySize: 44,
    bodySize: 18.5,
    measure: 76,
    contentWidth: 980,
    labelStyle: "eyebrow",
} as const;

const SCALARS = { cornerRadius: 0, pageMargin: 40 } as const;

export const blogsTemplate: TemplateManifest = {
    id: BLOGS_TEMPLATE_ID,
    version: 1,
    name: "Blogs",
    description:
        "A journal for your writing on one page: your newest piece opened on the page, the next few under it, every one of them by year in the archive, and a few words about you.",
    slug: "blogs",
    kinds: ["creator", "coach"],
    shape: "journal",
    sample: { name: "Meera Shah", host: "meera.saroh.app" },
    uses: ["WEBSITE"],
    styles: [
        {
            // Warm white and one red, as the design draws them (DEC-090).
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
                scalars: SCALARS,
                fontPair: "newsreader",
                palette: {
                    bg: "#FCFBF8",
                    surface: "#F2EDE3",
                    fg: "#1A1714",
                    body: "#3B352E",
                    muted: "#635C54",
                    border: "#EDE7DB",
                    accent: "#9C2A18",
                    accentFg: "#FFFFFF",
                },
                type: TYPE,
            },
        },
        {
            // Bone and one indigo: the same page recoloured in OKLCH with
            // lightness held, so every ratio survives.
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
                scalars: SCALARS,
                fontPair: "newsreader",
                palette: {
                    bg: "#FAFBFC",
                    surface: "#EAEEF1",
                    fg: "#161819",
                    body: "#343639",
                    muted: "#5A5E61",
                    border: "#E4E8EE",
                    accent: "#454BAC",
                    accentFg: "#FFFFFF",
                },
                type: TYPE,
            },
        },
    ],
    // The design's footer line, as words for the owner to write over.
    footer: {
        line: "Your city · how often you write, and since when",
        layout: "left",
    },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    // The name is in the header: the h1 is for screen
                    // readers, and the owner's line, when there is one, shows.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const own = ownWords(ctx);
                        return {
                            variant: "none",
                            heading: ctx.organizationName,
                            titleVisible: false,
                            ...(own ? { subheading: own } : {}),
                        };
                    },
                },
                {
                    // The newest piece, opened on the page.
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "lead",
                        anchor: "lead",
                        showImages: false,
                    },
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        title: "Recent",
                        count: 3,
                        layout: "list",
                        afterLead: true,
                        showExcerpts: true,
                        showImages: false,
                    },
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "archive",
                        title: "Archive",
                        anchor: "archive",
                        navLabel: "Archive",
                        afterLead: true,
                        groupByYear: true,
                        showTotal: true,
                        showExcerpts: false,
                        showImages: false,
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "left",
                        anchor: "about",
                        navLabel: "About",
                        format: "html",
                        value:
                            `<h2>About</h2>` +
                            `<p>This is a placeholder for a few words about ` +
                            `${escapeHtml(ctx.organizationName)}: who writes ` +
                            `here, and what about.</p>` +
                            `<p>Say how often something goes up, and why it ` +
                            `is worth coming back for. Replace both with your ` +
                            `own.</p>` +
                            (ctx.contactEmail
                                ? `<p>To write back: <a href="mailto:${escapeHtml(ctx.contactEmail)}">` +
                                  `${escapeHtml(ctx.contactEmail)}</a>.</p>`
                                : ""),
                    }),
                },
            ],
        },
    ],
};
