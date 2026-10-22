import type { LookId } from "@saroh/block-contract";

import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * Prana Yoga: the business the looks' boards draw (VA01 Folio, VD01 Quiet,
 * VB01 Live, all "Prana Yoga, 27th Main, HSR Layout"), as the showcase a
 * look's Preview and "Use this look with its starter content" show
 * (DEC-182, amended 22 Oct: the showcase is the board's page).
 *
 * SHOWCASE ONLY. It is not in the template registry, so no merchant picks
 * it, the gallery never lists it and nothing counts it as a template's own
 * words: every word here is a sample's (`PRANA_GALLERY_SAMPLE`), so the
 * pre-publish check names each one a merchant copies and keeps, and "Fill
 * in my details" puts the business's staff and address in its place.
 *
 * One home page holds every board's sections in the boards' shared order;
 * each look keeps its own board's (`PRANA_LOOK_SECTIONS`) and its own words
 * where its board says them differently (`PRANA_LOOK_WORDS`). No section
 * names a variant, so each look draws its own defaults (KD2).
 */

export const PRANA_TEMPLATE_ID = "prana";

const APPOINTMENTS = "APPOINTMENTS";
const PAYMENTS = "PAYMENTS";
const CLASS_PACKS = "CLASS_PACKS";

const TEACHERS = [
    { name: "Meera Iyer", role: "Founder · Hatha and Foundations" },
    { name: "Kabir Menon", role: "Teacher · Vinyasa flow" },
    { name: "Ananya Rao", role: "Teacher · Pranayama" },
] as const;

/** The boards' words, VD01 first; Folio's and Live's own below. */
export const PRANA_GALLERY_SAMPLE = {
    name: "Prana Yoga",
    footer: "Yoga at your pace, in HSR Layout and live online.",
    address: "27th Main, HSR Layout.",
    hero: {
        eyebrow: "HSR Layout, Bengaluru · and live online",
        heading: "Yoga at your pace.",
        subheading:
            "A small studio, sixteen mats at most. Classes from 6 am, and live online on the days you can’t come in.",
        cta: "Book a class",
        second: "See the timetable",
        imageBrief: "Hands on a mat, side light",
    },
    room: {
        imageBrief: "Prana studio wide, from the door, morning",
        caption:
            "The room holds sixteen mats. Bolsters, blocks and straps are ours to lend.",
    },
    classes: {
        eyebrow: "Classes and services",
        heading: "Seven ways to practise.",
    },
    teachers: { title: "The teachers", people: TEACHERS },
    quotes: {
        heading: "What people say",
        items: [
            {
                quote: "Meera notices when you’re holding your breath.",
                name: "Divya S.",
                role: "Hatha with Meera",
            },
            {
                quote: "The 6 pm flow is the best hour of my week.",
                name: "Rohan K.",
                role: "Vinyasa flow with Kabir",
            },
            {
                quote: "I sleep better on Pranayama days.",
                name: "Leela M.",
                role: "Pranayama with Ananya",
            },
        ],
    },
    visit: { title: "Visit us" },
    folio: {
        subheading:
            "A small studio. Sixteen mats at most, classes from 6 am, and live online for the days you can’t come in.",
        classes: "Seven ways to practise, all at your pace.",
        plans: "Pay by the class, or come often for less.",
        quotes: [
            {
                quote: "I came for the free intro class in March and haven’t missed a Tuesday since. Meera notices when you’re holding your breath.",
                name: "Divya S.",
                role: "coming since March",
            },
            {
                quote: "Kabir’s 6 pm flow is the only hour of my day without a phone.",
                name: "Rohan P.",
                role: "Vinyasa on Mondays",
            },
            {
                quote: "The online class works. The camera angle is good and she corrects you by name.",
                name: "Farah K.",
                role: "live online",
            },
        ],
    },
    live: {
        heading: "Yoga in HSR Layout. Every day from 6 am.",
        subheading:
            "Small classes with Meera, Kabir and Ananya at our studio on 27th Main, or live online from home. Your first class is free.",
        second: "Or try a free intro class",
        next: {
            title: "Next free",
            intro: "Classes you can still book today and tomorrow.",
        },
        classes: "Classes and private sessions",
        teachers: "Your teachers",
        quotes: {
            heading: "In their words",
            items: [
                {
                    quote: "I came for my back and stayed for the people. Meera notices everything, in the kindest way.",
                    name: "Shruti N.",
                    role: "Comes to Hatha with Meera",
                },
                {
                    quote: "Hard, honest classes at 6 pm that fit around work. Booking on the phone takes ten seconds.",
                    name: "Rohan D.",
                    role: "Comes to Vinyasa flow",
                },
                {
                    quote: "The online class feels like being in the room. Ananya calls out names and fixes my shoulders.",
                    name: "Farah K.",
                    role: "Joins live online",
                },
            ],
        },
        plans: "Come once, or every day",
    },
    packs: "Or a pack of ten",
} as const;

const S = PRANA_GALLERY_SAMPLE;

function modulesOn(ctx: TemplateContext): string[] {
    const { modules } = ctx as { modules?: unknown };
    return Array.isArray(modules)
        ? modules.filter((m): m is string => typeof m === "string")
        : [];
}
const on = (key: string) => (ctx: TemplateContext) =>
    modulesOn(ctx).includes(key);

/** The business's own services, as the API's context names them. */
function serviceIds(ctx: TemplateContext): string[] {
    const { serviceIds: ids } = ctx as { serviceIds?: unknown };
    return Array.isArray(ids)
        ? ids.filter((v): v is string => typeof v === "string")
        : [];
}

export const pranaShowcase: TemplateManifest = {
    id: PRANA_TEMPLATE_ID,
    version: 1,
    name: "Prana Yoga",
    description: "The looks' boards' studio: classes, teachers and plans.",
    sample: { name: S.name, host: "pranayoga.saroh.app" },
    uses: [APPOINTMENTS, PAYMENTS, CLASS_PACKS],
    // One colourway: a look's Preview draws its board's own colours.
    styles: [{ id: "board", name: "Board", style: {} }],
    footer: { line: S.footer, layout: "left" },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: {
                        eyebrow: S.hero.eyebrow,
                        heading: S.hero.heading,
                        subheading: S.hero.subheading,
                        cta: { label: S.hero.cta, href: "/book" },
                        secondaryCta: { label: S.hero.second, href: "/book" },
                    },
                },
                {
                    type: "timetable",
                    contractVersion: 1,
                    when: on(APPOINTMENTS),
                    content: {
                        anchor: "timetable",
                        navLabel: "Timetable",
                        title: S.live.next.title,
                        intro: S.live.next.intro,
                        showTrainer: true,
                        showPlacesLeft: true,
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: {
                        format: "html",
                        value: "",
                        imageSide: "above",
                        imageBrief: S.room.imageBrief,
                    },
                },
                {
                    type: "servicesList",
                    contractVersion: 1,
                    when: (ctx) => serviceIds(ctx).length > 0,
                    content: (ctx: TemplateContext) => ({
                        anchor: "classes",
                        navLabel: "Classes",
                        eyebrow: S.classes.eyebrow,
                        heading: S.classes.heading,
                        serviceIds: serviceIds(ctx),
                        showPrices: true,
                        showDescriptions: true,
                        layout: "list",
                    }),
                },
                {
                    type: "person",
                    contractVersion: 1,
                    // The one variant set: a Person block is one person
                    // unless it says team, and every board draws three.
                    content: {
                        variant: "team",
                        anchor: "teachers",
                        navLabel: "Teachers",
                        title: S.teachers.title,
                        ...TEACHERS[0],
                        people: TEACHERS.slice(1).map((t) => ({ ...t })),
                    },
                },
                {
                    type: "testimonials",
                    contractVersion: 1,
                    content: {
                        heading: S.quotes.heading,
                        items: S.quotes.items.map((q) => ({ ...q })),
                    },
                },
                {
                    type: "plans",
                    contractVersion: 1,
                    when: on(PAYMENTS),
                    content: {
                        anchor: "memberships",
                        navLabel: "Memberships",
                        title: S.folio.plans,
                    },
                },
                {
                    type: "packs",
                    contractVersion: 1,
                    when: on(CLASS_PACKS),
                    content: { title: S.packs },
                },
                {
                    type: "visitUs",
                    contractVersion: 1,
                    content: {
                        anchor: "visit",
                        navLabel: "Visit us",
                        title: S.visit.title,
                        showHours: true,
                    },
                },
            ],
        },
    ],
};

