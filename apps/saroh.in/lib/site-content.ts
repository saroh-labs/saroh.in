/**
 * Every word on saroh.in that describes the product, in one place.
 *
 * The layout follows the Claude Design file "Saroh Marketing Site": five job
 * pages from ONE template and five data sets, a home page, How it works, and
 * What it will not do. The copy follows the design's voice, but each claim was
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

export type LimitTag = "Not built" | "Limit";

export interface Limit {
    title: string;
    tag: LimitTag;
    body: string;
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
    does: { title: string; body: string }[];
    flow: { owner: string; step: string }[];
    flowNote: string;
    needs?: string;
    limits: Limit[];
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
                body: "One list across the business. Filter to one storefront when you want to; never add them up yourself.",
            },
            {
                title: "Products with their own price and stock",
                body: "Each product lives in a storefront, with a price and a count that goes down when someone buys one.",
            },
            {
                title: "Customers per storefront",
                body: "Everyone who has bought, with what and when — kept by the storefront they bought from.",
            },
            {
                title: "Discount codes",
                body: "Made once for the business, and pointed at the storefronts they apply to.",
            },
        ],
        flow: [
            { owner: "Sell", step: "Order placed" },
            { owner: "Sell", step: "Becomes a customer" },
            { owner: "Insights", step: "Counted in orders" },
        ],
        flowNote: "Nobody retypes the buyer's name.",
        limits: [
            {
                title: "No stock movements",
                tag: "Not built",
                body: "You can set how many of something you have. There is no goods-in, no transfer between storefronts and no audit trail.",
            },
            {
                title: "One product list per storefront",
                tag: "Limit",
                body: "Two storefronts selling the same loaf means the loaf is added to each. One shared catalogue is designed, not built.",
            },
            {
                title: "Online payments are not self-serve yet",
                tag: "Not built",
                body: "Razorpay and Cashfree are supported underneath, but there is no screen to connect your own account yet.",
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
                body: "Pages are the structure of the site; posts are dated. Each is drafted, then published.",
            },
            {
                title: "Drafts nobody else can read",
                body: "Nothing is public until you publish, and publishing keeps the version that went live.",
            },
            {
                title: "Your own address",
                body: "A saroh.app address until you bring a domain. No Saroh branding on it — your shop, not our advert.",
            },
            {
                title: "Someone else can check it first",
                body: "Share a page for review. A reviewer reads and comments without ever opening the editor.",
            },
        ],
        flow: [
            { owner: "Website", step: "Page goes live" },
            { owner: "Bookings / Contacts", step: "They book or enquire" },
            { owner: "Insights", step: "You see the visit" },
        ],
        flowNote: "The site is where the other jobs meet a customer.",
        limits: [
            {
                title: "No email campaigns",
                tag: "Not built",
                body: "A journal is not a newsletter. There are no bulk sends, no audiences and no open rates.",
            },
            {
                title: "No A/B testing",
                tag: "Not built",
                body: "One version of a page, live. If you need to test two headlines against each other, this is not the tool.",
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
        short: "Services people book time in, inside the hours you work.",
        head: "A diary people can book, without emailing you first.",
        lede: "Your services, the hours you actually work, and who is coming next. No shop ever appears.",
        who: "anyone selling time rather than things — coaching, lessons, treatments, consultations, classes.",
        does: [
            {
                title: "Services with a length and a price",
                body: "45 minutes at one price, 30 at another, with a gap before and after if you need one.",
            },
            {
                title: "The hours you actually work",
                body: "Mark weekly windows and that is what people can book — in the timezone you work in.",
            },
            {
                title: "Classes as well as one-to-ones",
                body: "Give a slot room for more than one person and it books like a class.",
            },
            {
                title: "Booked from your website",
                body: "Put a booking section on a page and visitors pick a free slot themselves.",
            },
        ],
        flow: [
            { owner: "Website", step: "They pick a slot" },
            { owner: "Bookings", step: "Booking made" },
            { owner: "Contacts", step: "Contact created" },
        ],
        flowNote: "The person who booked is already in your contacts.",
        needs: "Bookings needs somewhere to keep the people who book, so switching it on switches Contacts on too — and says so, rather than failing later.",
        limits: [
            {
                title: "One diary per business",
                tag: "Not built",
                body: "A gym with two branches cannot yet split its diary and staff between them.",
            },
            {
                title: "No reminder messages",
                tag: "Not built",
                body: "Saroh does not text or email your customers before their appointment. You see the booking; they are not nudged.",
            },
            {
                title: "Not paid for through Saroh",
                tag: "Not built",
                body: "A service can show a price, but a booking is not charged. Take payment the way you do today.",
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
        short: "Everyone who enquired or booked, with leads in a pipeline.",
        head: "The people who got in touch, and where each one stands.",
        lede: "A booking or a website enquiry creates a contact on its own. Enquiries become leads you move through a pipeline.",
        who: "any business where the same person comes back. Which is most of them.",
        does: [
            {
                title: "Created by the work, not by typing",
                body: "A booking creates a contact; a form on your website creates a contact and a lead. No data entry after the fact.",
            },
            {
                title: "Leads through a pipeline",
                body: "Each enquiry is a lead with a stage, a value and how long it has waited.",
            },
            {
                title: "What they did, in order",
                body: "Bookings and enquiries against one contact, so you can see they came back.",
            },
            {
                title: "Customers, linked by hand",
                body: "Someone who bought from a storefront can be linked to their contact. Saroh never merges two people on a guess.",
            },
        ],
        flow: [
            { owner: "Website / Bookings", step: "Enquiry or booking" },
            { owner: "Contacts", step: "Contact recorded" },
            { owner: "Contacts", step: "Lead in the pipeline" },
        ],
        flowNote: "The list fills itself as you work.",
        limits: [
            {
                title: "No email campaigns",
                tag: "Not built",
                body: "You can see who your contacts are. You cannot send them a newsletter from here — no bulk sends, no audiences, no segments.",
            },
            {
                title: "Customers and contacts are linked by hand",
                tag: "Limit",
                body: "An order creates a customer on its storefront. Linking that customer to a contact is a step you take; it does not happen on its own yet.",
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
                body: "Views, unique visitors, enquiries and orders over the period you pick.",
            },
            {
                title: "Views day by day",
                body: "A bar for each day, with visitors in the detail.",
            },
            {
                title: "Your most-read pages",
                body: "Which paths people actually open, in order.",
            },
            {
                title: "Withheld rather than wrong",
                body: "A figure Saroh could not read is named on Home, not silently shown as nought.",
            },
        ],
        flow: [
            { owner: "Website + Sell", step: "Visits and orders" },
            { owner: "Insights", step: "One set of figures" },
            { owner: "You", step: "Over 7, 30 or 90 days" },
        ],
        flowNote: "Site and shop in the same place.",
        limits: [
            {
                title: "This business only",
                tag: "Limit",
                body: "Insights answers for one business at a time. A figure across every business you hold is not one this screen asks yet.",
            },
            {
                title: "No custom reports",
                tag: "Not built",
                body: "There is no report builder, no saved queries and no export scheduler. What you see is what there is.",
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
                owner: "Website",
                step: "Someone finds you",
                detail: "Your pages, at your address.",
            },
            {
                owner: "Bookings",
                step: "They book Thursday, 10:00",
                detail: "From the hours you marked as free.",
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
                owner: "Insights",
                step: "The visit counts",
                detail: "In the site's views for the week.",
            },
        ],
        means: "Nobody retypes a name. The person who booked is in your contacts with the booking against them, so next month you can see they came twice.",
        without:
            "A booking page emails you. You type the name into a spreadsheet, and at month end you match the lists by hand and hope.",
        shot: SHOT.contacts,
        notice: "Where it lands: the contact list, with where each person came from — nobody typed them in.",
    },
    {
        key: "selling",
        label: "A bakery selling",
        whose: "the bakery's",
        steps: [
            {
                owner: "Website",
                step: "Someone finds you",
                detail: "Your pages, or the shop itself.",
            },
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

export interface FullLimit extends Limit {
    instead: string;
}

export const LIMITS: FullLimit[] = [
    {
        title: "No email campaigns",
        tag: "Not built",
        body: "No newsletters, no bulk sends, no audiences, no open rates. Saroh will tell you who your contacts are; it will not mail them for you.",
        instead: "keep your existing mailing tool alongside it.",
    },
    {
        title: "Online payments are not self-serve yet",
        tag: "Not built",
        body: "Razorpay and Cashfree are supported underneath, but there is no screen to connect your own account, and bookings are not charged through Saroh.",
        instead:
            "take payment the way you do today; orders and bookings still arrive here.",
    },
    {
        title: "One diary per business",
        tag: "Not built",
        body: "Two storefronts under one business works today. Two locations with separate diaries, staff and opening hours does not.",
        instead:
            "a second business gets you separate diaries today, at the cost of separate figures.",
    },
    {
        title: "No stock movements",
        tag: "Not built",
        body: "You can set how many of something you have, and it goes down when somebody buys one. There is no goods-in, no transfer between storefronts and no audit trail of who changed what.",
        instead:
            "if you need to know where every unit went, you need stock software as well.",
    },
    {
        title: "One product list per storefront",
        tag: "Limit",
        body: "A product belongs to one storefront. Selling the same thing in two means adding it to each, with its own price and stock.",
        instead:
            "one shared catalogue is designed; until it ships, the second copy is the cost.",
    },
    {
        title: "No reminder messages",
        tag: "Not built",
        body: "Saroh does not text or email your customers before an appointment, after an order, or when something is ready. You see the work; they are not nudged.",
        instead:
            "this is the most commonly asked-for thing on this list, and still the honest answer is no.",
    },
    {
        title: "Customers and contacts are linked by hand",
        tag: "Limit",
        body: "A booking or an enquiry creates a contact; an order creates a customer on its storefront. Saroh does not join the two on its own.",
        instead:
            "link them from the customer when it matters; it is reversible and never guessed.",
    },
    {
        title: "Insights answers for one business",
        tag: "Limit",
        body: "If you hold several businesses, you compare them by switching between them. There is no screen that adds them up.",
        instead:
            "for a bookkeeper holding a dozen, that is a real cost — and the one we would fix first.",
    },
];
