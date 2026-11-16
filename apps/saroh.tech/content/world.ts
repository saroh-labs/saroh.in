import type { HomeHeroScene } from "@saroh/marketing/home/hero-stage";
import type { SiteShowcase } from "@saroh/marketing/home/site-chapter";
import type { SiteLook } from "@saroh/marketing/kit/site-drawing";
import { TRADE_LOOKS } from "@saroh/marketing/kit/trade-looks";
import type { World, WorldBusiness, WorldStory } from "@saroh/marketing/world";

/**
 * saroh.tech's example world (DEC-221): the Global demo businesses from
 * `db:seed:global` (`packages/database/src/seed/global/data.ts`), the same
 * ones saroh.tech's screenshots are taken on, so a drawing and the shot
 * beside it agree. Names, prices, places and tax come from the seed; where
 * a drawing needs a fact the seed doesn't hold, it is marked "not in the
 * seed" and kept in this file only.
 *
 * Each business draws its trade's look (`kit/trade-looks`), as saroh.in's
 * do: the same bakery, salon and gym colours on both sites (owner, 16 Nov 2026).
 *
 * Global launches on Free (DEC-211): no GST, UPI, Razorpay or Hinglish; the
 * money path names Stripe, and a plan line says "Free until paid plans
 * open" with "Tell me when", never Grow or Pro.
 */

/** Thistlewick Bakery (Madison, WI): the lead, a bakery as Rye & Co. is in India. */
const THISTLEWICK: WorldBusiness = {
    key: "thistlewick",
    trade: "bakery",
    /** The drawn stand-in for its own photo (`kit/drawn-photo`). */
    photo: "buns",
    name: "Thistlewick Bakery",
    kind: "bakery",
    // Not in the seed: its owner login is "Demo Owner". A first name for
    // the drawings only.
    owner: "Clara",
    place: "118 Sample Street, Madison, WI",
    site: "thistlewick-bakery.saroh.app",
    plan: "Free",
    tradePage: "/solutions/shops",
    look: TRADE_LOOKS.bakery,
    orderRange: ["ORD-001", "ORD-048"],
    invoiceRange: ["INV-0001", "INV-0005"],
    customers: [
        {
            name: "Maya Thompson",
            note: "Allergic to sesame. Collects most Saturdays, prefers the darker bake. 8 orders",
        },
        { name: "Ben Carter", note: "5 orders" },
        { name: "Lucy Alvarez", note: "4 orders" },
        {
            name: "Cedar Cup Cafe",
            note: "A wholesale invoice: 30 large sourdough, 48 cinnamon buns, due in 14 days",
        },
    ],
    items: [
        {
            key: "sourdough",
            photo: "loaf",
            name: "Sourdough loaf",
            price: "$9.00",
            unit: "large",
        },
        {
            key: "sourdough-small",
            photo: "loaf",
            name: "Sourdough loaf",
            price: "$5.50",
            unit: "small",
        },
        {
            key: "cinnamon-bun",
            photo: "buns",
            name: "Cinnamon bun",
            price: "$4.50",
        },
        {
            key: "cinnamon-six",
            photo: "buns",
            name: "Cinnamon bun",
            price: "$24.00",
            unit: "six-pack",
        },
        {
            key: "focaccia",
            photo: "loaf",
            name: "Rosemary focaccia",
            price: "$8.00",
        },
        { key: "beans", name: "House blend beans, 12 oz", price: "$16.00" },
        {
            key: "truffle-cake",
            photo: "brownies",
            name: "Chocolate truffle cake",
            price: "$42.00",
            unit: "6 inch",
        },
        {
            key: "lemon-cake",
            photo: "brownies",
            name: "Lemon and blueberry cake",
            price: "$44.00",
        },
        {
            key: "walnut-cake",
            photo: "brownies",
            name: "Coffee and walnut cake",
            price: "$44.00",
        },
        {
            key: "fruit-cake",
            photo: "brownies",
            name: "Vanilla and seasonal fruit cake",
            price: "$40.00",
        },
        // The seed bills it on Cedar Cup's draft invoice; not a product in
        // the seed: an AI app adds it as a draft at 4:12 pm (`holiday`).
        {
            key: "holiday-box",
            photo: "festive",
            name: "Holiday pastry box",
            price: "$36.00",
        },
    ],
    /**
     * Its Tuesday's orders, for the drawings. Not in the seed, which makes 48
     * orders at random: these use its customers, products and prices, and
     * Global's ways to pay (at pick-up, by card at the counter, by card
     * online). Every one is an example.
     */
    orders: [
        {
            id: "ORD-041",
            customer: "Maya Thompson",
            items: "Sourdough loaf, large + cinnamon bun six-pack",
            total: "$33.00",
            placed: "By phone, Sun at 2:10 pm",
            pickup: "Today 11 am",
            paid: "No; she pays at pick-up",
            invoice: "made at pick-up",
            note: "sesame allergy",
        },
        {
            id: "ORD-043",
            customer: "Cedar Cup Cafe",
            items: "Chocolate truffle cake, 9 inch",
            total: "$68.00",
            placed: "Earlier",
            pickup: "Today 2 pm",
            paid: "Paid",
            invoice: "INV-0003",
        },
        {
            id: "ORD-044",
            customer: "Lucy Alvarez",
            items: "Lemon and blueberry cake",
            total: "$44.00",
            placed: "Earlier",
            pickup: "Today 3:30 pm",
            paid: "Pays by card online at 1:06 pm",
            invoice: "INV-0005",
        },
        {
            id: "ORD-045",
            customer: "Ben Carter",
            items: "Rosemary focaccia + 2 cinnamon buns",
            total: "$17.00",
            placed: "Phoned in at 9:14 am, written in once",
            pickup: "Today 12 pm",
            paid: "Pays at pick-up",
            invoice: "made at pick-up",
        },
    ],
};

