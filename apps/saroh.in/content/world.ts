import type { HomeHeroScene } from "@saroh/marketing/home/hero-stage";
import type { DrawnPhotoKind } from "@saroh/marketing/kit/drawn-photo";
import type { SiteLook } from "@saroh/marketing/kit/site-drawing";
import { TRADE_LOOKS } from "@saroh/marketing/kit/trade-looks";
import type { World, WorldBusiness } from "@saroh/marketing/world";

export type { HomeHeroScene };

/**
 * saroh.in's example world (DEC-221): every name, number, time and address
 * a drawn moment shows, exactly as WORLD.md's LOCKED (round 5) table holds
 * them. Everything is an example and every page says so. A fact a page needs
 * that isn't here is added here first, in the same style.
 *
 * Merchant looks are each site's own `--site-*` colours (HSL channels) and
 * fonts: never Saroh's. A page that draws a site loads its fonts and sets
 * `--font-site-serif` and `--font-site-sans`.
 */

const SERIF = "var(--font-site-serif), Georgia, serif";
const SANS = "var(--font-site-sans), ui-sans-serif, system-ui, sans-serif";

const RYE_LOOK: SiteLook = TRADE_LOOKS.bakery;

/** Rye & Co., the lead: Asha's Monday is every story's home. */
const RYE: WorldBusiness = {
    key: "rye",
    photo: "buns",
    trade: "bakery",
    name: "Rye & Co.",
    kind: "home bakery",
    owner: "Asha",
    staff: [{ name: "Ravi", note: "Counter" }],
    place: "Hill Road, Bengaluru",
    site: "rye-and-co.saroh.app",
    domain: "ryeandco.in",
    plan: "Grow",
    tradePage: "/for/home-bakers",
    look: RYE_LOOK,
    orderRange: ["ORD-1041", "ORD-1090"],
    invoiceRange: ["INV-0310", "INV-0330"],
    customers: [
        {
            name: "Meera Iyer",
            note: "Regular, 14 orders, always pays at pick-up",
        },
        { name: "Divya Rao", note: "Rose pistachio cake, paid, INV-0317" },
        {
            name: "Anjali Shah",
            note: "Rose pistachio cake ₹1,450, ORD-1044, pays the link at 4:06 pm, INV-0321",
        },
        {
            name: "Neha Gupta",
            note: "9:14 am WhatsApp order, black forest ₹950, nut allergy, ORD-1045",
        },
        { name: "Arjun Kulkarni", note: "2 cardamom bun boxes, ORD-1046" },
        { name: "Priya Nair", note: "Sesame allergy, ORD-1047" },
        {
            name: "Kavya Menon",
            note: "Birthday cake for Sat 21 Nov, 10 orders, last one today",
        },
    ],
    items: [
        {
            key: "sourdough",
            photo: "loaf",
            name: "Sourdough loaf",
            price: "₹220",
        },
        {
            key: "bun-box",
            photo: "buns",
            name: "Cardamom bun box",
            price: "₹360",
            unit: "box of 6",
        },
        {
            key: "rose-pistachio",
            photo: "brownies",
            name: "Rose pistachio cake",
            price: "₹1,450",
            unit: "1 kg",
        },
        {
            key: "black-forest",
            photo: "brownies",
            name: "Black forest cake",
            price: "₹950",
            unit: "500 g",
        },
        {
            key: "brownie-box",
            photo: "brownies",
            name: "Brownie box",
            price: "₹300",
            unit: "box of 6",
        },
        // The Christmas menu, added as drafts at 6:12 pm.
        {
            key: "plum-cake",
            photo: "festive",
            name: "Plum cake",
            price: "₹650",
            unit: "500 g",
        },
        {
            key: "hamper",
            photo: "festive",
            name: "Christmas hamper",
            price: "₹1,200",
        },
    ],
    orders: [
        {
            id: "ORD-1041",
            customer: "Meera Iyer",
            items: "Black forest 500 g + sourdough",
            total: "₹1,170",
            placed: "Earlier",
            pickup: "Today 11 am",
            paid: "No; she pays at pick-up",
            invoice: "issued at pick-up",
        },
        {
            id: "ORD-1043",
            customer: "Divya Rao",
            items: "Rose pistachio cake 1 kg",
            total: "₹1,450",
            placed: "Earlier",
            pickup: "Today 2 pm",
            paid: "Paid",
            invoice: "INV-0317",
        },
        {
            id: "ORD-1044",
            customer: "Anjali Shah",
            items: "Rose pistachio cake 1 kg",
            total: "₹1,450",
            placed: "Earlier",
            pickup: "Today 5 pm",
            paid: "Pays the link at 4:06 pm",
            invoice: "INV-0321",
        },
        {
            id: "ORD-1045",
            customer: "Neha Gupta",
            items: "Black forest 500 g",
            total: "₹950",
            placed: "WhatsApp, typed in at 9:14 am",
            pickup: "Today 5 pm (moved from 4 pm at 9:20 am)",
            paid: "Paid by link at 9:31 am",
            invoice: "INV-0319",
            note: "nut allergy",
        },
        {
            id: "ORD-1046",
            customer: "Arjun Kulkarni",
            items: "2 cardamom bun boxes",
            total: "₹720",
            placed: "Earlier",
            pickup: "Today, ready 9:45 am (late 30 min, not collected yet at 10:15)",
            paid: "Paid",
            invoice: "INV-0316",
        },
        {
            id: "ORD-1047",
            customer: "Priya Nair",
            items: "Sourdough + bun box",
            total: "₹580",
            placed: "9:42 am",
            pickup: "Today 12 pm",
            paid: "Paid",
            invoice: "INV-0318",
            note: "sesame allergy",
        },
        {
            id: "ORD-1048",
            customer: "Kavya Menon",
            items: "Rose pistachio cake 1 kg, birthday",
            total: "₹1,450",
            placed: "Her website at 10:14 am",
            pickup: "Sat 21 Nov 11 am",
            paid: "Paid by UPI",
            invoice: "INV-0320",
        },
        {
            id: "ORD-1049",
            customer: "A web customer (unnamed)",
            items: "Bun box + sourdough",
            total: "₹580",
            placed: "Website, Mon evening",
            pickup: "Tue 8 am",
            paid: "Paid by UPI",
            invoice: "sent to email",
        },
    ],
    day: [
        {
            at: "07:00",
            line: "Home: 3 cakes to bake, 1 unpaid (Anjali), brownies low",
            feature: "dashboard",
        },
        {
            at: "09:00",
            line: "Neha's WhatsApp order, written in once",
            feature: "orders",
        },
        {
            at: "10:00",
            line: "A cake ordered on her own website",
            feature: "website",
        },
        { at: "13:00", line: "The bun box becomes a post", feature: "social" },
        {
            at: "16:00",
            line: "₹1,450 lands; the bill writes itself",
            feature: "billing",
        },
        {
            at: "18:00",
            line: "She asks Claude for the Christmas menu",
            feature: "ai-apps",
        },
        {
            at: "21:00",
            line: "She asks what sold most this week",
            feature: "ask-ai",
        },
        {
            at: "07:00",
            anchor: "tue7am",
            label: "Tue 7 am",
            line: "It's all waiting for her",
            feature: "dashboard",
        },
    ],
};

