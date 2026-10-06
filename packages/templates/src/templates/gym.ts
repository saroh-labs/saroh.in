import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `gym` — the Gym industry template (industry templates plan, U6), built from
 * the "Iron & Oak" design (`templates/Gym.dc.html`). Services shape.
 *
 * The visitor is someone deciding whether the gym fits around their job, so
 * the first question is "when can I train?" and the week's timetable IS the
 * top of the page: no photograph, no headline over an image. Home's opening
 * is the business's name as a plain page title (hero `none`, so the page
 * keeps its one `h1`), then the timetable with the pitch as its one line.
 *
 * Four pages, as the gallery shows them:
 *
 * - **Home**: the timetable, what it costs (plans, and class packs), the
 *   first visit and the opening hours, in the design's order.
 * - **Timetable**: the same week, day by day.
 * - **Membership**: the plans and class packs.
 * - **Trainers**: the coaches, one Person block each.
 *
 * Everything that is the business's own comes from its data, read live
 * (ADR-004, KTD-4): sessions, who coaches each and the places left
 * (`timetable`, which says "Full" and "Fills fast · 2 left" in words, never
 * colour alone), the plans and packs on sale with their prices (`plans`,
 * `packs`) and the opening hours (`hours`). Each is laid down only while its
 * module is on, and each renders nothing on the live site when there is
 * nothing to show (no sessions this week, no plan on sale, no hours saved).
 * A page whose every section is bound to one module is laid down only with
 * that module on, so no page opens onto nothing.
 *
 * Nothing is invented on a live site. The design's coaches, member quote,
 * prices and "first class is free" are the sample gym's, not this business's:
 * - the coaches are two Person placeholders that say what to write there,
 *   each with the design's photo brief (KTD-5) and no photo;
 * - the member's quote is left out: a testimonial must be a real member's
 *   words, so the owner adds one when they have it;
 * - the first visit is three short points, the business's own facts (when
 *   to arrive, lockers) asked for rather than claimed.
 *
 * Copy speaks to the visitor and never as "we", so a one-coach studio reads
 * it the same as a large gym.
 */

export const GYM_TEMPLATE_ID = "gym";

/** The module keys (`module-registry.ts`) its bound blocks read. */
const APPOINTMENTS = "APPOINTMENTS";
const PAYMENTS = "PAYMENTS";
const CLASS_PACKS = "CLASS_PACKS";

/** The switched-on modules, read defensively: anything else is "not known". */
function modulesOn(ctx: TemplateContext): string[] {
    const { modules } = ctx as { modules?: unknown };
    return Array.isArray(modules)
        ? modules.filter((m): m is string => typeof m === "string")
        : [];
}

function on(key: string): (ctx: TemplateContext) => boolean {
    return (ctx) => modulesOn(ctx).includes(key);
}

/** Classes: the timetable reads the booking page's class sessions. */
const classesOn = on(APPOINTMENTS);
/** Memberships: plans on sale need Payments. */
const plansOn = on(PAYMENTS);
/** Classes bought ahead. */
const packsOn = on(CLASS_PACKS);

/** What the owner has said about the gym, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/** The pitch: one line beside the grid (the design's lede, without counts). */
const TIMETABLE_INTRO =
    "Who is coaching each class and how many places are left. Book from your phone on the way in.";

/**
 * The first visit (the design's three steps). The steps that depend on the
 * business (is the first class free, are there lockers) ask the owner to say
 * so rather than claiming it.
 */
const FIRST_VISIT = {
    heading: "Your first visit",
    items: [
        {
            title: "Arrive ten minutes early",
            body: "Say who to ask for at the desk, and whether a first class needs booking or is free.",
        },
        {
            title: "Bring indoor shoes and a towel",
            body: "Say whether there are lockers, and anything else worth bringing.",
        },
        {
            title: "Tell the coach what hurts",
            body: "Before the warm-up rather than during it, so the session can be worked around it.",
        },
    ],
} as const;

function firstVisit() {
    return {
        variant: "list",
        heading: FIRST_VISIT.heading,
        items: FIRST_VISIT.items.map((i) => ({ ...i })),
    };
}

/**
 * The coaches: placeholders the owner writes over, never invented people.
 * Each carries the design's photo brief and no photo.
 */
