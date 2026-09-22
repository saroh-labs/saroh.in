/**
 * Every word on saroh.in that describes the product, in one place.
 *
 * The layout follows the Claude Design file "Saroh Marketing Site": five job
 * pages from ONE template and five data sets, a home page, How it works, and
 * Coming soon (the design's "What it will not do", reframed as what to expect:
 * nearly all of it is work planned, not work refused). The copy follows the design's voice, but each claim was
 * checked against the code on 2026-09-21 and rewritten where the design said
 * something the product does not do yet — `saroh-product.md`: marketing
 * matches what ships. The notable corrections, so nobody "restores" them:
 *
 * - Customers and contacts are NOT one record yet (§14). A booking or an
 *   enquiry creates a contact; an order creates a customer on its storefront,
 *   and linking the two is manual. The design's "one person, not three
 *   records" is therefore not said anywhere.
 * - Products belong to one storefront each. "One catalogue, many prices" is
 *   D13, marked proposed in the design index.
 * - Payment providers cannot be connected from a screen yet (#350), and
 *   bookings are not paid for through Saroh.
 * - Insights is 7/30/90-day site views, visitors, enquiries and orders — no
 *   chosen baseline, no twelve-week chart, no split by shop.
 * - CRM has leads and a pipeline, so "no deal pipeline" was untrue; the job is
 *   named Contacts because that is what the sidebar calls it.
 * - The role table is read from `organization-policy.ts`: an Admin can
 *   invite, a Member is read-only, a Reviewer sees only the website.
 * - Booking and enquiry blocks on a merchant's site are blocked by CORS
 *   today (#363), so booking from your website and forms that fill your
 *   contacts are listed as coming, not as features.
 *
 * Every feature on a job page has its own screenshot of the real screen that
 * does it. A feature with no screen to show is not listed as a feature.
 */

export type JobKey = "sell" | "website" | "bookings" | "contacts" | "insights";

export type IconName = "store" | "globe" | "clock" | "card" | "chart";

/** The design's own strokes, drawn on a 24-unit box. */
export const ICON: Record<IconName, string> = {
    globe: "M12 20.5 A8.5 8.5 0 1 0 12 3.5 A8.5 8.5 0 0 0 12 20.5 Z M3.5 12 H20.5 M12 3.5 C14.5 6 15.5 9 15.5 12 C15.5 15 14.5 18 12 20.5 C9.5 18 8.5 15 8.5 12 C8.5 9 9.5 6 12 3.5 Z",
    store: "M3 9 L5.5 4 H18.5 L21 9 M4.5 9 V20 H19.5 V9 M9.5 20 V14.5 H14.5 V20",
    chart: "M3 17 L9 11 L13 15 L21 7 M21 7 H15 M21 7 V13",
    clock: "M12 20.5 A8.5 8.5 0 1 0 12 3.5 A8.5 8.5 0 0 0 12 20.5 Z M12 7.2 V12 L15.2 14.2",
    card: "M3.5 5.5 H20.5 A1 1 0 0 1 21.5 6.5 V17.5 A1 1 0 0 1 20.5 18.5 H3.5 A1 1 0 0 1 2.5 17.5 V6.5 A1 1 0 0 1 3.5 5.5 Z M9 11.4 A2 2 0 1 0 9 7.4 A2 2 0 0 0 9 11.4 Z M5.8 15.8 C5.8 13.8 7.3 12.9 9 12.9 C10.7 12.9 12.2 13.8 12.2 15.8 M15 9.6 H18.6 M15 13.2 H18.6",
};

/**
 * Something being built. `body` is what it will let you do; `meanwhile` is
 * what to do until it arrives, where there is an honest answer. No dates: a
 * date on a marketing page is a promise nobody reviewed.
 */
export interface Coming {
    title: string;
    body: string;
    meanwhile?: string;
}

export interface Feature {
    title: string;
    body: string;
    image: ThemedImage;
    alt: string;
}

/** One picture in both themes, so the site shows the one it is wearing. */
export interface ThemedImage {
    light: string;
    dark: string;
    w: number;
    h: number;
}

export interface Screenshot {
    /** The whole screen, 1440×900, captured at 2×. */
    full: ThemedImage;
    /** A 900×400 detail of the same screen, for the home page's rail. */
    crop: ThemedImage;
    alt: string;
}

