import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `developer` — the Portfolio shape for one independent engineer (industry
 * templates plan, U9; design `templates/Developer`). It reads like a good
 * CV: what this person has built, and whether they are free. One page, in
 * the design's order:
 *
 * 1. **Intro** — the owner's name as the page heading (the `none` hero: no
 *    band), their own line under it, then two short paragraphs and three
 *    facts (based, works with, since).
 * 2. **Work** — engagements as a LIST, not cards (the Projects block's
 *    `list` look). Year, role and stack are a line of the summary: the
 *    block's caption is drawn only beside a photo, and this list has none.
 * 3. **One in detail** — one case study: what it was, with a brief for the
 *    real interface as shipped, then the problem, the constraints, the
 *    decisions, what the owner would do differently and what changed.
 * 4. **What I charge** — three kinds of rate, side by side.
 * 5. **Availability** — when the owner can next start, as of when, and what
 *    they are not looking for.
 * 6. **Contact** — an enquiry form (the API makes its Form with the site).
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
 * The engagements, as placeholders. Each title says what goes there; each
 * summary is the one sentence and, on its own line, the facts the design
 * sets in mono (year, role, stack).
 */
const SAMPLE_WORK = [
    {
        title: "Your most recent engagement",
        summary:
            "A placeholder. One sentence on what you built, for whom, and what it replaced.\nYear · your role · the stack",
    },
    {
        title: "The one before it",
        summary:
            "A placeholder. Pick work that shows a different side of what you do.\nYear · your role · the stack",
    },
    {
        title: "A salaried role, if it taught you something",
        summary:
            "A placeholder. Say what you learned there, or remove this one.\nYears · your title · the stack",
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
        `<table><tbody>` +
        `<tr><th>Based</th><td>Your city and time zone</td></tr>` +
        `<tr><th>Works with</th><td>Your languages and tools</td></tr>` +
        `<tr><th>Since</th><td>When you started working independently</td></tr>` +
        `</tbody></table>`
    );
}

/** The case study's opening, beside its one picture. */
function caseOpening(): string {
    return (
        `<h2>One in detail</h2>` +
        `<h3>The project you would most like to be hired for again</h3>` +
        `<p><em>Client · year · how long, and your part in it</em></p>` +
        `<p>A placeholder. Pick one piece of work and tell it properly: the ` +
        `parts below are the questions a good client will ask anyway.</p>`
    );
}

/** The case study's parts, each a heading the design gives and a prompt. */
function caseParts(): string {
    return (
        `<h3>The problem</h3>` +
        `<p>What was going wrong before you arrived, in the client's terms, ` +
        `and what they had already tried.</p>` +
        `<h3>Constraints</h3>` +
        `<p>What could not stop, change or be spent while you worked.</p>` +
        `<h3>What I decided</h3>` +
        `<p>The two or three choices that mattered, and what each one cost.</p>` +
        `<h3>What I would do differently</h3>` +
        `<p>One honest thing. It is the part people remember.</p>` +
        `<blockquote><p><strong>What changed</strong></p>` +
        `<p>The result, as the client would put it. Only what you can stand ` +
        `behind.</p></blockquote>`
    );
}

/** When the owner can start, as of when, and what they won't take on. */
function availability(): string {
    return (
        `<h2>Availability</h2>` +
        `<h3>Say when you can next start</h3>` +
        `<p><em>As of the date you last changed this</em></p>` +
        `<p>A placeholder. Say how many projects you can take and from when. ` +
        `If you are full, say so, and when that changes.</p>` +
        `<p>Not looking for: the kinds of work you would rather not be ` +
        `asked about.</p>`
    );
}

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
                scalars: {
                    pageMargin: 40,
                    cornerRadius: 0,
                    headingScale: 0.85,
                },
                fontPair: "geist-jetbrains",
            },
        },
        {
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
                scalars: {
                    pageMargin: 40,
                    cornerRadius: 0,
                    headingScale: 0.85,
                },
                fontPair: "geist-jetbrains",
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
                    type: "richText",
                    contractVersion: 1,
                    content: () => ({ format: "html", value: intro() }),
                },
                {
                    type: "projects",
                    contractVersion: 1,
                    content: () => ({
                        variant: "list",
                        title: "Work",
                        items: SAMPLE_WORK.map((w) => ({ ...w })),
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: () => ({
                        format: "html",
                        value: caseOpening(),
                        imageBrief:
                            "The thing you built, as shipped: the real interface with real data, no browser frame or mock-up",
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: () => ({ format: "html", value: caseParts() }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: () => ({
                        variant: "grid",
                        heading: "What I charge",
                        intro: "Placeholders: replace each with your own rate and what it covers.",
                        items: [
                            {
                                title: "Day rate",
                                body: "Your day rate, what it is for, and any minimum.",
                            },
                            {
                                title: "Project",
                                body: "Your usual range for a fixed-price project, and how you scope one.",
                            },
                            {
                                title: "Retainer",
                                body: "Your monthly rate, how much time it buys, and the minimum term.",
                            },
                        ],
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: () => ({ format: "html", value: availability() }),
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
