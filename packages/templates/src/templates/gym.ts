import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `gym` — the Gym industry template (industry templates plan, U6), built from
 * the "Iron & Oak" design (`templates/Gym.dc.html`). Services shape.
 *
 * The visitor is someone deciding whether the gym fits around their job, so
 * the first question is "when can I train?" and the week's timetable IS the
 * top of the page: no photograph, no headline over an image. Home's `h1` is
 * the business's name for screen readers only (hero `none`, title hidden:
 * the header already prints it), then the week in the `accent` look —
 * Monday to Friday, the sessions that fill on the accent and saying so,
 * the counts worked out from the week, times in the mono face.
 *
 * Home follows the design top to bottom, and its sections lead the header
 * menu as in-page links (Timetable · Trainers · Membership · First visit):
 * the week, the coaches four across (`person`, `team` look), what it costs
 * (plans, and class packs), then the first visit as numbered steps and the
 * opening hours with the address, each on a card-coloured band. The other
 * three pages stay, for a visitor who arrives on them:
 *
 * - **Timetable**: the same week, day by day.
 * - **Membership**: the plans and class packs.
 * - **Trainers**: the coaches.
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
 * - the coaches are four placeholders that say what to write there, each
 *   with the design's photo brief (KTD-5) and no photo;
 * - the member's quote is left out: a testimonial must be a real member's
 *   words, so the owner adds one when they have it;
 * - the first visit is three short points, the business's own facts (when
 *   to arrive, lockers) asked for rather than claimed;
 * - the footer's line (where, and a phone) is the owner's to write.
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

/**
 * The pitch beside the grid. The block counts the week itself ("13 sessions
 * across 5 days", `showCounts`) and puts this after it, so nothing here is
 * a number that could go stale.
 */
const TIMETABLE_INTRO = "Book from your phone on the way in.";

/**
 * The line under the prices. The design's "Three ways in. No joining fee"
 * counts plans the template cannot see and claims terms that are the
 * owner's, so it says only what the cards below show.
 */
const MEMBERSHIP_INTRO = "Every way in, and what each one costs.";

/**
 * The first visit (the design's three numbered steps). The steps that
 * depend on the business (is the first class free, are there lockers) ask
 * the owner to say so rather than claiming it, in words the pre-publish
 * check names until they are replaced.
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

function firstVisit(frame: Record<string, string> = {}) {
    return {
        ...frame,
        variant: "steps",
        heading: FIRST_VISIT.heading,
        items: FIRST_VISIT.items.map((i) => ({ ...i })),
    };
}

/**
 * The coaches, four across as the design sets them: placeholders the owner
 * writes over, never invented people. Each carries the design's photo
 * brief (without the sample coach's name) and no photo.
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
        name: "Your second coach",
        role: "What they coach",
        bio: "A placeholder. Add one of these for each coach, or remove the ones you do not need.",
        imageBrief:
            "The coach demonstrating on the rower, side on, motion visible",
    },
    {
        name: "Your third coach",
        role: "What they coach",
        bio: "A placeholder. One or two lines a visitor would remember them by.",
        imageBrief:
            "The coach adjusting a member's position on a mat, hands visible",
    },
    {
        name: "Your fourth coach",
        role: "What they coach",
        bio: "A placeholder. If you coach alone, keep only the first and make it you.",
        imageBrief: "The coach holding pads, arms up, gym lighting behind",
    },
] as const;

/** The coaches as one Person block in the `team` look. */
function coaches(extra: Record<string, unknown> = {}) {
    const [first, ...rest] = COACHES;
    return {
        variant: "team",
        ...extra,
        ...first,
        people: rest.map((c) => ({ ...c })),
    };
}

/**
 * The look of both colourways: square corners, a 2px gap between cells,
 * the design's 1240px frame and its 15.5px body copy at 52 characters.
 * Archivo Narrow over Archivo, IBM Plex Mono for times and step numbers.
 */
