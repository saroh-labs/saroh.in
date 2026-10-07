import type { TemplateContext, TemplateManifest } from "../manifest";

/**
 * `salon` — the Salon industry template (industry templates plan, U11),
 * designed in code from the gallery's line for it: "Services and prices
 * first, then each stylist's free slots". Services shape. Design note:
 * `saroh-designs/templates/Salon.spec.md`.
 *
 * The visitor is deciding between this chair and another one nearby, so the
 * first question is "who's free, and what does it cost". The page answers
 * both before anything else: the headline beside "Free today" (the hero's
 * On today panel — each stylist's next free times today, read live from the
 * booking page and each one a link straight to that time), then the price
 * list on a blush band, a row a service, with how long it takes and its
 * price. Then the stylists, what is worth knowing before coming in, and
 * where the salon is. One page, its sections leading the header menu
 * (Prices · Stylists · Find us).
 *
 * The look (DEC-090): Fraunces large and soft over Inter Tight, warm paper,
 * a deep ink and one kesar terracotta, rounded corners — a salon's mirror
 * card, not a clinic's form. Nothing uppercase; no photograph at the top
 * (the free times are the picture).
 *
 * What is the business's own, never typed here (ADR-004, KTD-4):
 * - the free times and who has them (`hero` `onToday`), only with
 *   Appointments on; the panel says "Nothing more today · See tomorrow"
 *   rather than inventing a slot;
 * - the services, their prices and lengths (`servicesList`), laid down only
 *   with Appointments on and a service to name;
 * - the address, the week's hours and directions (`visitUs`, the business's
 *   own place), which draws nothing until there is one.
 *
 * What is the owner's to replace: the stylists (three placeholders that say
 * what to write, each with a photo brief and no photo — never an invented
 * person), the four things worth knowing (each asks the owner to say it, in
 * words the pre-publish check names) and the footer's line.
 */

export const SALON_TEMPLATE_ID = "salon";

/** The module key that makes Services bookable (`module-registry.ts`). */
const APPOINTMENTS = "APPOINTMENTS";

/** A services list holds at most this many (its contract). */
const SERVICES_LIST_MAX = 24;

function stringList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v !== "")
        : [];
}

/** Appointments on, read defensively: anything malformed is "off". */
function appointmentsOn(ctx: TemplateContext): boolean {
    return stringList((ctx as { modules?: unknown }).modules).includes(
        APPOINTMENTS,
    );
}

/**
 * The services the price list names, or none: only with Appointments on,
 * and only ids the context gives (a template cannot invent one).
 */
export function salonServiceIds(ctx: TemplateContext): string[] {
    if (!appointmentsOn(ctx)) return [];
    const { serviceIds } = ctx as { serviceIds?: unknown };
    return [...new Set(stringList(serviceIds))].slice(0, SERVICES_LIST_MAX);
}

function hasPrices(ctx: TemplateContext): boolean {
    return salonServiceIds(ctx).length > 0;
}

/** The headline: the gallery's idea for the template, no claim in it. */
const HEADLINE = "Book your chair. Walk in fresh.";

/** The line under it, saying only what the page below shows. */
function heroLine(ctx: TemplateContext): string {
    if (ctx.tagline) return ctx.tagline;
    if (hasPrices(ctx)) {
        return "Every service with its price and how long it takes, and who has a chair free today.";
    }
    return `What ${ctx.organizationName} does, and when to come in.`;
}

/**
 * The stylists: placeholders the owner writes over, never invented people.
 * Three, because most salons are a few chairs; the bios say to add or
 * remove. Each carries a photo brief and no photo.
 */
const STYLISTS = [
    {
        name: "Your first stylist",
        role: "What they do best — cuts, colour, bridal",
        bio: "A placeholder. Say what they are best at, how long they have done it, and the days they are in.",
        imageBrief:
            "The stylist at their chair mid-cut, the client's back to camera, mirror behind",
    },
    {
        name: "Your second stylist",
        role: "What they do best",
        bio: "A placeholder. Add one of these for each stylist, or remove the ones you do not need.",
        imageBrief:
            "The stylist mixing colour at the trolley, hands and bowl in focus",
    },
    {
        name: "Your third stylist",
        role: "What they do best",
        bio: "A placeholder. If it is just you, keep only the first and make it you.",
        imageBrief:
            "The stylist laughing with a client in the mirror, warm window light",
    },
] as const;

