import type {
    TemplateContext,
    TemplateManifest,
    TemplateSection,
} from "../manifest";
import { isOwnerNote } from "../placeholders";
import { escapeHtml } from "./html";
import { STARTER_TEMPLATE_ID } from "./starter";
import { STARTER_STYLES } from "./starter-look";

/**
 * `starter@4` — the site every new business starts from (DEC-141).
 *
 * The owner's three decisions shape it:
 *
 * 1. **It has everything, each part shown only where the business has it.**
 *    Home lays down a section for what is switched on (products, services,
 *    classes, plans, packs, the place and its hours), and the site starts
 *    with the module pages that go with them (`modulePages`: Shop, Book,
 *    Prices, and always Contact).
 * 2. **Nothing is written that is not true of this business.** The first
 *    three starters gave every site the same paragraphs ("It starts with a
 *    conversation…") and a note to the owner where the promise should be.
 *    Here every sentence is either the business's own fact (its name, its
 *    line from `composeBusinessLine`, its town) or says only what the page
 *    below it shows ("Choose a service and a time that suits you"). Where
 *    there is nothing true to say, the section is left out.
 * 3. **One primary action**, from what is switched on
 *    ({@link starterPrimaryAction}): Book where it takes bookings, the shop
 *    where it sells, otherwise a message. The hero's button and the page's
 *    closing section both carry it, and nothing else on the page asks for
 *    something different.
 *
 * It looks finished with no photograph: a centred hero (no picture to be
 * missing), a price list rather than cards, and the business's own place.
 * The two image briefs ({@link STARTER_IMAGE_BRIEFS}) tell the owner which
 * photo to add where; a brief is never drawn on the live site.
 *
 * What it does NOT lay down, and why:
 * - **Testimonials.** The block holds typed quotes, and the starter has none
 *   to type. A site gets them when its owner adds real ones.
 * - **A Journal page.** It has no module to switch on, and a new site has no
 *   posts: the page would be empty. The editor's Add page offers it.
 *
 * The closing band is a text block on the accent band (a heading, one line
 * and the action as a link) because the call-to-action block holds a button
 * and nothing else. If that block gains a heading and a line, the band
 * becomes one block: change {@link closingBand} only.
 */

const APPOINTMENTS = "APPOINTMENTS";
const COMMERCE = "COMMERCE";
const PAYMENTS = "PAYMENTS";
const CLASS_PACKS = "CLASS_PACKS";

/** A services list holds at most this many (its contract). */
const SERVICES_LIST_MAX = 24;

/** How many products Home shows: two rows of four at a desk. */
const HOME_PRODUCTS = 8;

function stringList(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v !== "")
        : [];
}

/** The modules that are on, read defensively: anything malformed is none. */
function modulesOn(ctx: TemplateContext): string[] {
    return stringList((ctx as { modules?: unknown }).modules);
}

/**
 * The services Home lists, or none: only with Appointments on, and only ids
 * the context gives (a template cannot invent one).
 */
export function starterServiceIds(ctx: TemplateContext): string[] {
    if (!modulesOn(ctx).includes(APPOINTMENTS)) return [];
    const { serviceIds } = ctx as { serviceIds?: unknown };
    return [...new Set(stringList(serviceIds))].slice(0, SERVICES_LIST_MAX);
}

/** It takes bookings: Appointments on and a service to book. */
export function starterBooks(ctx: TemplateContext): boolean {
    return starterServiceIds(ctx).length > 0;
}

/** It sells: Commerce on and the shop open for the business. */
export function starterSells(ctx: TemplateContext): boolean {
    return ctx.sells === true && modulesOn(ctx).includes(COMMERCE);
}

function hasClasses(ctx: TemplateContext): boolean {
    return starterBooks(ctx) && ctx.hasClasses === true;
}

function plansOn(ctx: TemplateContext): boolean {
    return modulesOn(ctx).includes(PAYMENTS);
}

function packsOn(ctx: TemplateContext): boolean {
    return modulesOn(ctx).includes(CLASS_PACKS);
}

/**
 * What the business does, in one line, or nothing. The owner's own tagline
 * first, then the line composed from its services or categories. Never a
 * note to the owner: one that reached here (an old site's hero line passed
 * back in) is dropped.
 */
export function starterLine(ctx: TemplateContext): string | undefined {
    for (const candidate of [ctx.tagline, ctx.description]) {
        const line = (candidate ?? "").replace(/\s+/g, " ").trim();
        if (line !== "" && !isOwnerNote(line)) return line;
    }
    return undefined;
}

/** The one thing a starter site asks of a visitor. */
export interface StarterAction {
    kind: "book" | "shop" | "contact";
    label: string;
    href: string;
}

