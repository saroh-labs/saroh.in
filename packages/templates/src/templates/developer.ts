import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `developer` — the Portfolio shape for one independent engineer (industry
 * templates plan, U9; design `templates/Developer`). It reads like a good
 * CV: what this person has built, and whether they are free. One page in one
 * 820px column, in the design's order:
 *
 * 1. **Intro** — the owner's name as the page heading (the `none` hero: no
 *    band), their own line under it, then two short paragraphs and three
 *    facts (based, works with, since) as a definition list.
 * 2. **Work** — engagements as hairline rows, not cards (the Projects
 *    block's `rows` look): year | the work and its stack | role, the years
 *    and stack in the mono face, with the count beside the title derived
 *    from the rows.
 * 3. **One in detail** — one case study: a brief for the real interface as
 *    shipped (over the text), the problem, the constraints, the decisions,
 *    what the owner would do differently as small part labels, and what
 *    changed in a box ruled in the accent.
 * 4. **What I charge** — three kinds of rate side by side, each a figure the
 *    owner writes.
 * 5. **Availability** — when the owner can next start, in a box ruled in the
 *    accent, and what they are not looking for.
 * 6. **Contact** — an enquiry form (the API makes its Form with the site).
 *
 * Work, Case study, Rates and Availability lead the header menu as in-page
 * links. Mono (JetBrains Mono, the `geist` pair's mono face) is only for
 * machine facts; the accent is used for the result rule and availability.
 *
 * NOTHING HERE IS A CLAIM. The design's sample is one engineer's real-looking
 * history: clients, results, rates and dates. On a live site those would be
 * invented facts about whoever picked the template, so every engagement, the
 * case study, the rates and the availability ship as placeholders that say
 * what to write and say that they are placeholders. In particular the rates
 * carry no figure: they are the owner's own to set (never Saroh's), and an
 * example figure left in by mistake would be a price the owner never chose.
 *
 * Copy is in the first person, as the design's is ("What I charge"): this
 * template is for one person working alone. No "we" and no "our".
 */

export const DEVELOPER_TEMPLATE_ID = "developer";

/**
 * The engagements, as placeholders. Each title says what goes there; the
 * year, role and stack fill the `rows` look's columns and say what goes in
 * each.
 */
const SAMPLE_WORK = [
    {
        year: "Year",
        title: "Your most recent engagement",
        summary:
            "A placeholder. One sentence on what you built, for whom, and what it replaced.",
        meta: "The stack · one word each",
        role: "Your role",
    },
    {
        year: "Year",
        title: "The one before it",
        summary:
            "A placeholder. Pick work that shows a different side of what you do.",
        meta: "The stack",
        role: "Your role",
    },
    {
        year: "Years",
        title: "A salaried role, if it taught you something",
        summary:
            "A placeholder. Say what you learned there, or remove this one.",
        meta: "The stack",
        role: "Your title there",
    },
] as const;

/** What the enquiry asks: who, how to reply, and about what. */
const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    {
        name: "message",
        label: "What are you building, and when do you need it?",
        type: "textarea",
        required: true,
    },
] as const;

/** What the owner has said about their work, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/** The intro's paragraphs and facts, all the owner's to replace. */
function intro(): string {
    return (
        `<p>A placeholder for your opening: the parts of a product you build, ` +
        `what you build them in, and the size of team you usually work with. ` +
        `Two or three sentences, in your own voice.</p>` +
        `<p>Then how you work: alone or with others, one project at a time or ` +
        `several, and what that means for someone hiring you.</p>` +
        `<dl>` +
        `<dt>Based</dt><dd>Your city and time zone</dd>` +
        `<dt>Works with</dt><dd>Your languages and tools</dd>` +
        `<dt>Since</dt><dd>When you started working independently</dd>` +
        `</dl>`
    );
}

/** The case study: its title, its line, then its parts as labels. */
function caseStudy(): string {
    return (
        `<h2>Your case study — the project you would most like to be hired for again</h2>` +
        `<p><em>Client · year · how long, and your part in it</em></p>` +
        `<p>A placeholder. Pick one piece of work and tell it properly: the ` +
        `parts below are the questions a good client will ask anyway.</p>` +
        `<h3>The problem</h3>` +
        `<p>Say what was going wrong before you arrived, in the client's ` +
        `terms, and what they had already tried.</p>` +
        `<h3>Constraints</h3>` +
        `<p>Say what could not stop, change or be spent while you worked.</p>` +
        `<h3>What I decided</h3>` +
        `<p>Say which two or three choices mattered, and what each one cost.</p>` +
        `<h3>What I would do differently</h3>` +
        `<p>Say one honest thing. It is the part people remember.</p>`
    );
}