const COACHES = [
    {
        name: "Your first coach",
        role: "What they coach",
        bio: "A placeholder. Say what they coach, how long they have done it and what a first session with them is like.",
        imageBrief:
            "The coach mid-cue beside a loaded bar, looking at the lifter, not the camera",
    },
    {
        name: "Another coach",
        role: "What they coach",
        bio: "A placeholder. Add one of these for each coach, or remove this one if you coach alone.",
        imageBrief:
            "The coach demonstrating on the rower, side on, motion visible",
    },
] as const;

export const gymTemplate: TemplateManifest = {
    id: GYM_TEMPLATE_ID,
    version: 1,
    name: "Gym",
    description:
        "For a gym or studio that runs classes: the week's timetable first, with who is coaching and the places left, then memberships, the coaches, a first visit and the opening hours.",
    slug: "gym",
    kinds: ["gym"],
    shape: "services",
    sample: { name: "Iron & Oak", host: "ironandoak.saroh.app" },
    uses: [APPOINTMENTS, PAYMENTS, CLASS_PACKS],
    /*
     * Near-black with one accent, square corners, Archivo Narrow over
     * Archivo. The palette is the curated `Site.style` one, so each design
     * colour is its nearest offered swatch: Slate for the near-black ground,
     * Chalk text, Moss for the acid accent and Teal for Ice.
     */
    styles: [
        {
            id: "acid",
            name: "Acid",
            style: {
                colours: {
                    pageGround: "slate",
                    text: "chalk",
                    accent: "moss",
                    heroBackground: "shadow",
                    ctaBand: "graphite",
                    footer: "ink",
                },
                scalars: {
                    pageMargin: 40,
                    sectionPadding: 64,
                    gridGap: 6,
                    cornerRadius: 0,
                    headingScale: 1.1,
                },
                fontPair: "archivo-narrow",
            },
        },
        {
            id: "ice",
            name: "Ice",
            style: {
                colours: {
                    pageGround: "slate",
                    text: "chalk",
                    accent: "teal",
                    heroBackground: "shadow",
                    ctaBand: "graphite",
                    footer: "ink",
                },
                scalars: {
                    pageMargin: 40,
                    sectionPadding: 64,
                    gridGap: 6,
                    cornerRadius: 0,
                    headingScale: 1.1,
                },
                fontPair: "archivo-narrow",
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
                    // The page's title, not a hero: the timetable is the top.
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
                    type: "timetable",
                    contractVersion: 1,
                    when: classesOn,
                    content: {
                        variant: "grid",
                        title: "This week",
                        intro: TIMETABLE_INTRO,
                        showTrainer: true,
                        showPlacesLeft: true,
                    },
                },
                {
                    type: "plans",
                    contractVersion: 1,
                    when: plansOn,
                    // No highlight: "Most chosen" is the owner's claim to make.
                    content: { title: "What it costs", highlight: "none" },
                },
                {
                    type: "packs",
                    contractVersion: 1,
                    when: packsOn,
                    content: { title: "Class packs" },
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: firstVisit(),
                },
                {
                    type: "hours",
                    contractVersion: 1,
                    content: { title: "Where and when" },
                },
            ],
        },
        {
            path: "/timetable",
            title: "Timetable",
            when: classesOn,
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: {
                        variant: "none",
                        heading: "Timetable",
                        subheading:
                            "The next seven days, with who is coaching each class and the places left.",
                    },
                },
                {
                    type: "timetable",
                    contractVersion: 1,
                    content: {
                        variant: "list",
                        title: "Day by day",
                        showTrainer: true,
                        showPlacesLeft: true,
                    },
                },
                {
                    type: "hours",
                    contractVersion: 1,
                    content: { title: "Opening hours" },
                },
            ],
        },
        {
            path: "/membership",
            title: "Membership",
            when: (ctx) => plansOn(ctx) || packsOn(ctx),
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: {
                        variant: "none",
                        heading: "Membership",
                        subheading: "Every way in, and what it costs.",
                    },
                },
                {
                    type: "plans",
                    contractVersion: 1,
                    when: plansOn,
                    content: { title: "Memberships", highlight: "none" },
                },
                {
                    type: "packs",
                    contractVersion: 1,
                    when: packsOn,
                    content: { title: "Class packs" },
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: firstVisit(),
                },
            ],
        },
        {
            path: "/trainers",
            title: "Trainers",
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: {
                        variant: "none",
                        heading: "Who is coaching",
                    },
                },
                ...COACHES.map((coach) => ({
                    type: "person" as const,
                    contractVersion: 1,
                    content: { variant: "default", ...coach },
                })),
            ],
        },
    ],
};
