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

/**
 * The design's words for the gallery's render of this template (KTD-6), in
 * place of the placeholders a live site starts with: Kiran Menon's intro
 * and facts, five engagements, the case study, the rates (the design's
 * illustrative figures, with its note saying so), the availability and the
 * footer's line. Never laid down on a merchant's site — `instantiateTemplate`
 * does not read it, so a live site never carries a figure the owner did not
 * set; only the gallery render applies it.
 */
export const DEVELOPER_GALLERY_SAMPLE = {
    footer: "Bengaluru",
    intro: {
        paragraphs: [
            "I build the parts of a product that have to keep working when the company grows — payments, dispatch, anything with a queue behind it. Mostly Go and TypeScript, mostly for teams between five and fifty people.",
            "I work alone and take one project at a time. That means I am slower to start than an agency and considerably faster once I have.",
        ],
        /** The facts' values, in the template's order (its labels stay). */
        facts: [
            "Bengaluru, UTC+5:30",
            "Go, TypeScript, Postgres, AWS",
            "Independent since 2019",
        ],
    },
    work: [
        {
            year: "2026",
            title: "Northwind Supply",
            summary:
                "Replaced a dispatch process that ran on three spreadsheets and a WhatsApp group with a single board the warehouse actually uses.",
            meta: "Go · Postgres · React · AWS",
            role: "Sole engineer",
        },
        {
            year: "2025",
            title: "Halcyon Cafe Group",
            summary:
                "Built the ordering and payments layer behind eleven outlets, including the reconciliation nobody wanted to own.",
            meta: "TypeScript · Node · Razorpay · Postgres",
            role: "Lead, team of 3",
        },
        {
            year: "2024",
            title: "Meridian Coaching",
            summary:
                "Booking and scheduling for a practice running six coaches across two cities, replacing a calendar that double-booked.",
            meta: "TypeScript · Next · Postgres",
            role: "Contract",
        },
        {
            year: "2023",
            title: "Kiln Ceramics",
            summary:
                "A small storefront and stock system for a maker who sells in runs. Intentionally boring, still running untouched.",
            meta: "TypeScript · Postgres",
            role: "Sole engineer",
        },
        {
            year: "2019–2022",
            title: "Zeta (salaried)",
            summary:
                "Payments infrastructure. Learned most of what I know about idempotency the expensive way.",
            meta: "Go · Kafka · Postgres",
            role: "Senior engineer",
        },
    ],
    caseStudy: {
        title: "Taking a warehouse off three spreadsheets and a WhatsApp group",
        meta: "Northwind Supply · 2026 · Five months, sole engineer",
        /**
         * Each part's paragraphs, in the template's order: the problem,
         * constraints, what I decided, what I would do differently (its
         * part labels stay).
         */
        parts: [
            [
                "Northwind sold to cafes across four cities and ran dispatch on three spreadsheets: one for orders, one for stock, one the drivers could see. The three disagreed by the middle of every morning, and the reconciliation was a person.",
                "They had already bought two off-the-shelf systems. Both assumed a warehouse with barcodes and fixed bin locations, and Northwind has neither.",
            ],
            [
                "Nothing could stop for a migration — the warehouse packs from 5am and the spreadsheets had to keep working until the day they did not. Two of the four staff who would use it had never used software that was not WhatsApp or Excel.",
            ],
            [
                "I wrote the new system to read the existing spreadsheets rather than replace them, so for six weeks both were true and the staff could check one against the other. That cost two weeks of throwaway sync code and bought the only thing that mattered, which was trust.",
                "The board itself is one page with no navigation. Every action is a single tap and every state is a colour and a word, because the packing floor is read at arm's length while holding a box.",
            ],
            [
                "I built the driver view second and should have built it first. The drivers were the people whose day the spreadsheets ruined most, and they were the last to be asked.",
            ],
        ],
        result: "Dispatch moved off the spreadsheets in five months with no day of downtime. The reconciliation role no longer exists — that person now runs stock — and mis-picks are rare enough that Northwind stopped counting them separately.",
    },
    rates: {
        items: [
            {
                value: "₹42,000",
                body: "For short pieces of work and reviews. Minimum two days.",
            },
            {
                value: "₹6–18 lakh",
                body: "Fixed price after a paid week of scoping. Most land near the middle.",
            },
            {
                value: "₹1,60,000",
                body: "A month, for two days a week. Three-month minimum, then rolling.",
            },
        ],
        note: "Figures are illustrative for this template. I quote fixed prices wherever the work can be scoped, because an hourly rate makes my incentive the opposite of yours. Scoping weeks are paid and the fee comes off the project if you go ahead.",
    },
    availability: {
        label: "Taking one project from November · as of 21 Sep 2026",
        text:
            "I have one slot from early November and nothing before it. If that is too far out, say so — I would rather point you at someone who is free than hold a conversation open for six weeks.\n" +
            "Not looking for salaried work, equity-only arrangements, or projects where the architecture is already decided and the job is typing.",
    },
} as const;