export interface Job {
    key: JobKey;
    name: string;
    icon: IconName;
    route: string;
    crumb: string;
    short: string;
    head: string;
    lede: string;
    who: string;
    /** What it does, each with a detail of the screen that does it. */
    does: Feature[];
    flow: { owner: string; step: string }[];
    flowNote: string;
    needs?: string;
    coming: Coming[];
    shot: Screenshot;
    caption: string;
    related: JobKey[];
}

/*
 * Real screens from app.saroh.in, captured from Northwind Supply — the demo
 * business the dev database is seeded with — in both themes. The names,
 * orders and figures are that demo business's, and every caption says so;
 * the screens themselves are exactly what a merchant sees.
 */
function screen(name: string, alt: string): Screenshot {
    return {
        full: {
            light: `/shots/${name}.png`,
            dark: `/shots/${name}-dark.png`,
            w: 1440,
            h: 900,
        },
        crop: {
            light: `/shots/crop-${name}.png`,
            dark: `/shots/crop-${name}-dark.png`,
            w: 900,
            h: 400,
        },
        alt,
    };
}

const SHOT = {
    orders: screen(
        "orders",
        "The Orders screen in Saroh: ten orders across two storefronts, each with who placed it, its status, the date and the total in rupees.",
    ),
    bookings: screen(
        "bookings",
        "The Bookings screen in Saroh: each booking with its date and time, the service, who booked and whether it is confirmed.",
    ),
    contacts: screen(
        "contacts",
        "The Contacts screen in Saroh: twenty-four people with their company, open pipeline value, last order, email and where they came from.",
    ),
    insights: screen(
        "insights",
        "The Insights screen in Saroh: thirty days of site views, visitors, enquiries and orders, a bar for each day, and the most-viewed pages.",
    ),
    website: screen(
        "website",
        "The website editor in Saroh: the page's blocks on the left, the page itself in the middle with the hero selected, and the hero's settings on the right.",
    ),
};

export const HOME_SHOT = screen(
    "home",
    "Home in Saroh: under Needs you, seven overdue leads with their value and how late each is, and four orders waiting to be sent.",
);

/** A 9:4 detail of the screen behind one feature, in both themes. */
function detail(name: string): ThemedImage {
    return {
        light: `/shots/feat-${name}.png`,
        dark: `/shots/feat-${name}-dark.png`,
        w: 900,
        h: 400,
    };
}

