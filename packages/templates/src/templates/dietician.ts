import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `dietician` — the Dietician industry template (industry templates plan,
 * U7; design `templates/Dietician`). A Services site whose job is trust: it
 * opens on the practitioner and their qualifications, then how they work,
 * what a consultation is and costs, what they are asked about most, their
 * writing, and how to get an appointment. One page, read top to bottom, as
 * the design is, its sections leading the header menu (How I work ·
 * Consultations · Areas · Writing). No grid of offers, nothing urgent, no
 * claim to treat or cure.
 *
 * The design's look (DEC-090): its exact Sage and Clay colours, Source
 * Serif over Inter, a 1080px frame with 17px body copy at a reading
 * measure. The practitioner opens the page as its `h1` (`person`,
 * `portrait` look) with their qualifications as rows under the portrait,
 * a facts row under them, the stages as numbered steps, one consultation
 * as a price card beside what it includes, the areas in two columns with
 * the medical disclaimer under them, and the writing as a counted archive.
 *
 * What is the business's own, never typed here (ADR-004, KTD-4):
 * - the consultation's name, length and price: the business's Services, read
 *   live (`servicesList`), laid down only with Appointments on and a service
 *   to list — one service as the design's price card, several as cards.
 *   "Ask for a time" opens the booking page on it;
 * - the writing: the site's own posts (`journal`, archive look), which draws
 *   nothing until a post is live;
 * - the hours appointments are kept: the business's hours (`hours`), which
 *   draws nothing until hours are saved;
 * - the name (the organization's) and the email (the business profile's).
 *
 * What is the owner's to replace: the role line, the qualifications, the
 * few lines about them, the facts row and the footer's line are placeholders
 * that say what goes there (in words the pre-publish check names), so a
 * site published untouched never shows a credential or a figure as fact. The steps, what a
 * consultation includes and the areas are the design's words, written to be
 * edited. The medical disclaimer stays: it is honest, and the owner can edit
 * it. Copy is in the first person, as the practitioner.
 *
 * Every count is derived from the list it counts ("Four stages", "these
 * six"); every section is gated on its own data, so none renders empty.
 */

export const DIETICIAN_TEMPLATE_ID = "dietician";

/** The module key that makes Services bookable (`module-registry.ts`). */
const APPOINTMENTS = "APPOINTMENTS";

/** A services list holds at most this many (its contract). */
const SERVICES_LIST_MAX = 24;

function stringList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v !== "")
        : [];
}

/**
 * The services the consultation section lists, or none: only with
 * Appointments on (the list is a booking surface) and only services the
 * context names, since a template cannot invent an id. Read defensively, as
 * `personalServiceIds` is: a malformed context lists nothing.
 */
export function dieticianServiceIds(ctx: TemplateContext): string[] {
    const { modules, serviceIds } = ctx as {
        modules?: unknown;
        serviceIds?: unknown;
    };
    if (!stringList(modules).includes(APPOINTMENTS)) return [];
    return [...new Set(stringList(serviceIds))].slice(0, SERVICES_LIST_MAX);
}

function bookable(ctx: TemplateContext): boolean {
    return dieticianServiceIds(ctx).length > 0;
}

const NUMBER_WORDS = [
    "No",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
] as const;

/** "Four", for a count a sentence opens with; digits past twelve. */
function countWord(n: number): string {
    return NUMBER_WORDS[n] ?? String(n);
}

/** How I work: the design's four stages, in order. */
const STEPS = [
    {
        title: "We talk first",
        body: "Most of the first consultation is you talking. What you eat, when, who cooks it, what has already been tried, and what a bad week looks like rather than an average one.",
    },
    {
        title: "I read what you bring",
        body: "Recent blood work, a doctor's note, anything a previous dietician gave you. Bring it even if it is old or you think it is irrelevant.",
    },
    {
        title: "We change three things",
        body: "Not thirty. Three changes you can actually make, written down in plain language, with what to do when one of them fails.",
    },
    {
        title: "We check in six weeks",
        body: "To see what held and what did not. The changes that did not hold are information, not failure — usually they were the wrong three.",
    },
] as const;

/**
 * What one consultation includes. The length and the price are the
 * service's, so neither is written here.
 */
