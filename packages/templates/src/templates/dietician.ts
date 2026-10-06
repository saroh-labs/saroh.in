import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `dietician` — the Dietician industry template (industry templates plan,
 * U7; design `templates/Dietician`). A Services site whose job is trust: it
 * opens on the practitioner and their qualifications, then how they work,
 * what a consultation is and costs, what they are asked about most, their
 * writing, and how to get an appointment. One page, read top to bottom, as
 * the design is. No grid of offers, nothing urgent, no claim to treat or cure.
 *
 * What is the business's own, never typed here (ADR-004, KTD-4):
 * - the consultation's name, length and price: the business's Services, read
 *   live (`servicesList`), laid down only with Appointments on and a service
 *   to list. Each card's "Ask for a time" opens the booking page on it;
 * - the writing: the site's own posts (`journal`, archive look), which draws
 *   nothing until a post is live;
 * - the hours appointments are kept: the business's hours (`hours`), which
 *   draws nothing until hours are saved;
 * - the name (the organization's) and the email (the business profile's).
 *
 * What is the owner's to replace: the role line, the qualifications and the
 * few lines about them are placeholders that say what goes there, so a site
 * published untouched never shows a credential as fact. The steps, what a
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
    { title: "The consultation itself, in person or by video" },
    { title: "A written plan afterwards, in plain language, by email" },
    { title: "Review of any blood work or notes you bring" },
    { title: "One short follow-up question by email within the first month" },
] as const;

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
                scalars: {
                    pageMargin: 44,
                    sectionPadding: 64,
                    cornerRadius: 4,
                },
                fontPair: "source-serif-inter",
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
                scalars: {
                    pageMargin: 44,
                    sectionPadding: 64,
                    cornerRadius: 4,
                },
                fontPair: "source-serif-inter",
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
                    // The practitioner: portrait, name, role, qualifications.
                    type: "person",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "default",
                        imageBrief:
                            "Professional portrait, seated, plain background, no white coat",
                        name: ctx.organizationName,
                        role:
                            ctx.tagline ??
                            "Your title and your town — for example, Registered dietician · Pune",
                        credentials: [
                            "Your degree — the subject, where you studied and the year",
                            "Your registration — and the body you are registered with",
                            "Anything else you hold, and the year you started practising",
                        ],
                        bio:
                            "Write two or three short paragraphs in your own voice: who comes to see you, what they usually arrive with, and how you work with them.\n" +
                            "Say plainly what you do not do, too — people trust a practitioner who tells them.",
                    }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        variant: "steps",
                        heading: "How I work",
                        intro: `${countWord(STEPS.length)} stages, and the whole of the first one is listening.`,
                        items: STEPS.map((s) => ({ ...s })),
                    },
                },
                {
                    // The consultation: the business's own services, live.
                    type: "servicesList",
                    contractVersion: 1,
                    when: bookable,
                    content: (ctx: TemplateContext) => {
                        const ids = dieticianServiceIds(ctx);
                        const one = ids.length === 1;
                        return {
                            // Not a count: a service archived later drops
                            // out of the list, and a number would go stale.
                            heading: one ? "One consultation" : "Consultations",
                            intro: one
                                ? "There is one appointment type and one price. If a follow-up is useful I will say so at the end of the first one, and if it is not I will say that instead."
                                : "If a follow-up is useful I will say so at the end of the first appointment, and if it is not I will say that instead.",
                            serviceIds: ids,
                            showPrices: true,
                            layout: "cards",
                            buttonLabel: "Ask for a time",
                        };
                    },
                },
                {
                    // What it includes: under the services, or standing in
                    // for them while there are none to book.
                    type: "features",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) =>
                        bookable(ctx)
                            ? {
                                  variant: "list",
                                  heading: "What it includes",
                                  intro: "Video consultations work as well as in-person for almost everything. Bring the same notes and blood work either way.",
                                  items: INCLUDES.map((i) => ({ ...i })),
                              }
                            : {
                                  variant: "list",
                                  heading: "One consultation",
                                  intro: "If a follow-up is useful I will say so at the end of the first one, and if it is not I will say that instead. Video consultations work as well as in-person for almost everything.",
                                  items: INCLUDES.map((i) => ({ ...i })),
                              },
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "list",
                        heading: "What I am asked about most",
                        intro:
                            `Most of my work sits in these ${countWord(AREAS.length).toLowerCase()}. ` +
                            `If what you need is not here, say so ${ctx.contactEmail ? "in your email" : "when you write"} ` +
                            "and I will tell you honestly whether I am the right person.",
                        items: AREAS.map((a) => ({ ...a })),
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: {
                        format: "html",
                        value: `<p>${escapeHtml(DISCLAIMER)}</p>`,
                    },
                },
                {
                    // The site's own posts, every one, dated. Nothing until
                    // a post is live.
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "archive",
                        title: "Writing",
                        showExcerpts: true,
                    },
                },
                {
                    // Getting an appointment, by email when there is one…
                    type: "contact",
                    contractVersion: 1,
                    when: (ctx: TemplateContext) => Boolean(ctx.contactEmail),
                    content: (ctx: TemplateContext) => ({
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
                    // business's own week. Nothing until hours are saved.
                    type: "hours",
                    contractVersion: 1,
                    content: {
                        variant: "default",
                        title: "Appointments",
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