/** The other trades a page's switcher offers (Bakery · Salon · Gym · Florist). */
const NEEL: WorldBusiness = {
    key: "neel",
    photo: "salon",
    trade: "salon",
    name: "Studio Neel",
    kind: "salon",
    owner: "Neel",
    place: "Bengaluru",
    site: "studio-neel.saroh.app",
    look: TRADE_LOOKS.salon,
    customers: [{ name: "Ishita Rao" }, { name: "Tanvi Desai" }],
    // The landing's site drawing and hero (round 4 boards).
    items: [
        {
            key: "keratin",
            photo: "salon",
            name: "Keratin smoothing",
            price: "₹2,800",
            unit: "90 min",
        },
        {
            key: "haircut",
            photo: "salon",
            name: "Haircut and finish",
            price: "₹900",
            unit: "45 min",
        },
    ],
};

const PULSE: WorldBusiness = {
    key: "pulse",
    photo: "gym",
    trade: "gym",
    name: "Pulse Fitness",
    kind: "gym",
    owner: "",
    place: "Bengaluru",
    site: "pulse-fitness.saroh.app",
    look: TRADE_LOOKS.gym,
    customers: [{ name: "Rohan Mehta" }, { name: "Sana Qureshi" }],
    items: [],
};

/** Petal Lane, the florist: a built day of its own (`/for/florists`). */
const PETAL: WorldBusiness = {
    key: "petal",
    trade: "florist",
    name: "Petal Lane",
    kind: "florist",
    owner: "Zoya",
    place: "Indiranagar, Bengaluru",
    site: "petal-lane.saroh.app",
    tradePage: "/for/florists",
    orderRange: ["ORD-0514", "ORD-0530"],
    invoiceRange: ["INV-0228", "INV-0230"],
    look: {
        bg: "26.7 52.9% 96.7%",
        surface: "6.7 42.9% 91.8%",
        fg: "345 23.5% 13.3%",
        muted: "333.6 12.8% 38.2%",
        accent: "350.1 57.2% 39.4%",
        accentFg: "26.7 52.9% 96.7%",
        fontHeading: SERIF,
        fontBody: SANS,
        headingWeight: 600,
        radius: 10,
    },
    customers: [
        {
            name: "Kabir Malhotra",
            note: "Anniversary roses, ORD-0518, 24 stems",
        },
        {
            name: "Saffron Court Hotel",
            note: "Weekly flowers, ₹8,800, INV-0228",
        },
        {
            name: "Ritika Sen",
            note: "Wedding enquiry from the Weddings page, Sun 13 Dec, Whitefield; came in Sun 10:52 pm, prices sent Mon 11:08 am, follow-up Thu 19 Nov",
        },
        {
            name: "Aditi Bhatt",
            note: "ORD-0519, lilies for her mother, ordered on the site at 2:41 pm, delivered 6 to 8 pm, INV-0230",
        },
        { name: "Sneha Pillai" },
        { name: "Kavita Joshi" },
        { name: "Rahul Bose" },
    ],
    items: [
        {
            key: "red-rose-12",
            name: "Red rose bouquet",
            price: "₹1,200",
            unit: "12 stems",
        },
        {
            key: "red-rose-24",
            name: "Red rose bouquet",
            price: "₹2,200",
            unit: "24 stems",
        },
        {
            key: "mixed-lily",
            name: "Mixed lily bouquet",
            price: "₹1,650",
            unit: "12 stems",
        },
        {
            key: "table-flowers",
            name: "Table flowers",
            price: "₹2,200",
            unit: "a piece",
        },
        { key: "bridal-bouquet", name: "Bridal bouquet", price: "₹6,500" },
    ],
    // Monday's list at 9:14 am (`/for/florists`), and Aditi's at 2:41 pm.
    orders: [
        {
            id: "ORD-0518",
            customer: "Kabir Malhotra",
            items: "Red rose bouquet, 24 stems",
            total: "₹2,200",
            placed: "A phone call at 9:12 am, written in at 9:14 am",
            pickup: "Delivery today, 6 to 7 pm, Indiranagar",
            paid: "Pays on the link",
            invoice: "issued when paid",
            note: "no lilies",
        },
        {
            id: "ORD-0517",
            customer: "Sneha Pillai",
            items: "Red rose bouquet, 12 stems",
            total: "₹1,200",
            placed: "WhatsApp",
            pickup: "Pick-up today, 5 pm",
            paid: "Paid",
            invoice: "issued",
        },
        {
            id: "ORD-0516",
            customer: "Saffron Court Hotel",
            items: "Weekly flowers, 4 items",
            total: "₹8,800",
            placed: "Weekly",
            pickup: "Delivery today, 11 am, lobby and front desk",
            paid: "Pays the link at 4:06 pm",
            invoice: "INV-0228",
        },
        {
            id: "ORD-0515",
            customer: "Kavita Joshi",
            items: "Mixed lily bouquet, 12 stems",
            total: "₹1,650",
            placed: "Instagram DM",
            pickup: "Delivery today, 4 to 5 pm",
            paid: "Paid",
            invoice: "issued",
        },
        {
            id: "ORD-0514",
            customer: "Rahul Bose",
            items: "2 items",
            total: "₹2,850",
            placed: "WhatsApp",
            pickup: "Pick-up Tue 17 Nov, 10 am",
            paid: "Not yet",
            invoice: "issued when paid",
        },
        {
            id: "ORD-0519",
            customer: "Aditi Bhatt",
            items: "Mixed lily bouquet, 12 stems",
            total: "₹1,650",
            placed: "Her website at 2:41 pm",
            pickup: "Delivery today, 6 to 8 pm, Koramangala",
            paid: "Paid by UPI",
            invoice: "INV-0230",
        },
    ],
    day: [
        { at: "06:00", line: "Home", feature: "dashboard" },
        {
            at: "09:00",
            line: "Kabir's call: 24 stems, ORD-0518",
            feature: "orders",
        },
        { at: "11:00", line: "Ritika's wedding enquiry", feature: "customers" },
        { at: "13:00", line: "The roses become a post", feature: "social" },
        { at: "15:00", line: "Aditi's order on the site", feature: "website" },
        { at: "16:00", line: "The hotel pays", feature: "billing" },
        {
            at: "21:00",
            line: "ChatGPT counts tomorrow's roses",
            feature: "ai-apps",
        },
    ],
};