const INCLUDES = [
    "The consultation itself, in person or by video",
    "A written plan afterwards, in plain language, by email",
    "Review of any blood work or notes you bring",
    "One short follow-up question by email within the first month",
] as const;

/**
 * The facts row under the practitioner (the design's "14 years / In
 * practice"). Each is the owner's to state, and nothing the template can
 * read gives it: a consultation's length is the service's and shows on the
 * price card, so it is not repeated here as a typed figure. Each label says
 * what to write, and the check names it until it is replaced.
 */
const FACTS = [
    { value: "Years", title: "Say how long you have been in practice" },
    { value: "Languages", title: "Say which languages you consult in" },
    { value: "Where", title: "Say where you see people, and whether by video" },
] as const;

/** The consultation's two paragraphs, as the design sets them. */
const ONE_PRICE =
    "There is one appointment type and one price. If a follow-up is useful I will say so at the end of the first one, and if it is not I will say that instead.";
const BY_VIDEO =
    "Video consultations work as well as in-person for almost everything. Bring the same notes and blood work either way.";

/** What I am asked about most: the design's six areas. */
const AREAS = [
    {
        title: "Type 2 diabetes",
        body: "Alongside your doctor, not instead of them. Mostly timing, portions and what to do about rice.",
    },
    {
        title: "PCOS",
        body: "Practical eating patterns, and an honest conversation about what diet can and cannot change.",
    },
    {
        title: "Thyroid conditions",
        body: "Working around medication timing, and separating what is diet from what is not.",
    },
    {
        title: "Digestive health",
        body: "Identifying triggers methodically rather than eliminating food groups on a guess.",
    },
    {
        title: "Weight, sustainably",
        body: "Slow change you can keep, measured in habits rather than a target on a scale.",
    },
    {
        title: "Eating for sport",
        body: "For amateur athletes fitting training around a full-time job.",
    },
] as const;

/** The design's medical disclaimer, under the areas. */
const DISCLAIMER =
    "I work alongside your doctor and I do not change prescribed medication or treatment. Nothing here is a diagnosis, and nothing I do replaces medical care.";

/** How to ask for an appointment, by email or the form below. */
const ASKING =
    "a sentence about what you would like help with and two or three times that suit you. If I think someone else would serve you better, I will tell you before booking.";

/** The enquiry form's fields, when there is no email to write to. */
const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    {
        name: "message",
        label: "What would you like help with, and which times suit you?",
        type: "textarea",
        required: true,
    },
] as const;

/** Where the menu's Consultations lands, whichever block draws them. */
const CONSULTATION_FRAME = {
    anchor: "consultation",
    navLabel: "Consultations",
} as const;

/** Both colourways: the design's margins and its soft corners. */
const SCALARS = {
    pageMargin: 44,
    sectionPadding: 64,
    cornerRadius: 4,
} as const;

/**
 * The design's type: the name at 40px, 17px body copy in a reading
 * measure, a 1080px frame, section titles as plain headings.
 */
const TYPE = {
    displaySize: 40,
    bodySize: 17,
    measure: 66,
    contentWidth: 1080,
} as const;

