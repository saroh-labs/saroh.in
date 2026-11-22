import type { SectionType } from "@saroh/block-contract";
import type { TemplateKind } from "@saroh/templates";

/**
 * The day this module's words last changed, the sitemap's `lastmod` for
 * /website-library (`lib/site-pages.ts`). Change it with the words:
 * `pnpm check:content-dates` fails a batch that doesn't.
 */
export const UPDATED = "2026-11-18";

export const LIBRARY_PATH = "/website-library";

/**
 * /website-library (DEC-228, plan 2026-11-18-001 U11; board LPHome): every
 * block a merchant's site is built from, drawn live in a toolbar's look,
 * colours and component styles. The block names and layouts come from the
 * registry (`BLOCK_META`, `COMING_BLOCKS`); what is written here is what
 * each block does for a visitor and what it reads from the business. No
 * price, plan or limit (claims ledger §17.6).
 */
export const LIBRARY = {
    name: "Website library",
    phrase: "website blocks",
    seoTitle: "Website blocks and looks for small businesses",
    seoDescription:
        "Website blocks for small businesses, drawn live: services, timetables, products and visit us, in four looks and real shop colours.",
    title: "See what your website can be made of.",
    mark: "website",
    lead: "Website blocks, looks and component styles for small businesses, drawn live by the same code that draws Saroh websites. Pick a look and colours, and every block follows.",
    blocksTitle: "Every block, by what it does",
    blocksLead:
        "Prices, classes, products and hours come from your business, so you add them once.",
    toolbar: {
        label: "Try the blocks in",
        look: "Look",
        palette: "Colours",
        view: "Show on",
        desk: "Desk",
        phone: "Phone",
        components: "Component styles",
        lookDefault: "As the look",
    },
    card: {
        layouts: "Layouts",
        typed: "Typed on the block.",
        coming: "Coming",
        loading: "Loading preview",
        failed: "Preview could not load",
    },
    try: {
        title: "Try it on your business",
        lead: "Type your name and town, pick what you do and a colour. Every preview below fills in with your words, right here.",
        name: "Business name",
        town: "Town or area",
        namePlaceholder: "Noor Beauty Studio",
        townPlaceholder: "Hazratganj, Lucknow",
        trade: "What you do",
        colour: "Pick a colour",
        note: "Nothing is saved. Your words stay on this page and are gone when you leave it.",
        start: "Use this for my business",
    },
    templates: {
        title: "Whole sites, ready to start from",
        body: "Templates put these blocks together for a kind of business, from a salon to a bakery.",
        link: "See templates",
    },
    faq: [
        {
            q: "Is the library free to use?",
            a: "Yes. Every block and look here is open to anyone, without an account.",
        },
        {
            q: "Are these screenshots?",
            a: "No. Every preview is drawn live by the same code that draws Saroh websites, so what you see is what your site would show.",
        },
        {
            q: "Can I mix blocks from different templates?",
            a: "Yes. A template is a starting set of pages and blocks. You can add any block to any page, and your look and colours carry across.",
        },
        {
            q: "Where do prices, classes and products come from?",
            a: "From your business in Saroh. Services, products, classes and hours are added once, and every block that shows them stays in step.",
        },
    ],
    band: {
        title: "Start with a template, change anything.",
        note: "Every block, look and colour here is yours to change after.",
    },
} as const;

/** The catalogue's groups, in the board's order (BLOCK-MAP §3 headings). */
export const LIBRARY_GROUPS = [
    "Intro",
    "What you offer",
    "When",
    "People and proof",
    "Words",
    "Reach",
] as const;
export type LibraryGroupName = (typeof LIBRARY_GROUPS)[number];

/** What a family head's card says (KD5: one card per family). */
export interface LibraryBlockWords {
    group: LibraryGroupName;
    /** What it does for a visitor. */
    what: string;
    /** What it reads from the business; none when it is all typed on the block. */
    linked?: string;
}

