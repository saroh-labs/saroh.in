import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `portfolio` — a site for someone showing their work (DEC-070, K12). Three
 * pages:
 *
 * - **Home**: the name and what the work is, a few projects (the Projects
 *   block, K11), and an enquiry form to start a conversation.
 * - **Work**: every project, one per row.
 * - **About**: a few words in the owner's own voice, and a way to get in
 *   touch.
 *
 * The projects are placeholders, and say so: the Projects block starts from
 * nothing real, and a template that invented clients or results would put a
 * false claim on someone's site. Each sample tells the owner what to write
 * there. They carry no photo and no link: a photo is the owner's to add (the
 * pre-publish check flags one with no description), and a path to one the
 * apps don't serve is a broken image (what `starter@1` shipped).
 *
 * Copy names the owner, never "we" or "our", so a person or a small studio
 * reads it the same. Every link goes somewhere: an email, or a page this
 * template makes itself.
 *
 * The enquiry has no `formId`: its Form is made the first time the site is
 * saved in the editor, as for any enquiry section added there.
 *
 * Registered with the others by K15; until then `getTemplate("portfolio")`
 * doesn't find it.
 */

export const PORTFOLIO_TEMPLATE_ID = "portfolio";

/**
 * The sample projects, laid down on Home and Work. Each title and summary
 * reads as a placeholder the owner writes over, never as work done.
 */
const SAMPLE_PROJECTS = [
    {
        title: "Your first project",
        summary:
            "A placeholder. Say what the work was, who it was for and what came of it, then add a photo.",
    },
    {
        title: "Your second project",
        summary:
            "A placeholder. Pick something that shows a different side of the work.",
    },
    {
        title: "Your third project",
        summary:
            "A placeholder. Add a link if the work lives somewhere else, or remove this one.",
    },
] as const;

function sampleProjects() {
    return SAMPLE_PROJECTS.map((p) => ({ ...p }));
}

/** What the enquiry asks: who, how to reply, and about what. */
const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    {
        name: "message",
        label: "What do you have in mind?",
        type: "textarea",
        required: true,
    },
] as const;

/**
 * Escape text for the rich-text HTML it is woven into: a name like
 * "Ink & Co." is text, not markup. (`starter.ts`, `writing.ts` and
 * `personal.ts` keep their own copy; K15, which touches every template, is
 * the place to share one.)
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** What the owner has said about the work, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/**
 * About's way to get in touch: the email when there is one, else Home, whose
 * last section is the enquiry form.
 */
function reachOut(ctx: TemplateContext): { label: string; href: string } {
    return ctx.contactEmail
        ? { label: "Get in touch", href: `mailto:${ctx.contactEmail}` }
        : { label: "Get in touch", href: "/" };
}

export const portfolioTemplate: TemplateManifest = {
    id: PORTFOLIO_TEMPLATE_ID,
    version: 1,
    name: "Portfolio",
    description:
        "A site to show your work (Home, Work and About): a few projects up front, all of them on their own page, and a way to get in touch.",
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "centered",
                        heading: ctx.organizationName,
                        subheading:
                            ownWords(ctx) ??
                            `Selected work by ${ctx.organizationName}.`,
                        cta: {
                            label: "See the work",
                            href: "/work",
                            style: "primary",
                        },
                    }),
                },
                {
                    type: "projects",
                    contractVersion: 1,
                    content: () => ({
                        variant: "cards",
                        title: "Selected work",
                        items: sampleProjects(),
                    }),
                },
                {
                    type: "enquiry",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        title: `Work with ${ctx.organizationName}`,
                        description:
                            "Say what you have in mind and when you need it.",
                        submitLabel: "Send",
                        successMessage: "Thanks, your message has been sent.",
                        fields: ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    }),
                },
            ],
        },
        {
            path: "/work",
            title: "Work",
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "centered",
                        heading: "Work",
                        subheading: `Projects by ${ctx.organizationName}.`,
                    }),
                },
                {
                    type: "projects",
                    contractVersion: 1,
                    content: () => ({
                        variant: "list",
                        items: sampleProjects(),
                    }),
                },
            ],
        },
        {
            path: "/about",
            title: "About",
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const own = ownWords(ctx);
                        return {
                            variant: "centered",
                            heading: `About ${ctx.organizationName}`,
                            ...(own ? { subheading: own } : {}),
                        };
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const own = ownWords(ctx);
                        return {
                            format: "html",
                            value:
                                `<h2>Behind the work</h2>` +
                                (own ? `<p>${escapeHtml(own)}</p>` : "") +
                                `<p>This is a placeholder for a few words about ` +
                                `${escapeHtml(ctx.organizationName)}: what the ` +
                                `work is, how it gets done and who it's for. ` +
                                `Replace it with your own.</p>`,
                        };
                    },
                },
                {
                    type: "cta",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        ...reachOut(ctx),
                        style: "primary",
                    }),
                },
            ],
        },
    ],
};