/** Each look's board's sections, in the boards' shared order. */
export const PRANA_LOOK_SECTIONS: Readonly<Record<LookId, readonly string[]>> =
    {
        // VD01: hero, the room, classes, teachers, quotes, visit.
        quiet: [
            "hero",
            "richText",
            "servicesList",
            "person",
            "testimonials",
            "visitUs",
        ],
        // VA01: hero and its sentence card, the room, classes, teachers,
        // quotes, plans, visit.
        folio: [
            "hero",
            "richText",
            "servicesList",
            "person",
            "testimonials",
            "plans",
            "packs",
            "visitUs",
        ],
        // VB01: hero, next free, classes, teachers, quotes, plans, visit.
        live: [
            "hero",
            "timetable",
            "servicesList",
            "person",
            "testimonials",
            "plans",
            "packs",
            "visitUs",
        ],
    };

/** Where a look's board words a section its own way, by section type. */
export const PRANA_LOOK_WORDS: Readonly<
    Record<LookId, Readonly<Partial<Record<string, Record<string, unknown>>>>>
> = {
    quiet: {},
    folio: {
        hero: {
            subheading: S.folio.subheading,
            imageBrief: S.hero.imageBrief,
        },
        richText: { value: `<p>${S.room.caption}</p>` },
        servicesList: { heading: S.folio.classes },
        // VA01 heads its quotes with the small label alone.
        testimonials: {
            heading: undefined,
            eyebrow: S.quotes.heading,
            items: S.folio.quotes.map((q) => ({ ...q })),
        },
    },
    live: {
        hero: {
            eyebrow: undefined,
            heading: S.live.heading,
            subheading: S.live.subheading,
            secondaryCta: { label: S.live.second, href: "/book" },
            imageBrief: "Prana, a class in progress",
        },
        servicesList: { eyebrow: undefined, heading: S.live.classes },
        person: { title: S.live.teachers },
        testimonials: {
            heading: S.live.quotes.heading,
            items: S.live.quotes.items.map((q) => ({ ...q })),
        },
        plans: { title: S.live.plans },
    },
};
