import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `studio` — a portfolio for a small design studio (industry templates plan,
 * U10; the gallery's "Portfolio" shape). Designed as "Studio Neue". One page,
 * and no hero: the first project IS the top of the page, and the studio does
 * not introduce itself until the second section.
 *
 * - **The page's name** for screen readers only (hero `none`, title
 *   hidden): the header shows it, and the page goes straight to the work.
 * - **Work**: five projects in the Projects block's `rhythm` look — a wide
 *   lead, an equal pair, then a portrait beside a landscape — with each
 *   name and line on a bounded band over its photograph. They are
 *   placeholders and say so, each carrying the design's photograph as a
 *   brief (KTD-5): the design's clients (a coffee brand, a van fleet, a
 *   café group) would be invented clients on someone's live site, so none
 *   of their names is shipped.
 * - **Studio**: who the studio is, how much it takes on and what it is good
 *   at, then three facts as a definition list, all written over by the
 *   owner.
 * - **Contact**: the design's invitation to describe the problem badly, as
 *   an enquiry form, and the email beside it when the business has one.
 *
 * Work, Studio and Contact lead the header menu as in-page links. The page
 * is a 1320px frame with 3px between photographs.
 *
 * Left out, on purpose: the design's "Worked with" list. Saroh holds no
 * client list, the design draws the section only when there are clients, and
 * a placeholder list would put made-up names (or the words "Client name") on
 * a live site. An owner who wants one adds a Features or text section.
 *
 * No accent colour in the design — the accent IS the ink, so links, focus
 * and buttons are near-black — and no prices anywhere: nothing here is for
 * sale. Copy names the owner, never "we", so one person or a studio of
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
        caption: "What you made · the year",
        summary:
            "A placeholder. The project the page opens on: name the client, what you made for them and the year, then add the photograph.",
    },
    {
        title: "Your second project",
        caption: "What you made · the year",
        summary:
            "A placeholder. Pick something that shows a different kind of work, such as a website beside an identity.",
    },
    {
        title: "Your third project",
        caption: "What you made · the year",
        summary:
            "A placeholder. Work that had to survive the real world (a van, a shopfront, a label) earns its place here.",
    },
    {
        title: "Your fourth project",
        caption: "What you made · the year",
        summary:
            "A placeholder. A tall photograph suits this one: something held, worn or hung.",
    },
    {
        title: "Your fifth project",
        caption: "What you made · the year",
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

/**
 * Whether the business has an email to show beside the form. Read
 * defensively: the contact block refuses anything that is not an address,
 * and one bad profile field must not stop the site being made.
 */
export function studioHasEmail(ctx: TemplateContext): boolean {
    const { contactEmail } = ctx as { contactEmail?: unknown };
    if (typeof contactEmail !== "string") return false;
    const email = contactEmail.trim();
    // Labels can't contain dots, so the pattern has one way to match and
    // runs in linear time (the old one backtracked on "a@a.a.a.a…").
    return (
        email.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)
    );
}

/** Near-white and near-black: spacing shared by both colourways. */
const SCALARS = {
    pageMargin: 28,
    sectionPadding: 64,
    gridGap: 3,
    cornerRadius: 0,
    headingScale: 1,
} as const;

/** A 1320px frame, 17px body, section labels as small capitals. */
const TYPE = {
    bodySize: 17,
    measure: 70,
    contentWidth: 1320,
    labelStyle: "eyebrow",
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
            // No accent colour: the accent is the ink.
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
                palette: {
                    bg: "#F7F7F6",
                    surface: "#E8E8E6",
                    fg: "#131313",
                    body: "#2A2A29",
                    muted: "#575756",
                    border: "#E2E2E0",
                    accent: "#131313",
                    accentFg: "#F7F7F6",
                },
                type: TYPE,
            },
        },
        {
            // The same page in ivory and walnut, lightness held.
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
                palette: {
                    bg: "#FDF6EE",
                    surface: "#EEE6DF",
                    fg: "#17120D",
                    body: "#302921",
                    muted: "#5D564E",
                    border: "#E8DFD6",
                    accent: "#17120D",
                    accentFg: "#FDF6EE",
                },
                type: TYPE,
            },
        },
    ],
    // The design's footer line, as words for the owner to write over.
    footer: {
        line: "Your studio's street and city",
        layout: "left",
    },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    // No hero: the name is in the header, the h1 is for
                    // screen readers, and the first project is the top.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "none",
                        heading: ctx.organizationName,
                        titleVisible: false,
                    }),
                },
                {
                    // The owner's own work, typed in by them (a static block).
                    type: "projects",
                    contractVersion: 1,
                    content: () => ({
                        variant: "rhythm",
                        // A small label, so the projects' h3s sit under an
                        // h2 rather than straight under the hidden h1.
                        title: "Work",
                        anchor: "work",
                        navLabel: "Work",
                        captionPlacement: "over",
                        items: sampleProjects(),
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "left",
                        anchor: "studio",
                        navLabel: "Studio",
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
                            `<dl>` +
                            `<dt>Studio</dt><dd>Where you work</dd>` +
                            `<dt>Who</dt><dd>Your names</dd>` +
                            `<dt>Since</dt><dd>The year you started</dd>` +
                            `</dl>`,
                    }),
                },
                {
                    type: "enquiry",
                    contractVersion: 1,
                    content: {
                        anchor: "contact",
                        navLabel: "Contact",
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

/**
 * The design's words for the gallery's render of this template (KTD-6), in
 * place of the placeholders a live site starts with: the five projects
 * (name and meta; their photo briefs stay {@link STUDIO_PROJECT_BRIEFS}),
 * the studio's paragraphs and facts, the studio's address beside the email,
 * and the footer's line. Never laid down on a merchant's site — only the
 * gallery render applies it.
 */
export const STUDIO_GALLERY_SAMPLE = {
    footer: "Bandra West, Mumbai",
    projects: [
        { title: "Kadak Coffee", caption: "Identity, packaging · 2026" },
        { title: "Meridian", caption: "Brand, website · 2025" },
        { title: "Northwind Supply", caption: "Identity, livery · 2025" },
        { title: "Halcyon", caption: "Menus, signage · 2024" },
        { title: "Kiln Ceramics", caption: "Identity, print · 2024" },
    ],
    studio: {
        paragraphs: [
            "We are a two-person studio in Mumbai. We do identity and the things identity has to survive — packaging, signage, a website, the form somebody fills in at the counter.",
            "We take on six or seven projects a year and both of us work on all of them. There is no account manager, which means the person you brief is the person who draws it.",
            "We are better on things that get printed, painted or stuck to a vehicle than on campaigns, and we will say so early if a project needs the other thing.",
        ],
        /** The facts' values, in the template's order (its labels stay). */
        facts: ["Bandra, Mumbai", "Anaya Pillai and Rohan Desai", "2019"],
    },
    address: "St Leo Road, Bandra West, Mumbai",
} as const;