export const JOBS: Job[] = [
    {
        key: "sell",
        name: "Sell",
        icon: "store",
        route: "/sell",
        crumb: "Sell › Orders",
        short: "Products, orders and customers, from as many storefronts as you run.",
        head: "Every storefront's orders in one list.",
        lede: "A counter and an online shop are two storefronts under one business. Each keeps its own products and prices; the orders from all of them arrive in one list.",
        who: "anyone taking money for things — a market stall, a counter, an online shop, or all three at once.",
        does: [
            {
                title: "Orders from every storefront, together",
                body: "One list across the business. Filter to one storefront when you want to; you never add them up yourself.",
                image: SHOT.orders.crop,
                alt: "The Orders list: each order with who placed it, which storefront took it, its status and total.",
            },
            {
                title: "Products with their own price and stock",
                body: "Each product carries its price and how many are left, and warns you when stock runs low.",
                image: detail("sell-products"),
                alt: "The Products list: twelve products with their status, how many are in stock and the price in rupees.",
            },
            {
                title: "Customers who come back, marked",
                body: "Everyone who has bought, what they spent and when they last ordered, with returning customers picked out.",
                image: detail("sell-customers"),
                alt: "The Customers list: each customer with their email, how many orders, what they spent and their last order.",
            },
            {
                title: "Discount codes, aimed where you want",
                body: "Take a percentage or an amount off everything, or only the storefronts, collections or products you choose.",
                image: detail("sell-discounts"),
                alt: "Making a discount code: a percentage or an amount off, applied to everything, storefronts, collections or products.",
            },
        ],
        flow: [
            { owner: "Sell", step: "Order placed" },
            { owner: "Sell", step: "Becomes a customer" },
            { owner: "Insights", step: "Counted in orders" },
        ],
        flowNote: "Nobody retypes the buyer's name.",
        coming: [
            {
                title: "Take payment online, from your own account",
                body: "Connect Razorpay or Cashfree yourself, so customers pay by UPI, card or netbanking at checkout.",
                meanwhile:
                    "take payment the way you do today; every order still lands here.",
            },
            {
                title: "One catalogue for every storefront",
                body: "Add a product once and sell it at the counter and online, with its own price and stock in each.",
                meanwhile: "add the product to each storefront.",
            },
            {
                title: "Stock that follows every unit",
                body: "Goods in, transfers between storefronts, and a record of who changed what.",
                meanwhile:
                    "stock goes down as things sell; set counts by hand when a delivery arrives.",
            },
        ],
        shot: SHOT.orders,
        caption:
            "Every storefront's orders in one list, or filtered to one. The count beside Orders in the sidebar is read from this same list, so the two cannot disagree.",
        related: ["contacts", "insights", "website"],
    },
    {
        key: "website",
        name: "Website",
        icon: "globe",
        route: "/website",
        crumb: "Website › Editor",
        short: "Pages and a journal, at your own address when you want one.",
        head: "A website that is part of the business, not beside it.",
        lede: "Pages and a journal on your saroh.app address from the first day. Bring your own domain when you are ready.",
        who: "every business here. It is the one job almost nobody switches off, because a business people cannot find is a business with a problem.",
        does: [
            {
                title: "Pages and posts, kept apart",
                body: "Pages are the structure of your site; posts are dated writing. Each is a draft until you publish it.",
                image: detail("website-posts"),
                alt: "A site's posts: one in draft, two published, each with its category and author.",
            },
            {
                title: "Drafts nobody else can read",
                body: "Change what you like; visitors keep seeing the last version you published until you publish again.",
                image: detail("website-drafts"),
                alt: "A site's status: live, when it was last published, and one section changed and waiting to publish.",
            },
            {
                title: "Your own address",
                body: "A saroh.app address from the first day, and your own domain when you are ready — with the exact record to add, and no Saroh branding on the site.",
                image: detail("website-address"),
                alt: "A site's address: its saroh.app subdomain, and its own domain waiting for the DNS record shown beneath it.",
            },
            {
                title: "Someone else checks it first",
                body: "Ask for a review before you publish. A reviewer can comment on any block and cannot change the page.",
                image: detail("website-review"),
                alt: "The page editor with the site marked In review, and the page's blocks listed on the left.",
            },
        ],
        flow: [
            { owner: "Website", step: "Page goes live" },
            { owner: "Visitors", step: "They read it" },
            { owner: "Insights", step: "You see the visit" },
        ],
        flowNote: "The site is where the other jobs meet a customer.",
        coming: [
            {
                title: "Visitors book and enquire from your site",
                body: "A booking section where people pick a free slot, and forms that add them to your contacts as they arrive.",
            },
            {
                title: "Newsletters to the people who asked",
                body: "Write to your contacts from Saroh — only to those who agreed to hear from you.",
                meanwhile: "keep your mailing tool alongside Saroh.",
            },
        ],
        shot: SHOT.website,
        caption:
            "The page editor: blocks on the left, the page as visitors will see it, and the chosen block's settings on the right. Nothing is public until you publish.",
        related: ["sell", "bookings", "insights"],
    },
    {
        key: "bookings",
        name: "Bookings",
        icon: "clock",
        route: "/bookings",
        crumb: "Bookings › Schedule",
        short: "Your services, the hours you work, and every booking.",
        head: "Your services, your hours and every booking, in one diary.",
        lede: "What you offer, when you work, who is coming and how each one went. No shop ever appears.",
        who: "anyone selling time rather than things — coaching, lessons, treatments, consultations, classes.",
        does: [
            {
                title: "Services with a length and a price",
                body: "45 minutes at one price, 60 at another, with a gap before or after when you need to reset.",
                image: detail("bookings-services"),
                alt: "The Services list: three services with their length, price, how many can book each slot and their timezone.",
            },
            {
                title: "The hours you actually work",
                body: "Mark weekly windows for each service, in the timezone you work in. Nothing can be booked outside them.",
                image: detail("bookings-hours"),
                alt: "A service's availability: Monday to Wednesday, nine to five, each window editable.",
            },
            {
                title: "Say how each one went",
                body: "Once a booking is over, mark whether they came. Needs an outcome keeps every one nobody has answered yet.",
                image: detail("bookings-outcome"),
                alt: "The Bookings list on Needs an outcome: past bookings with the service, who booked and Not said yet.",
            },
            {
                title: "What still needs a yes",
                body: "Unconfirmed gathers every booking that is pending or was cancelled, so nothing waits unnoticed.",
                image: detail("bookings-unconfirmed"),
                alt: "The Bookings list on Unconfirmed: one cancelled booking and two pending ones.",
            },
        ],
        flow: [
            { owner: "Bookings", step: "Booking made" },
            { owner: "Contacts", step: "Contact created" },
            { owner: "Home", step: "On your day" },
        ],
        flowNote: "The person who booked is already in your contacts.",
        needs: "Bookings needs somewhere to keep the people who book, so switching it on switches Contacts on too — and says so, rather than failing later.",
        coming: [
            {
                title: "Booked straight from your website",
                body: "A booking section on any page, where visitors pick a free slot inside your hours themselves.",
            },
            {
                title: "Reminders your customers actually get",
                body: "A message before each appointment, sent for you — fewer no-shows, fewer phone calls.",
                meanwhile:
                    "every booking is here to see; the reminding is still yours.",
            },
            {
                title: "Paid when it is booked",
                body: "A service's price taken at the moment someone books it.",
                meanwhile: "take payment the way you do today.",
            },
            {
                title: "A diary for every location",
                body: "Separate diaries, staff and hours for each branch, under one business.",
                meanwhile:
                    "a second business gives you a separate diary, with separate figures.",
            },
        ],
        shot: SHOT.bookings,
        caption:
            "Every booking with its service, who made it and where it stands — confirmed, pending or cancelled.",
        related: ["contacts", "website", "insights"],
    },
    {
        key: "contacts",
        name: "Contacts",
        icon: "card",
        route: "/contacts",
        crumb: "Contacts",
        short: "Everyone you deal with, with leads in a pipeline.",
        head: "The people who got in touch, and where each one stands.",
        lede: "Everyone you deal with in one list — a booking adds the person for you — and the leads worth chasing, moved through a pipeline.",
        who: "any business where the same person comes back. Which is most of them.",
        does: [
            {
                title: "Where each person came from",
                body: "Everyone you deal with in one list, with their company, open pipeline, last order and how they found you.",
                image: detail("contacts-source"),
                alt: "The Contacts list: each person with their company, open pipeline value, email and source — website, referral, walk-in or Instagram.",
            },
            {
                title: "Leads through a pipeline",
                body: "Every enquiry worth chasing, by stage — new, qualified, proposal sent, negotiation — with what it is worth.",
                image: detail("contacts-pipeline"),
                alt: "The Pipeline board: leads in columns by stage, each with the person and its value.",
            },
            {
                title: "Notes and follow-ups on every lead",
                body: "Log the call, set the next follow-up with a date and time, and move the lead on a stage.",
                image: detail("contacts-notes"),
                alt: "A lead's page: its stage and status, a note box, and a follow-up with a date and time.",
            },
            {
                title: "The ones that have waited longest",
                body: "Every open lead with its value and how long it has waited — and Home names the overdue ones first.",
                image: detail("contacts-waiting"),
                alt: "The Leads list: each lead with its contact, value, stage, status and how many days it has waited.",
            },
        ],
        flow: [
            { owner: "Bookings", step: "Booking made" },
            { owner: "Contacts", step: "Contact recorded" },
            { owner: "Contacts", step: "Lead followed up" },
        ],
        flowNote: "Nobody types in the person who booked.",
        coming: [
            {
                title: "Contacts that add themselves",
                body: "Bookings and enquiry forms on your website add each person to your contacts — and each enquiry to your pipeline — the moment it arrives.",
            },
            {
                title: "Customers and contacts as one person",
                body: "Someone who books, then buys, shows up once, with everything they have done.",
                meanwhile:
                    "link a customer to their contact by hand — reversible, and never guessed.",
            },
            {
                title: "Newsletters to the people who asked",
                body: "Write to your contacts from Saroh — only to those who agreed to hear from you.",
                meanwhile: "keep your mailing tool alongside Saroh.",
            },
        ],
        shot: SHOT.contacts,
        caption:
            "Each contact with their open pipeline, last order and where they came from — the website, a referral, a walk-in.",
        related: ["bookings", "website", "sell"],
    },
    {
        key: "insights",
        name: "Insights",
        icon: "chart",
        route: "/insights",
        crumb: "Insights",
        short: "Visits, enquiries and orders over the last week, month or quarter.",
        head: "Figures that tell you when they do not know.",
        lede: "Site views, visitors, enquiries and orders over 7, 30 or 90 days. When something cannot be read, Saroh says so instead of showing nought.",
        who: "anyone who has ever planned a week around a number and wondered whether it was right.",
        does: [
            {
                title: "Four figures, one period",
                body: "Site views, unique visitors, enquiries and orders over 7, 30 or 90 days — you pick.",
                image: detail("insights-figures"),
                alt: "Insights for thirty days: site views, unique visitors, enquiries and orders, with the period picker above.",
            },
            {
                title: "Views day by day",
                body: "A bar for each day, so a quiet week and a busy one look different at a glance.",
                image: detail("insights-chart"),
                alt: "A bar chart of site views for each day of the last thirty days.",
            },
            {
                title: "Your most-read pages",
                body: "Which pages people actually open, most first — so you know what is doing the work.",
                image: detail("insights-pages"),
                alt: "Top pages: the paths people opened most in the last thirty days, with how many times each.",
            },
            {
                title: "Numbers that open what they count",
                body: "On Home, each figure is a link to exactly the rows behind it. A figure Saroh could not read is named, never shown as nought.",
                image: detail("insights-numbers"),
                alt: "Home's Your numbers: open leads, contacts and open orders, each linking to the list it counts.",
            },
        ],
        flow: [
            { owner: "Website + Sell", step: "Visits and orders" },
            { owner: "Insights", step: "One set of figures" },
            { owner: "You", step: "Over 7, 30 or 90 days" },
        ],
        flowNote: "Site and shop in the same place.",
        coming: [
            {
                title: "Figures across all your businesses",
                body: "One view that adds up every business you run, or keep the books for.",
                meanwhile: "switch between businesses to compare them.",
            },
        ],
        shot: SHOT.insights,
        caption:
            "Thirty days of views, visitors, enquiries and orders, a bar for each day, and the pages people opened most.",
        related: ["website", "sell", "bookings"],
    },
];