/** The stylists as one Person block in the `team` look. */
function stylists(frame: Record<string, unknown> = {}) {
    const [first, ...rest] = STYLISTS;
    return {
        variant: "team",
        ...frame,
        ...first,
        people: rest.map((p) => ({ ...p })),
    };
}

/**
 * What is worth knowing before coming in. Every one is the salon's own
 * policy, so each asks the owner to say it rather than claiming it — in
 * words the pre-publish check names until they are replaced.
 */
const BEFORE_YOU_COME = [
    {
        title: "Running late",
        body: "Say how long a chair is held for someone running late, and what happens after that.",
    },
    {
        title: "Colour and patch tests",
        body: "Say whether a colour service needs a patch test first, and how many days before.",
    },
    {
        title: "Changing a booking",
        body: "Say how much notice you need to move or cancel, and the quickest way to tell you.",
    },
    {
        title: "Walk-ins",
        body: "Say whether you take walk-ins, or only booked appointments, and on which days.",
    },
] as const;

/** Without a booking page, the way to ask for a time. */
const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    {
        name: "message",
        label: "What would you like done, and which days suit you?",
        type: "textarea",
        required: true,
    },
] as const;

/**
 * Both colourways: rounded corners (a mirror card, softly), roomy sections,
 * the headline at 64px in Fraunces, 16px Inter Tight at a 60ch measure in
 * a 1200px frame; labels plain (the default), never uppercase.
 */
const SCALARS = {
    pageMargin: 36,
    sectionPadding: 72,
    gridGap: 20,
    cornerRadius: 16,
    headingScale: 1.05,
} as const;
const TYPE = {
    displaySize: 64,
    bodySize: 16,
    measure: 60,
    contentWidth: 1200,
} as const;

