import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `studio` — a portfolio for a small design studio (industry templates plan,
 * U10; the gallery's "Portfolio" shape). Designed as "Studio Neue". One page,
 * and no hero: the first project IS the top of the page, and the studio does
 * not introduce itself until the second section.
 *
 * - **The page's name**, small (hero `none`): the page keeps its one `h1`
 *   for a screen reader and a search engine, and goes straight on.
 * - **Work**: five projects, the design's lead, pair and offset, in its
 *   order. They are placeholders and say so, each carrying the design's
 *   photograph as a brief (KTD-5): the design's clients (a coffee brand, a
 *   van fleet, a café group) would be invented clients on someone's live
 *   site, so none of their names is shipped.
 * - **Studio**: who the studio is, how much it takes on and what it is good
 *   at, then three facts, all written over by the owner.
 * - **Contact**: the design's invitation to describe the problem badly, as
 *   an enquiry form, and the email beside it when the business has one.
 *
 * Left out, on purpose: the design's "Worked with" list. Saroh holds no
 * client list, the design draws the section only when there are clients, and
 * a placeholder list would put made-up names (or the words "Client name") on
 * a live site. An owner who wants one adds a Features or text section.
 *
 * No accent colour in the design, and no prices anywhere: nothing here is
 * for sale. Copy names the owner, never "we", so one person or a studio of
 * five reads it the same.
 */

export const STUDIO_TEMPLATE_ID = "studio";

/** The design's photographs, one per project, in its order (KTD-5). */
export const STUDIO_PROJECT_BRIEFS = [
    "The full range shot together on a concrete surface, top light, no props",
    "One page of the site on a laptop, photographed at an angle in the studio",
    "The van livery in situ outside the warehouse, morning light",
    "A menu held open, hands in frame (portrait)",
    "Stamped foot rings and printed labels arranged flat",
] as const;

/**
 * The projects: the design's lead, its pair and its offset. Each title reads
 * as a placeholder, and each line says what to write there, never work done.
 */
const SAMPLE_PROJECTS = [
    {
        title: "Your lead project",
        summary:
            "A placeholder. The project the page opens on: name the client, what you made for them and the year, then add the photograph.",
    },
    {
        title: "Your second project",
        summary:
            "A placeholder. Pick something that shows a different kind of work, such as a website beside an identity.",
    },
    {
        title: "Your third project",
        summary:
            "A placeholder. Work that had to survive the real world (a van, a shopfront, a label) earns its place here.",
    },
    {
        title: "Your fourth project",
        summary:
            "A placeholder. A tall photograph suits this one: something held, worn or hung.",
    },
    {
        title: "Your fifth project",
        summary:
            "A placeholder. Add a link if the work lives somewhere else, or remove this one.",
    },
] as const;

function sampleProjects() {
    return SAMPLE_PROJECTS.map((p, i) => ({
        ...p,
        imageBrief: STUDIO_PROJECT_BRIEFS[i],
    }));
}

/** What the enquiry asks: who, how to reply, and the problem, messy. */
const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    {
        name: "message",
        label: "What needs drawing?",
        type: "textarea",
        required: true,
    },
] as const;

/** What the owner has said about the work, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/**
 * Whether the business has an email to show beside the form. Read
 * defensively: the contact block refuses anything that is not an address,
 * and one bad profile field must not stop the site being made.
 */
export function studioHasEmail(ctx: TemplateContext): boolean {
    const { contactEmail } = ctx as { contactEmail?: unknown };
    return (
        typeof contactEmail === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())
    );
}

/** Near-white and near-black: spacing shared by both colourways. */
const SCALARS = {
    pageMargin: 28,
    sectionPadding: 64,
    gridGap: 6,
    cornerRadius: 0,
    headingScale: 1,
} as const;

export const studioTemplate: TemplateManifest = {
    id: STUDIO_TEMPLATE_ID,
    version: 1,
    name: "Studio",
    description:
        "A portfolio for a small studio: the work first, the biggest project at the top of the page, then who the studio is and how to brief it.",
    slug: "studio",
    kinds: ["creator"],
    shape: "portfolio",
    sample: { name: "Studio Neue", host: "studioneue.saroh.app" },
    // Projects and the form are the Website's; an enquiry arrives in CRM.
    uses: ["WEBSITE", "CRM"],
    styles: [
        {
            // Near-white, near-black; hierarchy by scale, crop and space.
            id: "mono",
            name: "Mono",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "ink",
                    accent: "steel",
                    heroBackground: "bone",
                    ctaBand: "graphite",
                    footer: "chalk",
                },
                scalars: SCALARS,
                fontPair: "archivo",
            },
        },
        {
            // The same page in ivory and walnut.
            id: "ivory",
            name: "Ivory",
            style: {
                colours: {
                    pageGround: "sand",
                    text: "ink",
                    accent: "steel",
                    heroBackground: "bone",
                    ctaBand: "graphite",
                    footer: "chalk",
                },
                scalars: SCALARS,
                fontPair: "archivo",
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
                    // No hero: the page's heading, small, and straight on.
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
                    // The owner's own work, typed in by them (a static block).
                    type: "projects",
                    contractVersion: 1,
                    content: () => ({
                        variant: "cards",
                        title: "Work",
                        items: sampleProjects(),
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        value:
                            `<h2>Studio</h2>` +
                            `<p>This is a placeholder for who ` +
                            `${escapeHtml(ctx.organizationName)} is: how many ` +
                            `people, where, and what the work is, from identity ` +
                            `to the things identity has to survive.</p>` +
                            `<p>Say how much work is taken on in a year and who ` +
                            `does it, so a client knows whether the person they ` +
                            `brief is the person who draws it.</p>` +
                            `<p>Say what the studio is better at, and what it ` +
                            `will say early if a project needs something else. ` +
                            `Replace all three paragraphs with your own.</p>` +
                            `<ul>` +
                            `<li><strong>Studio:</strong> where you work</li>` +
                            `<li><strong>Who:</strong> your names</li>` +
                            `<li><strong>Since:</strong> the year you started</li>` +
                            `</ul>`,
                    }),
                },
                {
                    type: "enquiry",
                    contractVersion: 1,
                    content: {
                        title: "If you have something that needs drawing, describe it badly.",
                        description:
                            "A paragraph is plenty. The useful questions come after, and the messy version of the problem is more use than a tidy brief that has already decided the answer.",
                        submitLabel: "Send",
                        successMessage: "Thanks, your message has been sent.",
                        fields: ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    },
                },
                {
                    // The email beside the form, only when there is one: a
                    // contact block cannot stand on a made-up address.
                    type: "contact",
                    contractVersion: 1,
                    when: studioHasEmail,
                    content: (ctx: TemplateContext) => ({
                        email: ctx.contactEmail?.trim(),
                    }),
                },
            ],
        },
    ],
};