export const WORLD: World = {
    edition: "india",
    today: "Monday 16 Nov 2026",
    date: "2026-11-16",
    hours: "Open 7 am to 8 pm. Cake orders by 8 pm for the next day.",
    money: {
        provider: "Razorpay",
        otherProviders: "Cashfree, or Stripe abroad",
        method: "UPI",
        taxName: "GST",
        taxLine: "CGST + SGST",
        taxId: "29AAAAA0000A1ZY",
    },
    lead: RYE,
    others: [NEEL, PULSE, PETAL],
};

/** Rye & Co.'s Monday beyond its orders: the facts a scene draws. */
export const RYE_MONDAY = {
    /** 7 am stock: cakes are made to order and never counted. */
    stock: [
        { item: "brownie-box", left: 2, of: 12, note: "from yesterday's bake" },
        { item: "bun-box", left: 38 },
        { item: "sourdough", left: 6 },
    ],
    class: {
        name: "Sourdough basics",
        when: "Sat 21 Nov, 10 am",
        places: 8,
        booked: 6,
        price: "₹1,800",
    },
    week: { takings: "₹48,200", orders: 68, change: "up 12% on last week" },
    topSeller: { item: "bun-box", sold: 46 },
    /** The product Share makes a post of, and the ones its sheet lists. */
    featured: "bun-box",
    shareItems: ["bun-box", "sourdough", "rose-pistachio"],
    /** The landing's list: today's, due first, one of each state. */
    todayRows: ["ORD-1041", "ORD-1045", "ORD-1044"],
    /** Anjali's cake: the payment the money story follows. */
    paidOrder: "ORD-1044",
    /** 7 am Home: the cakes ordered earlier, to bake today, and who hasn't paid. */
    toMake: ["ORD-1041", "ORD-1043", "ORD-1044"],
    unpaidOrder: "ORD-1044",
    /** 9:45 am, between bakes: "Aaj ke orders ke liye sab ready hai?" */
    askAt945: { pickups: 6, paid: 4, bunBoxesInStock: 38, bunBoxesNeeded: 2 },
    /** 9 pm: "Bun box ₹380 kar do"; on her site Tuesday morning. */
    priceChange: { item: "bun-box", from: "₹360", to: "₹380" },
    /** 6:12 pm: the Christmas menu as drafts, on a /christmas page she approves. */
    christmas: {
        at: "18:12",
        items: ["plum-cake", "hamper"],
        page: "/christmas",
    },
    /** The landing (round 4): what Home says came in yesterday. */
    paidYesterday: "₹4,860",
    /** The landing's Ask AI answer: this week's two best sellers. */
    weekSales: [
        { item: "bun-box", sold: 46, total: "₹16,560" },
        { item: "sourdough", sold: 31, total: "₹6,820" },
    ],
    /** The landing's post, scheduled by Saroh Social. */
    scheduledPost: { when: "Thu, 6 pm", where: "Instagram" },
    /** The landing's API key and webhook. */
    apiKey: { name: "Key for the accounts sheet", ends: "7f2a" },
    webhook: { event: "When an order is paid", to: "Send it to your sheet" },
} as const;