export const salonTemplate: TemplateManifest = {
    id: SALON_TEMPLATE_ID,
    version: 1,
    name: "Salon",
    description:
        "For a salon or barber: who has a chair free today, every service with its price and time, the stylists, what to know before you come, and where to find you.",
    slug: "salon",
    kinds: ["salon"],
    shape: "services",
    sample: { name: "Kesar Salon", host: "kesarsalon.saroh.app" },
    uses: [APPOINTMENTS],
    styles: [
        {
            id: "kesar",
            name: "Kesar",
            style: {
                colours: {
                    pageGround: "sand",
                    text: "ink",
                    accent: "clay",
                    heroBackground: "bone",
                    ctaBand: "clay",
                    footer: "ink",
                },
                scalars: SCALARS,
                fontPair: "fraunces-inter-tight",
                /*
                 * The gallery's paper, ink and kesar. The kesar #B4533A reads
                 * 4.36:1 as a link on the paper, so the accent role is its
                 * sibling a step darker at the same hue and chroma
                 * (#AF4F36, 4.63:1; white on it 5.26:1).
                 */
                palette: {
                    bg: "#F7EFE9",
                    surface: "#EFE1D6",
                    fg: "#2B1D1A",
                    body: "#3E2D28",
                    muted: "#6A554F",
                    border: "#E5D4C8",
                    accent: "#AF4F36",
                    accentFg: "#FFFFFF",
                    heroBg: "#F7EFE9",
                    heroFg: "#2B1D1A",
                    ctaBg: "#AF4F36",
                    ctaFg: "#FFFFFF",
                    footerBg: "#2B1D1A",
                    footerFg: "#F7EFE9",
                },
                type: TYPE,
            },
        },
        {
            id: "mauve",
            name: "Mauve",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "plum",
                    accent: "rose",
                    heroBackground: "bone",
                    ctaBand: "plum",
                    footer: "plum",
                },
                scalars: SCALARS,
                fontPair: "fraunces-inter-tight",
                // The same page recoloured in OKLCH, lightness and chroma
                // held, hue turned to mauve: every ratio within a few
                // hundredths of Kesar's.
                palette: {
                    bg: "#F6EEF4",
                    surface: "#EDDFEB",
                    fg: "#271D26",
                    body: "#3A2D38",
                    muted: "#645563",
                    border: "#E2D2E0",
                    accent: "#9A5095",
                    accentFg: "#FFFFFF",
                    heroBg: "#F6EEF4",
                    heroFg: "#271D26",
                    ctaBg: "#9A5095",
                    ctaFg: "#FFFFFF",
                    footerBg: "#271D26",
                    footerFg: "#F6EEF4",
                },
                type: TYPE,
            },
        },
    ],
    /*
     * The foot: the name, the street, the day the salon closes. The owner's
     * words, in Site settings; the check knows them as the template's own.
     */
    footer: {
        line: "Your street and neighbourhood · the day you are closed",
        layout: "left",
    },
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    // The headline beside each stylist's free times today
                    // (with Appointments on); the page's h1.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "centered",
                        heading: HEADLINE,
                        subheading: heroLine(ctx),
                        ...(appointmentsOn(ctx) ? { onToday: true } : {}),
                        ...(hasPrices(ctx)
                            ? {
                                  cta: {
                                      label: "See prices",
                                      href: "/#prices",
                                      style: "primary",
                                  },
                              }
                            : {}),
                    }),
                },
                {
                    // The price list: a row a service, its length and price
                    // read live. Nothing until a service is listed.
                    type: "servicesList",
                    contractVersion: 1,
                    when: hasPrices,
                    content: (ctx: TemplateContext) => ({
                        anchor: "prices",
                        navLabel: "Prices",
                        band: "surface",
                        heading: "Services and prices",
                        intro: "What each one costs and how long it takes in the chair. Book any of them with whoever is free.",
                        serviceIds: salonServiceIds(ctx),
                        showPrices: true,
                        showDescriptions: true,
                        layout: "list",
                        buttonLabel: "Book",
                    }),
                },
                {
                    type: "person",
                    contractVersion: 1,
                    content: stylists({
                        anchor: "stylists",
                        navLabel: "Stylists",
                        title: "Who you'll be with",
                    }),
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        anchor: "before",
                        band: "accent",
                        variant: "list",
                        columns: 2,
                        heading: "Before you come in",
                        items: BEFORE_YOU_COME.map((i) => ({ ...i })),
                    },
                },
                {
                    // No booking page: a form, so a visitor can still ask
                    // for a time. It reaches the business's inbox.
                    type: "enquiry",
                    contractVersion: 1,
                    when: (ctx) => !hasPrices(ctx),
                    content: {
                        anchor: "appointments",
                        navLabel: "Appointments",
                        title: "Ask for an appointment",
                        description:
                            "Say what you would like done and which days suit you, and the salon will reply with a time.",
                        submitLabel: "Send",
                        successMessage:
                            "Thank you. The salon will reply to the email you gave.",
                        fields: ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    },
                },
                {
                    // The business's own place: address, the week, directions.
                    // Nothing until it has one.
                    type: "visitUs",
                    contractVersion: 1,
                    content: {
                        anchor: "find",
                        navLabel: "Find us",
                        title: "Find the salon",
                        showMap: true,
                        showHours: true,
                    },
                },
            ],
        },
    ],
};

/**
 * The sample stylists the gallery renders this template with (KTD-6), in
 * place of the placeholders a live site starts with. Never laid down on a
 * merchant's site — `instantiateTemplate` does not read it.
 */
export const SALON_GALLERY_SAMPLE = {
    stylists: [
        {
            name: "Meher",
            role: "Cuts and colour",
            bio: "Precision cuts and soft colour. In Tuesday to Saturday.",
        },
        {
            name: "Rohit",
            role: "Men's cuts and beard",
            bio: "Fades, scissor cuts and hot-towel shaves. Evenings too.",
        },
        {
            name: "Tanvi",
            role: "Bridal and occasion",
            bio: "Hair and make-up for weddings, trials booked ahead.",
        },
    ],
    before: [
        "We hold a chair for ten minutes, then offer the next free one.",
        "First-time colour needs a patch test 48 hours before.",
        "Move or cancel up to three hours ahead.",
        "Walk-ins welcome on weekdays when a chair is free.",
    ],
    /** The footer's line: the sample salon's street, and the day it shuts. */
    footer: "22 Linking Road, Khar West · Closed Mondays",
} as const;