export const dieticianTemplate: TemplateManifest = {
    id: DIETICIAN_TEMPLATE_ID,
    version: 1,
    name: "Dietician",
    description:
        "A calm one-page site for a dietician or coach: who you are and your qualifications, how you work, one consultation and its price, what you are asked about most, your writing and how to get an appointment.",
    slug: "dietician",
    kinds: ["coach", "clinic"],
    shape: "services",
    sample: { name: "Dr Priya Nair", host: "drpriya.saroh.app" },
    uses: [APPOINTMENTS],
    styles: [
        {
            id: "sage",
            name: "Sage",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "ink",
                    accent: "moss",
                    heroBackground: "bone",
                    ctaBand: "graphite",
                    footer: "chalk",
                },
                scalars: SCALARS,
                fontPair: "source-serif-inter",
                palette: {
                    bg: "#FBFAF6",
                    surface: "#EDF2EC",
                    fg: "#1C2620",
                    body: "#24322B",
                    muted: "#47564D",
                    border: "#E4EBE1",
                    accent: "#2F6B4F",
                    accentFg: "#FFFFFF",
                    heroBg: "#FBFAF6",
                    heroFg: "#1C2620",
                    ctaBg: "#2F6B4F",
                    ctaFg: "#FFFFFF",
                    footerBg: "#FBFAF6",
                    footerFg: "#1C2620",
                },
                type: TYPE,
            },
        },
        {
            id: "clay",
            name: "Clay",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "ink",
                    accent: "clay",
                    heroBackground: "bone",
                    ctaBand: "clay",
                    footer: "chalk",
                },
                scalars: SCALARS,
                fontPair: "source-serif-inter",
                // The same page recoloured, lightness held: clay paper and
                // terracotta, the inks warmed to match.
                palette: {
                    bg: "#FDF9F7",
                    surface: "#F1E6DF",
                    fg: "#28201C",
                    body: "#362B26",
                    muted: "#5A4A43",
                    border: "#EDE1DA",
                    accent: "#8A483B",
                    accentFg: "#FFFFFF",
                    heroBg: "#FDF9F7",
                    heroFg: "#28201C",
                    ctaBg: "#8A483B",
                    ctaFg: "#FFFFFF",
                    footerBg: "#FDF9F7",
                    footerFg: "#28201C",
                },
                type: TYPE,
            },
        },
    ],
    /*
     * The design's foot: the name and where the practice is. The owner's
     * words to write, in Site settings.
     */
    footer: { line: "Your neighbourhood and city", layout: "left" },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    // The practitioner opens the page: portrait, name as the
                    // page's h1, role, qualifications as rows, their words.
                    type: "person",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        anchor: "intro",
                        variant: "portrait",
                        asTitle: true,
                        imageBrief:
                            "Professional portrait, seated, plain background, no white coat",
                        name: ctx.organizationName,
                        role:
                            ctx.tagline ??
                            "Your title and your town — for example, Registered dietician · Pune",
                        credentials: [
                            {
                                title: "Your degree — the subject",
                                detail: "Where you studied, and the year",
                            },
                            {
                                title: "Your registration — what it is",
                                detail: "The body you are registered with",
                            },
                            {
                                title: "Your other training — if any",
                                detail: "Who it is from, or the year you began practising",
                            },
                        ],
                        bio:
                            "Write two or three short paragraphs in your own voice: who comes to see you, what they usually arrive with, and how you work with them.\n\n" +
                            "Say plainly what you do not do, too — people trust a practitioner who tells them.",
                    }),
                },
                {
                    // A few facts worth knowing first, each the owner's.
                    type: "features",
                    contractVersion: 1,
                    content: {
                        variant: "facts",
                        items: FACTS.map((f) => ({ ...f })),
                    },
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        anchor: "how",
                        navLabel: "How I work",
                        variant: "steps",
                        heading: "How I work",
                        intro: `${countWord(STEPS.length)} stages, and the whole of the first one is listening.`,
                        items: STEPS.map((s) => ({ ...s })),
                    },
                },
                {
                    // One consultation: the business's own service as the
                    // design's price card — its name, price and length read
                    // live — beside what it includes.
                    type: "servicesList",
                    contractVersion: 1,
                    when: (ctx) => dieticianServiceIds(ctx).length === 1,
                    content: (ctx: TemplateContext) => ({
                        ...CONSULTATION_FRAME,
                        variant: "priceCard",
                        heading: "One consultation",
                        intro: `${ONE_PRICE}\n\n${BY_VIDEO}`,
                        serviceIds: dieticianServiceIds(ctx),
                        showPrices: true,
                        buttonLabel: "Ask for a time",
                        modeLine: "In person, or by video",
                        followUpLine:
                            "Follow-ups are usually six weeks apart. I will tell you if you do not need one.",
                        includesLabel: "What it includes",
                        includes: [...INCLUDES],
                    }),
                },
                {
                    // Several: each as a card, what they include under them.
                    type: "servicesList",
                    contractVersion: 1,
                    when: (ctx) => dieticianServiceIds(ctx).length > 1,
                    content: (ctx: TemplateContext) => ({
                        ...CONSULTATION_FRAME,
                        heading: "Consultations",
                        intro: "If a follow-up is useful I will say so at the end of the first appointment, and if it is not I will say that instead.",
                        serviceIds: dieticianServiceIds(ctx),
                        showPrices: true,
                        layout: "cards",
                        buttonLabel: "Ask for a time",
                    }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    when: (ctx) => dieticianServiceIds(ctx).length > 1,
                    content: {
                        variant: "list",
                        heading: "What it includes",
                        intro: BY_VIDEO,
                        items: INCLUDES.map((title) => ({ title })),
                    },
                },
                {
                    // Nothing to book yet: the consultation described, with
                    // no price or length the template could only invent.
                    type: "features",
                    contractVersion: 1,
                    when: (ctx) => !bookable(ctx),
                    content: {
                        ...CONSULTATION_FRAME,
                        variant: "list",
                        heading: "One consultation",
                        intro: "If a follow-up is useful I will say so at the end of the first one, and if it is not I will say that instead. Video consultations work as well as in-person for almost everything.",
                        items: INCLUDES.map((title) => ({ title })),
                    },
                },
                {
                    // The areas in two columns, the disclaimer under them.
                    type: "features",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        anchor: "areas",
                        navLabel: "Areas",
                        variant: "list",
                        columns: 2,
                        heading: "What I am asked about most",
                        intro:
                            `Most of my work sits in these ${countWord(AREAS.length).toLowerCase()}. ` +
                            `If what you need is not here, say so ${ctx.contactEmail ? "in your email" : "when you write"} ` +
                            "and I will tell you honestly whether I am the right person.",
                        items: AREAS.map((a) => ({ ...a })),
                        note: DISCLAIMER,
                    }),
                },
                {
                    // The site's own posts, every one, dated and counted.
                    // Nothing until a post is live.
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        anchor: "writing",
                        navLabel: "Writing",
                        variant: "archive",
                        title: "Writing",
                        showExcerpts: true,
                        showTotal: true,
                    },
                },
                {
                    // Getting an appointment, by email when there is one…
                    type: "contact",
                    contractVersion: 1,
                    when: (ctx: TemplateContext) => Boolean(ctx.contactEmail),
                    content: (ctx: TemplateContext) => ({
                        anchor: "contact",
                        heading: "Getting an appointment",
                        intro: `Email ${ASKING}`,
                        email: ctx.contactEmail,
                    }),
                },
                {
                    // …else through a form, which reaches the same inbox.
                    type: "enquiry",
                    contractVersion: 1,
                    when: (ctx: TemplateContext) => !ctx.contactEmail,
                    content: {
                        anchor: "contact",
                        title: "Getting an appointment",
                        description: `Write ${ASKING}`,
                        submitLabel: "Send",
                        successMessage:
                            "Thank you. I will reply to the email you gave.",
                        fields: ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    },
                },
                {
                    // The days and hours appointments are kept: the
                    // business's own week, runs of days on one line.
                    // Nothing until hours are saved.
                    type: "hours",
                    contractVersion: 1,
                    content: {
                        variant: "default",
                        title: "Appointments",
                        groupDays: true,
                    },
                },
            ],
        },
    ],
};

/**
 * The sample practitioner the gallery renders this template with (KTD-6):
 * the design's own words for the parts a live site leaves as placeholders.
 * Never laid down on a merchant's site — `instantiateTemplate` does not read
 * it — and its note says the credentials are illustrative, because they are.
 */
export const DIETICIAN_GALLERY_SAMPLE = {
    name: "Dr Priya Nair",
    role: "Registered dietician · Pune",
    credentials: [
        "MSc Clinical Nutrition — Manipal University, 2012",
        "Registered Dietician (RD) — Indian Dietetic Association",
        "Certified Diabetes Educator — Practising since 2014",
    ],
    bio:
        "I see people who have been told to change how they eat and have not been told how. Most arrive with a printed sheet from a hospital, a list of foods to avoid, and no idea what to cook on a Tuesday when they get home at nine.\n\n" +
        "My work is mostly translation. We start from what you already eat and what your week actually looks like, and change the smallest number of things that will make a measurable difference — then check whether it held.\n\n" +
        "I do not sell supplements, meal-kit subscriptions or programmes, and I have nothing to recommend that you cannot buy in a normal shop.",
    note: "Sample credentials, shown to demonstrate how the template presents them.",
} as const;