export function jobByKey(key: string): Job | undefined {
    return JOBS.find((job) => job.key === key);
}

/** The home page's "what in one place buys you" chains. */
export interface Chain {
    key: string;
    label: string;
    whose: string;
    steps: { owner: string; step: string; detail: string }[];
    means: string;
    without: string;
    shot: Screenshot;
    notice: string;
}

export const CHAINS: Chain[] = [
    {
        key: "booking",
        label: "A clinic taking bookings",
        whose: "the clinic's",
        steps: [
            {
                owner: "Bookings",
                step: "Thursday, 10:00 is booked",
                detail: "Inside the hours you marked as free.",
            },
            {
                owner: "Contacts",
                step: "They become a contact",
                detail: "Created by the booking, not typed in after.",
            },
            {
                owner: "Home",
                step: "It is on your day",
                detail: "Under what is coming up.",
            },
            {
                owner: "Bookings",
                step: "You say how it went",
                detail: "Came, or did not — kept against the booking.",
            },
        ],
        means: "Nobody retypes a name. The person who booked is in your contacts with the booking against them, so next month you can see they came twice.",
        without:
            "A booking arrives by email. You type the name into a spreadsheet, and at month end you match the lists by hand and hope.",
        shot: SHOT.contacts,
        notice: "Where it lands: the contact list, with where each person came from — nobody typed them in.",
    },
    {
        key: "selling",
        label: "A bakery selling",
        whose: "the bakery's",
        steps: [
            {
                owner: "Sell",
                step: "They order two loaves",
                detail: "From the storefront's products.",
            },
            {
                owner: "Sell",
                step: "They become a customer",
                detail: "With what they bought and when.",
            },
            {
                owner: "Sell",
                step: "It is in one list",
                detail: "With every other storefront's orders.",
            },
            {
                owner: "Insights",
                step: "It counts",
                detail: "In the period's orders.",
            },
        ],
        means: "The counter and the online shop are two storefronts, and their orders arrive in one list. You can filter to one — but you never have to add them up.",
        without:
            "A till for the counter, a store for online, and no single answer to what the business took this week.",
        shot: SHOT.orders,
        notice: "Where it lands: every storefront's orders in one list, each carrying which one took it.",
    },
];