const LARKSPUR: WorldBusiness = {
    key: "larkspur",
    trade: "salon",
    /** The drawn stand-in for its own photo (`kit/drawn-photo`). */
    photo: "salon",
    name: "Larkspur & Vane",
    kind: "salon",
    owner: "Imogen Vane",
    place: "14 Sample Yard, Bristol",
    site: "larkspur-and-vane.saroh.app",
    plan: "Free",
    look: TRADE_LOOKS.salon,
    customers: [
        {
            name: "Hannah Clarke",
            note: "Allergic to PPD: patch test before any colour. Books Thursdays after work. 9 visits",
        },
        { name: "George Whitlock", note: "6 visits" },
        { name: "Amelia Rowe", note: "5 visits" },
    ],
    items: [
        {
            key: "cut",
            photo: "salon",
            name: "Cut and blow-dry",
            price: "£58.00",
            unit: "60 min",
        },
        { key: "blow", photo: "salon", name: "Blow-dry", price: "£34.00" },
        { key: "gents", photo: "salon", name: "Gents' cut", price: "£32.00" },
        { key: "roots", photo: "salon", name: "Root colour", price: "£85.00" },
        { key: "balayage", photo: "salon", name: "Balayage", price: "£165.00" },
    ],
};

const IRONVALE: WorldBusiness = {
    key: "ironvale",
    trade: "gym",
    /** The drawn stand-in for its own photo (`kit/drawn-photo`). */
    photo: "gym",
    name: "Ironvale Fitness",
    kind: "gym",
    owner: "Jordan Reyes",
    place: "2400 Sample Avenue, Denver, CO",
    site: "ironvale-fitness.saroh.app",
    plan: "Free",
    look: TRADE_LOOKS.gym,
    customers: [
        {
            name: "Alex Romero",
            note: "Old shoulder injury: scale overhead pressing. Training for a first 10K. 6 visits",
        },
        { name: "Nora Bennett", note: "4 visits" },
        { name: "Marcus Hale", note: "3 visits" },
    ],
    items: [
        { key: "pt", photo: "gym", name: "Personal training", price: "$75.00" },
        {
            key: "assess",
            photo: "gym",
            name: "Movement assessment",
            price: "$45.00",
        },
        {
            key: "strength",
            photo: "gym",
            name: "Strength class",
            price: "$22.00",
            unit: "up to 12",
        },
        {
            key: "yoga",
            photo: "gym",
            name: "Yoga flow",
            price: "$20.00",
            unit: "up to 14",
        },
    ],
};

/**
 * Bramble & Bloom, a florist: not in the Global seed. Drawn only where a
 * page offers a trade switch (the Features hero's Florist, as saroh.in's
 * Petal Lane is), so saroh.tech's switch has the trades its /solutions does
 * (owner, 16 Nov 2026, #19). Its name, address and prices are made up.
 */