const itemLine = (b: WorldBusiness, key: string) => {
    const i = b.items.find((x) => x.key === key);
    return i ? `${i.price}${i.unit ? ` · ${i.unit}` : ""}` : "";
};
const itemPhoto = (b: WorldBusiness, key: string) =>
    b.items.find((x) => x.key === key)?.photo;
const itemName = (b: WorldBusiness, key: string) =>
    b.items.find((x) => x.key === key)?.name ?? key;
const ORD_1044 = RYE.orders?.find((o) => o.id === "ORD-1044");
const ORD_1049 = RYE.orders?.find((o) => o.id === "ORD-1049");

export const HOME_HERO_SCENES: readonly HomeHeroScene[] = [
    {
        trade: "bakery",
        business: RYE,
        caption:
            "Example: Rye & Co., a bakery on Hill Road. The customer orders and pays on the left and right; Asha sees her morning in the middle.",
        site: {
            time: "9:41",
            hero: "Baked this morning on Hill Road",
            items: [
                {
                    name: itemName(RYE, "bun-box"),
                    line: itemLine(RYE, "bun-box"),
                    photo: itemPhoto(RYE, "bun-box"),
                },
                {
                    name: itemName(RYE, "sourdough"),
                    line: itemLine(RYE, "sourdough"),
                    photo: itemPhoto(RYE, "sourdough"),
                },
            ],
            note: "Pick up tomorrow, 8 am",
            action: `Place order · ${ORD_1049?.total ?? ""}`,
        },
        home: {
            time: "7:02",
            greeting: `Good morning, ${RYE.owner}`,
            summary: "Monday · 3 things need you",
            rows: [
                {
                    icon: "bag",
                    title: "Bake 3 cakes",
                    line: "First pick-up at 11 am",
                },
                {
                    icon: "alert",
                    title: "Anjali hasn't paid yet",
                    line: `${ORD_1044?.id ?? ""} · ${ORD_1044?.total ?? ""}`,
                    warn: true,
                },
                {
                    icon: "box",
                    title: "Brownie box is low",
                    line: "2 left of 12",
                },
            ],
            paid: {
                title: `${RYE_MONDAY.paidYesterday} paid in yesterday`,
                line: `Into your own ${WORLD.money.provider} account`,
            },
        },
        done: {
            time: "9:43",
            title: `Paid ${ORD_1049?.total ?? ""}`,
            line: `to ${RYE.name} by ${WORLD.money.method}`,
            rows: [
                ["Order", ORD_1049?.id ?? ""],
                ["Pick up", "Tue, 8 am"],
                ["Invoice", "Sent to email"],
            ],
            back: "Back to the shop",
        },
    },
    {
        trade: "salon",
        business: NEEL,
        caption:
            "Example: Studio Neel, a salon. The client books and pays on the left and right; Neel sees the day in the middle.",
        site: {
            time: "9:41",
            hero: "Hair and skin, by appointment",
            items: [
                {
                    name: itemName(NEEL, "keratin"),
                    line: itemLine(NEEL, "keratin"),
                    photo: itemPhoto(NEEL, "keratin"),
                },
                {
                    name: itemName(NEEL, "haircut"),
                    line: itemLine(NEEL, "haircut"),
                    photo: itemPhoto(NEEL, "haircut"),
                },
            ],
            note: "Tomorrow, 11 am with Neel",
            action: `Book · ${NEEL.items[1]?.price ?? ""}`,
        },
        home: {
            time: "8:02",
            greeting: `Good morning, ${NEEL.owner}`,
            summary: "Monday · 3 things need you",
            rows: [
                {
                    icon: "calendar",
                    title: "6 appointments today",
                    line: "First one at 10 am",
                },
                {
                    icon: "alert",
                    title: "Tanvi hasn't paid her deposit",
                    line: `${itemName(NEEL, "keratin")} · 4 pm`,
                    warn: true,
                },
                {
                    icon: "user",
                    title: "Ishita moved to 12 pm",
                    line: itemName(NEEL, "haircut"),
                },
            ],
        },
        done: {
            time: "9:43",
            title: "Booked",
            line: `${itemName(NEEL, "haircut")} with ${NEEL.owner}`,
            rows: [
                ["When", "Tue, 11 am"],
                [
                    "Paid",
                    `${NEEL.items[1]?.price ?? ""} by ${WORLD.money.method}`,
                ],
                ["Invoice", "Sent to email"],
            ],
            back: "Back to Studio Neel",
        },
    },
    {
        trade: "gym",
        business: PULSE,
        caption:
            "Example: Pulse Fitness, a gym. The member books a class on the left and right; the front desk sees the day in the middle.",
        site: {
            time: "5:41",
            hero: "Train at 6 am. Or 7 pm.",
            items: [
                { name: "HIIT · 6 am", line: "4 places left" },
                { name: "Strength · 7 pm", line: "Full · waitlist" },
            ],
            note: "Tomorrow, 6 am",
            action: "Book HIIT",
        },
        home: {
            time: "5:32",
            greeting: "Good morning",
            summary: "Monday · 3 things need you",
            rows: [
                {
                    icon: "calendar",
                    title: "Strength at 7 pm is full",
                    line: "2 waiting for a place",
                },
                {
                    icon: "alert",
                    title: "Sana's membership is unpaid",
                    line: "Pay link sent",
                    warn: true,
                },
                {
                    icon: "user",
                    title: "Rohan's pack runs out",
                    line: "1 class left",
                },
            ],
        },
        done: {
            time: "5:43",
            title: "Booked",
            line: `HIIT at ${PULSE.name}`,
            rows: [
                ["When", "Tue, 6 am"],
                ["Paid", "From your class pack"],
                ["Places left", "3"],
            ],
            back: "Back to Pulse",
        },
    },
];