export const STEPS = [
    {
        title: "Make your account",
        body: "Your name, your email and a password. A code to your inbox confirms the address is yours.",
    },
    {
        title: "Name the business and pick its address",
        body: "What it is called, and the saroh.app address its website will live at. Where it trades and whether it is registered take one click each.",
    },
    {
        title: "Switch on the job you do first",
        body: "Home asks, and your sidebar is built from the answer. A coach never sees a shop; a baker never sees a diary. Not greyed out — absent.",
    },
    {
        title: "Add more when you need it",
        body: "From Modules, whenever. Turn something off and the work stays where it was, so turning it back on finds your products rather than an empty shop.",
    },
];

/**
 * The switching demo. `rows` are the sidebar rows each job really adds
 * (`app.saroh.in/components/shared/nav-items.tsx`), so the demo's sidebar is
 * the product's, not a drawing of it.
 */
export const TOGGLES = [
    {
        key: "sell",
        label: "Sell",
        note: "Products, orders, customers and discounts.",
        rows: ["Sell"],
    },
    {
        key: "website",
        label: "Website",
        note: "Pages, a journal, your own address.",
        rows: ["Website"],
    },
    {
        key: "bookings",
        label: "Bookings",
        note: "A schedule and your services.",
        rows: ["Schedule", "Services"],
        needs: "contacts",
    },
    {
        key: "contacts",
        label: "Contacts",
        note: "Contacts, leads and a pipeline.",
        rows: ["Contacts", "Leads", "Pipeline"],
    },
    {
        key: "insights",
        label: "Insights",
        note: "Visits, enquiries and orders over time.",
        rows: ["Insights"],
    },
] as const;