const BRAMBLE: WorldBusiness = {
    key: "bramble",
    trade: "florist",
    name: "Bramble & Bloom",
    kind: "florist",
    owner: "Hazel",
    place: "Sample Lane, Portland, OR",
    site: "bramble-and-bloom.saroh.app",
    plan: "Free",
    look: TRADE_LOOKS.florist,
    customers: [{ name: "Theo Grant" }, { name: "Maya Collins" }],
    items: [
        {
            key: "roses-12",
            name: "Red rose bouquet",
            price: "$65.00",
            unit: "12 stems",
        },
        {
            key: "lilies",
            name: "Mixed lily bouquet",
            price: "$55.00",
            unit: "12 stems",
        },
        { key: "table", name: "Table flowers", price: "$48.00" },
    ],
};

export const WORLD: World = {
    edition: "global",
    // Thistlewick is closed on Mondays (the seed's hours), so its day is a Tuesday.
    today: "Tuesday 17 Nov 2026",
    date: "2026-11-17",
    hours: "Tuesday to Sunday, from 7 am. Closed Mondays.",
    money: {
        provider: "Stripe",
        method: "card",
        taxName: "Sales tax",
        taxLine: "5.5%",
        taxId: "00-0000000",
    },
    lead: THISTLEWICK,
    // The florist is drawn only (not in the Global seed); last, so
    // `[salon, gym] = others` still reads the seeded two.
    others: [LARKSPUR, IRONVALE, BRAMBLE],
};

/**
 * Thistlewick's Tuesday beyond its items: the facts the Reach and Ask pages
 * draw (Website, Share and posts, Ask AI, AI apps), as `RYE_MONDAY` is
 * saroh.in's. Each says where it comes from; "not in the seed" marks a fact
 * the drawings need that `db:seed:global` doesn't hold.
 */
export const THISTLEWICK_TUESDAY = {
    /**
     * Not in the seed (it prices the six-pack at $24.00): on Monday, the
     * bakery's closed day, Clara puts the six-pack up to $25.00; Tuesday at
     * 7 am the site already says it.
     */
    priceChange: { item: "cinnamon-six", from: "$24.00", to: "$25.00" },
    /** The best seller this week; the count is not in the seed. */
    topSeller: { item: "cinnamon-bun", sold: 52 },
    /**
     * Not in the seed, and examples as every drawing says: this morning's
     * counts (the seed's stock levels), a class (the seed's bakery runs
     * none), the week's figures, and the landing's post, key and webhook.
     */
    stock: [
        { item: "focaccia", left: 4, of: 12, note: "from this morning's bake" },
        { item: "cinnamon-bun", left: 30 },
        // The seed's six-packs: 1 at the counter, 3 kept for online orders.
        { item: "cinnamon-six", left: 4 },
        { item: "sourdough", left: 24 },
    ],
    class: {
        name: "Sourdough at home",
        when: "Sat 21 Nov, 10 am",
        places: 8,
        booked: 5,
        price: "$45.00",
    },
    week: { takings: "$3,180", orders: 62, change: "up 9% on last week" },
    weekSales: [
        { item: "cinnamon-bun", sold: 52, total: "$234.00" },
        { item: "sourdough", sold: 38, total: "$342.00" },
    ],
    paidYesterday: "$412.50",
    scheduledPost: { when: "Thu, 6 pm", where: "Instagram" },
    apiKey: { name: "Key for the accounts sheet", ends: "4c1e" },
    webhook: { event: "When an order is paid", to: "Send it to your sheet" },
    /** The product Share makes a post of, and the ones its sheet lists. */
    featured: "cinnamon-six",
    shareItems: ["cinnamon-six", "sourdough", "truffle-cake"],
    /** The landing's list: today's, due first, one of each state. */
    todayRows: ["ORD-041", "ORD-043", "ORD-044"],
    /** Lucy's cake: the payment the money story follows. */
    paidOrder: "ORD-044",
    toMake: ["ORD-043", "ORD-044"],
    unpaidOrder: "ORD-044",
    /** The holiday menu as `WorldStory` names it: the box and the truffle cake. */
    christmas: {
        at: "16:12",
        items: ["holiday-box", "truffle-cake"],
        page: "/holiday",
    },
    /**
     * The holiday pastry box: the seed's draft invoice to Cedar Cup Cafe
     * bills it at $36.00. Not in the seed: at 4:12 pm, closing up, Clara asks
     * Claude to add it, with the truffle cake, on a /holiday page as drafts.
     */
    holiday: {
        at: "16:12",
        box: { name: "Holiday pastry box", price: "$36.00" },
        page: "/holiday",
    },
    /** A cake made to order, as the seed describes it. */
    cakeNotice: "two days' notice",
    /** The seed's hours, as the site's Visit us shows them. */
    hours: [
        ["Tuesday to Thursday", "7:00 am to 4:00 pm"],
        ["Friday", "7:00 am to 5:00 pm"],
        ["Saturday", "8:00 am to 3:00 pm"],
        ["Sunday", "8:00 am to 1:00 pm"],
    ],
} as const satisfies WorldStory & Record<string, unknown>;

