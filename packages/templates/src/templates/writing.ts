import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `writing` — a site for someone who writes: a blog, essays, notes
 * (DEC-070, K13). Three pages:
 *
 * - **Home**: the name and what the writing is about, then the journal: the
 *   site's latest published posts, read live (G10). The template adds no
 *   sample posts. With none live the journal draws nothing on the site and
 *   the editor's canvas says why, so nothing on Home promises posts that
 *   aren't there: the hero never says "read the latest below".
 * - **About**: a few words in the writer's own voice. Until they write them,
 *   the text says plainly that it is theirs to replace.
 * - **Contact**: an enquiry form (name, email, message). The API makes its
 *   Form with the site (`site-create.ts`), so it takes enquiries from the
 *   first publish.
 *
 * No images: a photo is the writer's to add, and a path to one the apps don't
 * serve is a broken image (what `starter@1` shipped). Every link it makes
 * goes somewhere: an email, or the Contact page it makes itself.
 *
 * Registered (K15), and no kind's default: a writer picks it in `/sites/new`.
 */

export const WRITING_TEMPLATE_ID = "writing";

/** What the Contact page's form asks: who, how to reply, and what. */
const CONTACT_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "message", label: "Message", type: "textarea", required: true },
] as const;

/** What the writer has said about themselves, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/** Where "get in touch" goes: their email when there is one, else Contact. */
function reachOut(ctx: TemplateContext): string {
    return ctx.contactEmail ? `mailto:${ctx.contactEmail}` : "/contact";
}

export const writingTemplate: TemplateManifest = {
    id: WRITING_TEMPLATE_ID,
    version: 1,
    name: "Writing",
    description:
        "A site for your writing (Home, About, Contact): your latest posts on the front page, a few words about you, and a way to write back.",
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
                            `Writing by ${ctx.organizationName}.`,
                        cta: {
                            label: "Get in touch",
                            href: reachOut(ctx),
                            style: "primary",
                        },
                    }),
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        title: "Latest writing",
                        count: 6,
                        layout: "list",
                        showExcerpts: true,
                        showImages: false,
                    },
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
                                `<h2>Who writes here</h2>` +
                                (own ? `<p>${escapeHtml(own)}</p>` : "") +
                                `<p>This is a placeholder for a few words about ` +
                                `${escapeHtml(ctx.organizationName)}: who is ` +
                                `writing, what about, and why. Replace it with ` +
                                `your own.</p>`,
                        };
                    },
                },
            ],
        },
        {
            path: "/contact",
            title: "Contact",
            sections: [
                {
                    type: "enquiry",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        title: `Write to ${ctx.organizationName}`,
                        description:
                            "A question, a thought on something you read, or just hello.",
                        submitLabel: "Send",
                        successMessage: "Thanks, your message has been sent.",
                        fields: CONTACT_FIELDS.map((f) => ({ ...f })),
                    }),
                },
            ],
        },
    ],
};