export const ALWAYS_ROWS = [
    "Notifications",
    "Business",
    "Team",
    "Modules",
    "Providers",
];

/** Read from `organization-policy.ts`, not written for the page. */
export const ROLES = ["Owner", "Admin", "Member", "Reviewer"];
export const ROLE_ROWS: {
    label: string;
    can: [boolean, boolean, boolean, boolean];
}[] = [
    {
        label: "See the business and its storefronts",
        can: [true, true, true, false],
    },
    {
        label: "Change products, bookings and pages",
        can: [true, true, false, false],
    },
    { label: "Publish the website", can: [true, true, false, false] },
    { label: "Comment on and approve pages", can: [true, true, false, true] },
    { label: "Invite someone", can: [true, true, false, false] },
    { label: "Delete the business", can: [true, false, false, false] },
];

/** Everything being built, for /coming-soon — the job panels draw from here. */
export const COMING: Coming[] = [
    {
        title: "Take payment online, from your own account",
        body: "Connect Razorpay or Cashfree yourself, so customers pay by UPI, card or netbanking at checkout — and pay for a booking when they make it.",
        meanwhile:
            "take payment the way you do today; orders and bookings still land in Saroh.",
    },
    {
        title: "Visitors book and enquire from your site",
        body: "A booking section where people pick a free slot inside your hours, and enquiry forms that add each person to your contacts and your pipeline as they arrive.",
    },
    {
        title: "Reminders your customers actually get",
        body: "A message before each appointment and a note when an order is on its way, sent for you — fewer no-shows, fewer where-is-my-order calls.",
        meanwhile:
            "every booking and order is here to see; the reminding is still yours.",
    },
    {
        title: "One catalogue for every storefront",
        body: "Add a product once and sell it at the counter and online, with its own price and stock in each.",
        meanwhile: "add the product to each storefront.",
    },
    {
        title: "Customers and contacts as one person",
        body: "Someone who books, then buys, shows up once, with everything they have done.",
        meanwhile:
            "link a customer to their contact by hand — reversible, and never guessed.",
    },
    {
        title: "Newsletters to the people who asked",
        body: "Write to your contacts from Saroh — only to those who agreed to hear from you.",
        meanwhile: "keep your mailing tool alongside Saroh.",
    },
    {
        title: "Stock that follows every unit",
        body: "Goods in, transfers between storefronts, and a record of who changed what.",
        meanwhile:
            "stock goes down as things sell; set counts by hand when a delivery arrives.",
    },
    {
        title: "A diary for every location",
        body: "Separate diaries, staff and hours for each branch, under one business.",
        meanwhile:
            "a second business gives you a separate diary, with separate figures.",
    },
    {
        title: "Figures across all your businesses",
        body: "One view that adds up every business you run, or keep the books for.",
        meanwhile: "switch between businesses to compare them.",
    },
];