/**
 * The trade looks the Reach pages switch between (Website's "pick its
 * colours", Share's salon cards): a salon's, a gym's and a florist's template
 * colours, the same drawings saroh.in uses for those trades. The Global
 * seed sets no theme, so these are template looks, never a business's own.
 */
export const TEMPLATE_LOOKS: Record<"salon" | "gym" | "florist", SiteLook> = {
    salon: TRADE_LOOKS.salon,
    gym: TRADE_LOOKS.gym,
    florist: TRADE_LOOKS.florist,
};

const priced = (b: WorldBusiness, key: string) => {
    const i = b.items.find((x) => x.key === key);
    return i ? `${i.price}${i.unit ? ` · ${i.unit}` : ""}` : "";
};
const named = (b: WorldBusiness, key: string) =>
    b.items.find((x) => x.key === key)?.name ?? key;
const photoOf = (b: WorldBusiness, key: string) =>
    b.items.find((x) => x.key === key)?.photo;

/**
 * The landing hero's three phones for each trade (saroh.in's
 * `HOME_HERO_SCENES`, same slots): the customer on the business's site, the
 * owner's morning on Saroh's Home, and the customer's done screen. Global's
 * customers pay at the visit or by card; nothing here is a plan's.
 */
export const HOME_HERO_SCENES: readonly HomeHeroScene[] = [
    {
        trade: "bakery",
        business: THISTLEWICK,
        caption:
            "Example: Thistlewick Bakery in Madison. The customer orders on the left and right; Clara sees her morning in the middle.",
        site: {
            time: "9:41",
            hero: "Bread and pastry, baked before you wake.",
            items: [
                {
                    name: named(THISTLEWICK, "cinnamon-six"),
                    line: priced(THISTLEWICK, "cinnamon-six"),
                    photo: photoOf(THISTLEWICK, "cinnamon-six"),
                },
                {
                    name: named(THISTLEWICK, "sourdough"),
                    line: priced(THISTLEWICK, "sourdough"),
                    photo: photoOf(THISTLEWICK, "sourdough"),
                },
            ],
            note: "Pick up today, from 11 am",
            action: "Order for pick-up",
        },
        home: {
            time: "7:02",
            greeting: "Good morning, Clara",
            summary: "Tuesday · 3 things need you",
            rows: [
                {
                    icon: "bag",
                    title: "2 cakes to make today",
                    line: "ORD-043, ORD-044",
                },
                {
                    icon: "alert",
                    title: "Lucy hasn't paid",
                    line: "ORD-044 · $44.00",
                    warn: true,
                },
                {
                    icon: "box",
                    title: "Rosemary focaccia running low",
                    line: "4 left of 12",
                },
            ],
            paid: { title: "Paid yesterday", line: "$412.50" },
        },
        done: {
            time: "9:43",
            title: "Order placed",
            line: `${named(THISTLEWICK, "cinnamon-six")}, ${THISTLEWICK.name}`,
            rows: [
                ["Pick up", "Today, 11 am"],
                ["Pay", "At pick-up"],
                ["Order", "ORD-046"],
            ],
            back: "Back to Thistlewick",
        },
    },
    {
        trade: "salon",
        business: LARKSPUR,
        caption:
            "Example: Larkspur & Vane, a salon in Bristol. The client books on the left and right; Imogen sees her day in the middle.",
        site: {
            time: "8:41",
            hero: "Cut, colour and blow-dry, by appointment.",
            items: [
                {
                    name: named(LARKSPUR, "cut"),
                    line: priced(LARKSPUR, "cut"),
                    photo: photoOf(LARKSPUR, "cut"),
                },
                {
                    name: named(LARKSPUR, "blow"),
                    line: priced(LARKSPUR, "blow"),
                    photo: photoOf(LARKSPUR, "blow"),
                },
            ],
            note: "Thursday, 5:30 pm",
            action: `Book · ${LARKSPUR.items[0]?.price ?? ""}`,
        },
        home: {
            time: "8:02",
            greeting: "Good morning, Imogen",
            summary: "Tuesday · 3 things need you",
            rows: [
                {
                    icon: "calendar",
                    title: "5 appointments today",
                    line: "First one at 9:30 am",
                },
                {
                    icon: "alert",
                    title: "Patch test before Hannah's colour",
                    line: "Allergic to PPD · Thu 5:30 pm",
                    warn: true,
                },
                {
                    icon: "user",
                    title: "George moved to 12 pm",
                    line: named(LARKSPUR, "gents"),
                },
            ],
        },
        done: {
            time: "8:43",
            title: "Booked",
            line: `${named(LARKSPUR, "cut")} at ${LARKSPUR.name}`,
            rows: [
                ["When", "Thu, 5:30 pm"],
                ["Pay", "At the visit"],
                ["Length", "60 min"],
            ],
            back: "Back to Larkspur & Vane",
        },
    },
    {
        trade: "gym",
        business: IRONVALE,
        caption:
            "Example: Ironvale Fitness, a gym in Denver. The member books a class on the left and right; Jordan sees the day in the middle.",
        site: {
            time: "5:41",
            hero: "Small classes. Real coaching.",
            items: [
                {
                    name: "Strength class · Mon 5:30 pm",
                    line: "4 places left",
                    photo: IRONVALE.photo,
                },
                {
                    name: "Yoga flow · Sat 9 am",
                    line: "Full",
                    photo: IRONVALE.photo,
                },
            ],
            note: "Monday, 5:30 pm",
            action: "Book Strength",
        },
        home: {
            time: "5:32",
            greeting: "Good morning, Jordan",
            summary: "Tuesday · 3 things need you",
            rows: [
                {
                    icon: "calendar",
                    title: "Yoga flow on Saturday is full",
                    line: "14 of 14 booked",
                },
                {
                    icon: "alert",
                    title: "Alex: scale overhead pressing",
                    line: "Old shoulder injury · PT at 7 am",
                    warn: true,
                },
                {
                    icon: "user",
                    title: "Nora booked a movement assessment",
                    line: named(IRONVALE, "assess"),
                },
            ],
        },
        done: {
            time: "5:43",
            title: "Booked",
            line: `Strength class at ${IRONVALE.name}`,
            rows: [
                ["When", "Mon, 5:30 pm"],
                ["Pay", "At the class"],
                ["Places left", "3"],
            ],
            back: "Back to Ironvale",
        },
    },
];