/**
 * The landing's example sites (round 4, LAHomeDesk "A website that looks
 * like your shop"): each business's own site as its owner wrote it.
 */
export const HOME_SITE_SHOWCASE: readonly {
    business: WorldBusiness;
    /** The address the frame shows: the own domain where there is one. */
    address: string;
    nav: readonly string[];
    cta: string;
    hero: { title: string; line: string };
    items: readonly { name: string; price: string; drawn?: DrawnPhotoKind }[];
}[] = [
    {
        business: RYE,
        address: RYE.domain ?? RYE.site,
        nav: ["Shop", "Classes", "Visit"],
        cta: "Order",
        hero: {
            title: "Baked this morning on Hill Road",
            line: "Open 7 am to 8 pm. Cake orders by 8 pm for the next day.",
        },
        items: [
            {
                name: itemName(RYE, "bun-box"),
                price: itemLine(RYE, "bun-box"),
                drawn: itemPhoto(RYE, "bun-box"),
            },
            {
                name: itemName(RYE, "sourdough"),
                price: itemLine(RYE, "sourdough"),
                drawn: itemPhoto(RYE, "sourdough"),
            },
        ],
    },
    {
        business: NEEL,
        address: NEEL.site,
        nav: ["Services", "Book"],
        cta: "Book",
        hero: {
            title: "Hair and skin, by appointment",
            line: "Pick a time with the stylist you want.",
        },
        items: NEEL.items.map((i) => ({
            name: i.name,
            price: `${i.price} · ${i.unit ?? ""}`,
            drawn: i.photo,
        })),
    },
    {
        business: PULSE,
        address: PULSE.site,
        nav: ["Classes", "Packs", "Join"],
        cta: "Join",
        hero: {
            title: "Train at 6 am. Or 7 pm.",
            line: "Book a class, see the places left.",
        },
        items: [
            { name: "HIIT · 6 am", price: "4 places left", drawn: PULSE.photo },
            {
                name: "Strength · 7 pm",
                price: "Full · waitlist",
                drawn: PULSE.photo,
            },
        ],
    },
];
