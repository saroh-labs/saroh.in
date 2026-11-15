import type { SiteLook } from "@saroh/marketing/kit/site-drawing";
import type { World, WorldBusiness } from "@saroh/marketing/world";

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

const RYE_LOOK: SiteLook = {
    bg: "36.5 51.1% 91.2%",
    surface: "35.3 68% 95.1%",
    fg: "28.4 28.4% 13.1%",
    muted: "30 21.6% 29%",
    accent: "17.7 62.3% 43.7%",
    accentFg: "35.3 68% 95.1%",
    fontHeading: SERIF,
    fontBody: SANS,
    headingWeight: 600,
    radius: 4,
};

/** Rye & Co., the lead: Asha's Monday is every story's home. */
const RYE: WorldBusiness = {
    key: "rye",
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
        { key: "sourdough", name: "Sourdough loaf", price: "₹220" },
        {
            key: "bun-box",
            name: "Cardamom bun box",
            price: "₹360",
            unit: "box of 6",
        },
        {
            key: "rose-pistachio",
            name: "Rose pistachio cake",
            price: "₹1,450",
            unit: "1 kg",
        },
        {
            key: "black-forest",
            name: "Black forest cake",
            price: "₹950",
            unit: "500 g",
        },
        {
            key: "brownie-box",
            name: "Brownie box",
            price: "₹300",
            unit: "box of 6",
        },
        // The Christmas menu, added as drafts at 6:12 pm.
        { key: "plum-cake", name: "Plum cake", price: "₹650", unit: "500 g" },
        { key: "hamper", name: "Christmas hamper", price: "₹1,200" },
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
    trade: "salon",
    name: "Studio Neel",
    kind: "salon",
    owner: "Neel",
    place: "Bengaluru",
    site: "studio-neel.saroh.app",
    look: {
        bg: "286.7 39.1% 13.5%",
        surface: "289.7 37.6% 18.2%",
        fg: "33.9 48.9% 90.8%",
        muted: "316.7 18.7% 81.2%",
        accent: "41.6 54% 53.9%",
        accentFg: "286.7 39.1% 13.5%",
        fontHeading: SANS,
        fontBody: SANS,
        headingWeight: 800,
        radius: 14,
    },
    customers: [{ name: "Ishita Rao" }, { name: "Tanvi Desai" }],
    items: [],
};

const PULSE: WorldBusiness = {
    key: "pulse",
    trade: "gym",
    name: "Pulse Fitness",
    kind: "gym",
    owner: "",
    place: "Bengaluru",
    site: "pulse-fitness.saroh.app",
    look: {
        bg: "150 10.5% 7.5%",
        surface: "140 9.7% 12.2%",
        fg: "85.7 20% 93.1%",
        muted: "100 8.2% 71.4%",
        accent: "74.5 84.7% 61.6%",
        accentFg: "150 10.5% 7.5%",
        fontHeading: SANS,
        fontBody: SANS,
        headingWeight: 700,
        radius: 8,
    },
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
} as const;