/** The landing's example sites, each as its owner wrote it (the seed's words where it has them). */
export const HOME_SITE_SHOWCASE: readonly SiteShowcase[] = [
    {
        business: THISTLEWICK,
        address: THISTLEWICK.site,
        nav: ["Order", "Visit"],
        cta: "Order",
        hero: {
            title: "Bread and pastry, baked before you wake.",
            line: "Tuesday to Sunday, from 7 am. Order for pick-up, or stop by the counter.",
        },
        items: [
            {
                name: named(THISTLEWICK, "cinnamon-six"),
                price: priced(THISTLEWICK, "cinnamon-six"),
                drawn: photoOf(THISTLEWICK, "cinnamon-six"),
            },
            {
                name: named(THISTLEWICK, "sourdough"),
                price: priced(THISTLEWICK, "sourdough"),
                drawn: photoOf(THISTLEWICK, "sourdough"),
            },
        ],
    },
    {
        business: LARKSPUR,
        address: LARKSPUR.site,
        nav: ["Services", "Book"],
        cta: "Book",
        hero: {
            title: "Cut, colour and blow-dry, by appointment.",
            line: "Pick a time that's free and book it.",
        },
        items: ["cut", "roots"].map((k) => ({
            name: named(LARKSPUR, k),
            price: priced(LARKSPUR, k),
            drawn: photoOf(LARKSPUR, k),
        })),
    },
    {
        business: IRONVALE,
        address: IRONVALE.site,
        nav: ["Classes", "Coaching", "Book"],
        cta: "Book",
        hero: {
            title: "Small classes. Real coaching.",
            line: "Book a class and see the places left.",
        },
        items: [
            {
                name: "Strength class · Mon 5:30 pm",
                price: "4 places left",
                drawn: IRONVALE.photo,
            },
            {
                name: "Yoga flow · Sat 9 am",
                price: "Full",
                drawn: IRONVALE.photo,
            },
        ],
    },
];