/** The design's type: one 820px column, labels as small wide capitals. */
const TYPE = {
    bodySize: 16.5,
    measure: 76,
    contentWidth: 820,
    labelStyle: "eyebrow",
} as const;

const SCALARS = {
    pageMargin: 40,
    cornerRadius: 0,
    headingScale: 0.85,
} as const;

/** Neutral greys both colourways share; only the one colour differs. */
const NEUTRALS = {
    bg: "#FAFAF9",
    surface: "#EFEFEC",
    fg: "#17181A",
    body: "#2B2D31",
    muted: "#55575C",
    border: "#E4E4E0",
    accentFg: "#FFFFFF",
} as const;

export const developerTemplate: TemplateManifest = {
    id: DEVELOPER_TEMPLATE_ID,
    version: 1,
    name: "Developer",
    description:
        "A one-page portfolio for an independent engineer: who you are, your work as a list, one project in depth, your rates and when you're free, and a way to get in touch.",
    slug: "developer",
    kinds: ["creator"],
    shape: "portfolio",
    sample: { name: "Kiran Menon", host: "kiran.dev" },
    uses: ["WEBSITE", "CRM"],
    styles: [
        {
            // Neutral, one green (DEC-090 exact colours).
            id: "green",
            name: "Green",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "ink",
                    accent: "moss",
                    heroBackground: "bone",
                    footer: "chalk",
                },
                scalars: SCALARS,
                fontPair: "geist",
                palette: { ...NEUTRALS, accent: "#1E6B3F" },
                type: TYPE,
            },
        },
        {
            // Neutral, one cobalt.
            id: "cobalt",
            name: "Cobalt",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "ink",
                    accent: "steel",
                    heroBackground: "bone",
                    footer: "chalk",
                },
                scalars: SCALARS,
                fontPair: "geist",
                palette: { ...NEUTRALS, accent: "#285B9B" },
                type: TYPE,
            },
        },
    ],
    // The design's footer line, as words for the owner to write over.
    footer: { line: "Your city · your email address", layout: "left" },
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
                    type: "richText",
                    contractVersion: 1,
                    content: () => ({
                        variant: "left",
                        anchor: "intro",
                        format: "html",
                        value: intro(),
                    }),
                },
                {
                    type: "projects",
                    contractVersion: 1,
                    content: () => ({
                        variant: "rows",
                        title: "Work",
                        anchor: "work",
                        navLabel: "Work",
                        showCount: true,
                        items: SAMPLE_WORK.map((w) => ({ ...w })),
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: () => ({
                        variant: "left",
                        anchor: "case",
                        navLabel: "Case study",
                        format: "html",
                        value: caseStudy(),
                        imageSide: "above",
                        imageBrief:
                            "The thing you built, as shipped: the real interface with real data, no browser frame or mock-up",
                        partLabels: true,
                        callout: {
                            label: "What changed",
                            text: "A placeholder. The result, as the client would put it. Only what you can stand behind.",
                        },
                    }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: () => ({
                        variant: "grid",
                        heading: "What I charge",
                        anchor: "rates",
                        navLabel: "Rates",
                        items: [
                            {
                                title: "Day rate",
                                value: "Your day rate",
                                body: "What it is for, and any minimum.",
                            },
                            {
                                title: "Project",
                                value: "Your usual range",
                                body: "For a fixed-price project, and how you scope one.",
                            },
                            {
                                title: "Retainer",
                                value: "Your monthly rate",
                                body: "How much time it buys, and the minimum term.",
                            },
                        ],
                        note: "Placeholders: replace each with your own rate. Say how you quote, and whether scoping is paid.",
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: () => ({
                        variant: "left",
                        anchor: "availability",
                        navLabel: "Availability",
                        format: "html",
                        value: `<h2>Availability</h2>`,
                        callout: {
                            label: "Your next opening — the month, as of today",
                            text:
                                "A placeholder. Say how many projects you can take and from when. If you are full, say so, and when that changes.\n" +
                                "Not looking for: the kinds of work you would rather not be asked about.",
                        },
                    }),
                },
                {
                    type: "enquiry",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        title: `Work with ${ctx.organizationName}`,
                        description:
                            "Say what you are building and when you need it.",
                        submitLabel: "Send",
                        successMessage: "Thanks, your message has been sent.",
                        fields: ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    }),
                },
            ],
        },
    ],
};