const SCALARS = {
    pageMargin: 40,
    sectionPadding: 64,
    gridGap: 2,
    cornerRadius: 0,
    headingScale: 1.1,
} as const;
const TYPE = { bodySize: 15.5, measure: 52, contentWidth: 1240 } as const;

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
     * Near-black with one accent whose one job is marking the sessions that
     * fill. The design's exact colours (DEC-090): Acid is its own, Ice the
     * same file recoloured with lightness held. The swatch rows stay the
     * nearest offered ones, for Website › Style.
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
                scalars: SCALARS,
                fontPair: "archivo-narrow",
                palette: {
                    bg: "#0B0B0A",
                    surface: "#171715",
                    fg: "#F2F2EE",
                    body: "#C6C4BC",
                    muted: "#ACAAA2",
                    border: "#23231F",
                    accent: "#D7FF3E",
                    accentFg: "#0B0B0A",
                    heroBg: "#0B0B0A",
                    heroFg: "#F2F2EE",
                    ctaBg: "#D7FF3E",
                    ctaFg: "#0B0B0A",
                    footerBg: "#0B0B0A",
                    footerFg: "#F2F2EE",
                },
                type: TYPE,
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
                scalars: SCALARS,
                fontPair: "archivo-narrow",
                palette: {
                    bg: "#0A0B0D",
                    surface: "#15171A",
                    fg: "#EEF1F2",
                    body: "#BFC4C7",
                    muted: "#A5AAAD",
                    border: "#1F2226",
                    accent: "#BCF8FE",
                    accentFg: "#0A0B0D",
                    heroBg: "#0A0B0D",
                    heroFg: "#EEF1F2",
                    ctaBg: "#BCF8FE",
                    ctaFg: "#0A0B0D",
                    footerBg: "#0A0B0D",
                    footerFg: "#EEF1F2",
                },
                type: TYPE,
            },
        },
    ],
    /*
     * The design's foot: the name, where the gym is, its phone. Words the
     * owner replaces in Site settings; the check knows them as the
     * template's own.
     */
    footer: {
        line: "Your neighbourhood and city · your phone number",
        layout: "left",
    },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    // The page's h1, for screen readers and search only: the
                    // header already prints the name, and the timetable is
                    // the top of the page.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "none",
                        heading: ctx.organizationName,
                        titleVisible: false,
                    }),
                },
                {
                    type: "timetable",
                    contractVersion: 1,
                    when: classesOn,
                    content: {
                        anchor: "timetable",
                        navLabel: "Timetable",
                        variant: "accent",
                        title: "This week",
                        intro: TIMETABLE_INTRO,
                        showTrainer: true,
                        showPlacesLeft: true,
                        weekdaysOnly: true,
                        showCounts: true,
                    },
                },
                {
                    type: "person",
                    contractVersion: 1,
                    content: coaches({
                        anchor: "trainers",
                        navLabel: "Trainers",
                        title: "Who is coaching",
                    }),
                },
                {
                    type: "plans",
                    contractVersion: 1,
                    when: plansOn,
                    // No highlight: "Most chosen" is the owner's claim to make.
                    content: {
                        anchor: "membership",
                        navLabel: "Membership",
                        title: "What it costs",
                        intro: MEMBERSHIP_INTRO,
                        highlight: "none",
                    },
                },
                {
                    type: "packs",
                    contractVersion: 1,
                    when: packsOn,
                    // The menu's Membership lands here when there are no
                    // plans to sell.
                    content: (ctx: TemplateContext) => ({
                        ...(plansOn(ctx)
                            ? {}
                            : { anchor: "membership", navLabel: "Membership" }),
                        title: "Class packs",
                    }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: firstVisit({
                        anchor: "visit",
                        navLabel: "First visit",
                        band: "surface",
                    }),
                },
                {
                    type: "hours",
                    contractVersion: 1,
                    content: {
                        band: "surface",
                        title: "Where and when",
                        groupDays: true,
                        showAddress: true,
                    },
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
                    content: {
                        band: "surface",
                        title: "Opening hours",
                        groupDays: true,
                    },
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
                    content: {
                        title: "Memberships",
                        intro: MEMBERSHIP_INTRO,
                        highlight: "none",
                    },
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
                    content: firstVisit({ band: "surface" }),
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
                {
                    type: "person",
                    contractVersion: 1,
                    content: coaches(),
                },
            ],
        },
    ],
};