/** Where the message form sits on Home when it is the page's action. */
const MESSAGE_ANCHOR = "message";

/**
 * The site's one primary action. Bookings before the shop, as the site's
 * header button chooses (`apps/saroh.app/lib/header-action.ts`), so the two
 * never ask for different things.
 */
export function starterPrimaryAction(ctx: TemplateContext): StarterAction {
    if (starterBooks(ctx)) {
        return { kind: "book", label: "Book a time", href: "/book" };
    }
    if (starterSells(ctx)) {
        return { kind: "shop", label: "Browse the shop", href: "/shop" };
    }
    return {
        kind: "contact",
        label: "Get in touch",
        href: `/#${MESSAGE_ANCHOR}`,
    };
}

/**
 * The photographs the starter has room for, and what each should show. The
 * live site draws nothing for a brief; the editor shows it in the empty
 * slot, and the pre-publish check quotes the hero's.
 */
export const STARTER_IMAGE_BRIEFS = {
    hero: "Your place or your work as a customer first sees it: the shopfront, the room, or what you make, in daylight",
    about: "You or your team at work, where customers meet you. A real moment, not a posed line-up",
} as const;

/**
 * What a visitor can do here, each true because its module is on. Shown
 * only with two or more: one alone is a heading over a single line.
 */
function goodToKnow(ctx: TemplateContext): { title: string; body: string }[] {
    const items: { title: string; body: string }[] = [];
    if (starterBooks(ctx)) {
        items.push({
            title: "Book online",
            body: "Choose a service and a time that suits you, at any hour.",
        });
    }
    if (starterSells(ctx)) {
        items.push({
            title: "Order online",
            body: "See what is on sale, with its price, and order from your phone.",
        });
    }
    if (ctx.hasPlace === true) {
        items.push({
            title: ctx.area ? `In ${ctx.area}` : "Come by",
            body: "The address, the opening hours and directions are on this page.",
        });
    }
    if (items.length === 0) return items;
    items.push({
        title: "Ask a question",
        body: `Send a message from the Contact page and ${ctx.organizationName} will reply by email.`,
    });
    return items;
}

/** The closing band's words for each action: a heading and one line. */
function closingWords(
    ctx: TemplateContext,
    kind: StarterAction["kind"],
): { heading: string; line: string } {
    switch (kind) {
        case "book":
            return {
                heading: "Ready when you are",
                line: "Choose a service and a time that suits you.",
            };
        case "shop":
            return {
                heading: "Take a look",
                line: "Everything on sale is in the shop, with its price.",
            };
        case "contact":
            return {
                heading: "Have a question?",
                line: `Send a message and ${ctx.organizationName} will reply by email.`,
            };
    }
}

/**
 * A page's last section: a heading, one line and the primary action, on
 * the accent band. See the file's header for why it is a text block.
 */
function closingBand(ctx: TemplateContext) {
    const action = starterPrimaryAction(ctx);
    const words = closingWords(ctx, action.kind);
    return {
        band: "accent",
        format: "html",
        value:
            `<h2>${escapeHtml(words.heading)}</h2>` +
            `<p>${escapeHtml(words.line)}</p>` +
            `<p><a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a></p>`,
    };
}

/** What the message form asks. An email field is the contract's rule. */
const MESSAGE_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "message", label: "Message", type: "textarea", required: true },
] as const;

/**
 * Home's last section where the business neither books nor sells: the
 * message form itself, with its heading and line. The hero's button, and
 * the About page's band, jump to it.
 */
function messageForm(ctx: TemplateContext) {
    return {
        anchor: MESSAGE_ANCHOR,
        title: "Get in touch",
        description: `Send a message and ${ctx.organizationName} will reply by email.`,
        submitLabel: "Send",
        successMessage: "Thank you. Your message has been sent.",
        fields: MESSAGE_FIELDS.map((f) => ({ ...f })),
    };
}

const actsByMessage = (ctx: TemplateContext) =>
    starterPrimaryAction(ctx).kind === "contact";

/** The band that closes a page. */
const CLOSING_BAND: TemplateSection = {
    type: "richText",
    contractVersion: 1,
    content: closingBand,
};

/**
 * Home's closing section: the band, or, where a message is the action, the
 * form itself (a band asking for a message above the form would ask twice).
 */
const HOME_CLOSING: TemplateSection[] = [
    { ...CLOSING_BAND, when: (ctx) => !actsByMessage(ctx) },
    {
        type: "enquiry",
        contractVersion: 1,
        when: actsByMessage,
        content: messageForm,
    },
];