/** The family heads `blockFamilies` gives, in the board's order within each group. */
export const LIBRARY_BLOCKS = {
    hero: {
        group: "Intro",
        what: "The first thing on a page: your headline, a line under it, a button and a photo, or a panel that answers first with today's classes, the next free time or a same-day call.",
    },
    features: {
        group: "Intro",
        what: "Short, titled points: what you do, what a visitor gets, or the steps to get started.",
    },
    cta: {
        group: "Intro",
        what: "A band with one button, asking for the next step.",
    },
    servicesList: {
        group: "What you offer",
        what: "Your services with what each costs and how long it takes, as a list, cards, a menu or one price.",
        linked: "Names, prices and lengths come from your services in Saroh.",
    },
    productGrid: {
        group: "What you offer",
        what: "Products from your catalogue: the newest, a collection's, or the ones you pick.",
        linked: "Products, prices and photos come from your catalogue in Saroh.",
    },
    plans: {
        group: "What you offer",
        what: "Your plans and class packs on sale, with the price and how often, side by side.",
        linked: "Plans and packs come from what you sell in Saroh.",
    },
    gallery: {
        group: "What you offer",
        what: "Your photos in a grid, a carousel, a masonry wall or a lookbook.",
    },
    projects: {
        group: "What you offer",
        what: "Your own work, each with a photo, a title, a line about it and a link.",
    },
    timetable: {
        group: "When",
        what: "The week's classes, day by day, with who takes each and the places left.",
        linked: "Classes and places come from your booking page in Saroh.",
    },
    booking: {
        group: "When",
        what: "A place to book one service: a visitor picks a time and is done.",
        linked: "Open times come from your bookings in Saroh.",
    },
    person: {
        group: "People and proof",
        what: "One person or your team: a photo, a name, what they do and a few lines about them.",
    },
    testimonials: {
        group: "People and proof",
        what: "What customers said, in their words and under their names.",
    },
    richText: {
        group: "Words",
        what: "Your own words, centred or to the left, with a photo if you like.",
    },
    faq: {
        group: "Words",
        what: "Questions a visitor would otherwise call to ask, each answer one tap away.",
    },
    journal: {
        group: "Words",
        what: "Your latest posts, newest first, as a list, an archive or one lead piece.",
        linked: "Posts come from your site's journal in Saroh.",
    },
    visitUs: {
        group: "Reach",
        what: "Your address, opening hours and phone, with Open now and Get directions, or just the ways to reach you.",
        linked: "Address and hours come from your shop's details in Saroh.",
    },
    enquiry: {
        group: "Reach",
        what: "A form visitors fill in to ask you something.",
        linked: "Messages arrive in Saroh, with who sent them.",
    },
} satisfies Partial<Record<SectionType, LibraryBlockWords>>;

/**
 * The colourways the toolbar offers: real templates' own (`styles` in
 * `@saroh/templates`), never Saroh's brand. The first is the default.
 */
export const LIBRARY_COLOURWAYS = [
    { id: "kesar", name: "Kesar", template: "salon", style: "kesar" },
    { id: "mauve", name: "Mauve", template: "salon", style: "mauve" },
    { id: "crust", name: "Crust", template: "bakery", style: "crust" },
    { id: "tide", name: "Tide", template: "clinic", style: "tide" },
    { id: "acid", name: "Acid", template: "gym", style: "acid" },
] as const;

/**
 * What the Try panel asks "What you do" with (U12): the trades setup offers
 * a business (DEC-216, `TRADE_CHOICES` in app.saroh.in), by their stored
 * ids, which sign-up checks against `TEMPLATE_KINDS`. Other is left out:
 * it asks the trade in words, which Try doesn't.
 */
export const LIBRARY_TRADES = [
    { value: "salon", label: "Salon" },
    { value: "food", label: "Bakery or food" },
    { value: "gym", label: "Gym or studio" },
    { value: "clinic", label: "Clinic" },
    { value: "coach", label: "Dietician or coach" },
    { value: "shop", label: "Shop" },
] as const satisfies readonly { value: TemplateKind; label: string }[];