/** The About page's facts, each the business's own. */
function aboutFacts(ctx: TemplateContext): [string, string][] {
    const facts: [string, string][] = [];
    if (ctx.area) facts.push(["Where", ctx.area]);
    if (starterBooks(ctx)) facts.push(["Booking", "Online, at any hour"]);
    if (starterSells(ctx)) facts.push(["Shop", "Open online"]);
    if (ctx.contactEmail) facts.push(["Email", ctx.contactEmail]);
    return facts;
}

/** About is laid down only when there is something true to put on it. */
function hasAbout(ctx: TemplateContext): boolean {
    return starterLine(ctx) !== undefined && aboutFacts(ctx).length >= 2;
}

export const starterTemplate: TemplateManifest = {
    id: STARTER_TEMPLATE_ID,
    version: 4,
    name: "Starter",
    description:
        "A site for any business: what it does, what it offers, where to find it and one clear thing to do next. Each part appears when the business has it switched on.",
    styles: STARTER_STYLES,
    /*
     * The foot: the name beside one line saying what the business does and
     * where, in its own names. No line where nothing true can be said.
     */
    footer: { layout: "left", lineFrom: starterLine },
    modulePages: [
        { kind: "SHOP", when: starterSells },
        { kind: "BOOK", when: starterBooks },
        { kind: "PRICES", when: (ctx) => plansOn(ctx) || packsOn(ctx) },
        { kind: "CONTACT" },
    ],
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            inMenu: true,
            sections: [
                {
                    // What the business is and does, and the one action.
                    // With bookings on, today's free times sit beside it.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const line = starterLine(ctx);
                        const action = starterPrimaryAction(ctx);
                        return {
                            variant: "centered",
                            heading: ctx.organizationName,
                            ...(line ? { subheading: line } : {}),
                            cta: {
                                label: action.label,
                                href: action.href,
                                style: "primary",
                            },
                            imageBrief: STARTER_IMAGE_BRIEFS.hero,
                            ...(starterBooks(ctx) ? { onToday: true } : {}),
                        };
                    },
                },
                {
                    // What it sells: the newest products, read live.
                    type: "productGrid",
                    contractVersion: 1,
                    when: starterSells,
                    content: {
                        title: "From the shop",
                        source: "newest",
                        count: HOME_PRODUCTS,
                        showPrices: true,
                    },
                },
                {
                    // What it takes bookings for: a row a service, with its
                    // price and length read live. A list, not cards, so it
                    // is complete with no photo.
                    type: "servicesList",
                    contractVersion: 1,
                    when: starterBooks,
                    content: (ctx: TemplateContext) => ({
                        heading: "Services",
                        serviceIds: starterServiceIds(ctx),
                        showPrices: true,
                        showDescriptions: true,
                        layout: "list",
                        buttonLabel: "Book",
                    }),
                },
                {
                    type: "timetable",
                    contractVersion: 1,
                    when: hasClasses,
                    content: {
                        title: "Classes this week",
                        showTrainer: true,
                        showPlacesLeft: true,
                    },
                },
                {
                    // No highlight: "Most chosen" is the owner's claim.
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
                    when: (ctx) => goodToKnow(ctx).length >= 2,
                    content: (ctx: TemplateContext) => ({
                        band: "surface",
                        heading: "Good to know",
                        items: goodToKnow(ctx),
                    }),
                },
                {
                    // The business's own place: address, the week and
                    // directions, read live.
                    type: "visitUs",
                    contractVersion: 1,
                    when: (ctx) => ctx.hasPlace === true,
                    content: {
                        anchor: "find",
                        title: "Find us",
                        showMap: true,
                        showHours: true,
                    },
                },
                {
                    // Hours with no address to show: the week on its own.
                    type: "hours",
                    contractVersion: 1,
                    when: (ctx) =>
                        ctx.hasPlace !== true && ctx.hasHours === true,
                    content: {
                        anchor: "hours",
                        title: "Opening hours",
                        groupDays: true,
                    },
                },
                ...HOME_CLOSING,
            ],
        },
        {
            path: "/about",
            title: "About",
            inMenu: true,
            when: hasAbout,
            sections: [
                {
                    // A page title, not a second hero: the line is the
                    // business's own.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "none",
                        heading: `About ${ctx.organizationName}`,
                        subheading: starterLine(ctx),
                    }),
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        factsStyle: "labels",
                        imageBrief: STARTER_IMAGE_BRIEFS.about,
                        value:
                            `<h2>At a glance</h2><dl>` +
                            aboutFacts(ctx)
                                .map(
                                    ([term, value]) =>
                                        `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`,
                                )
                                .join("") +
                            `</dl>`,
                    }),
                },
                CLOSING_BAND,
            ],
        },
    ],
};
