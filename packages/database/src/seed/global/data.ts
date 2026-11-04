import { PHOTOS } from "../showcase/bakery-product-page";
import { RYE_CAKE_PHOTOS } from "../showcase/catalog-photos";

/**
 * The Global edition's demo businesses (global edition plan, U11), for
 * saroh.tech's screenshots: a shop, a salon, a gym and a clinic outside India.
 *
 * Everything is sample data. Emails are on example.com. US phones are in
 * 555-0100..0199 and UK ones in Ofcom's 0117 496 0xxx, both set aside for
 * fiction. Tax numbers say SAMPLE or are all zeros, and the businesses, people
 * and streets are made up. No GSTIN, no payment provider, nothing online: what
 * a Global business can do today. They sit on the Free plan, the only plan
 * Global can use (no working subscriptions, deposits or pay links).
 *
 * Each is what a new Free business has after setup and some real use: the
 * modules setup offers, no Payments, and one person: the owner, with no other
 * login or diary person, since each would take a team seat. Numbers stay inside
 * the limits of dev's catalogue (LOCAL_DEV), which aren't written here: the
 * repo is public.
 */

/** Orders a business takes in one calendar month. */
export const ORDERS_A_MONTH = 18;
/** Bookings customers make on its site in one calendar month. */
export const ONLINE_BOOKINGS_A_MONTH = 15;

export interface GlobalService {
    key: string;
    name: string;
    description: string;
    minutes: number;
    capacity: number;
    /** Smallest unit of the business's currency. */
    price: number;
    visits?: number;
    locationType?: "IN_PERSON" | "EITHER";
    meetingUrl?: string;
    /** Hidden from the booking page; the desk books it. */
    hidden?: boolean;
    /** Share of the day-to-day diary; 0 = only scenes and treatments. */
    weight: number;
    /** A class's fixed weekly starts; one-to-one services follow staff hours. */
    classAt?: readonly { days: readonly number[]; at: string }[];
    /** Places a class usually fills. */
    fill?: readonly [number, number];
}

export interface GlobalStaff {
    key: string;
    name: string;
    title: string;
    /** On the diary as the demo owner's own membership. */
    owner?: boolean;
    services: readonly string[];
    hours: readonly { days: readonly number[]; from: string; to: string }[];
}

export interface GlobalVariant {
    title: string;
    sku: string;
    price: string;
    /** On hand at each location, in the fixture's store order. */
    stock: readonly number[];
}

export interface GlobalProduct {
    slug: string;
    name: string;
    category: string;
    price: string;
    /** Struck-through "Original price". */
    was?: string;
    description: string;
    option?: string;
    variants?: readonly GlobalVariant[];
    /** On hand at each location; absent = doesn't count stock. */
    stock?: readonly number[];
    warnAt?: number;
    photos?: readonly {
        url: string;
        alt: string;
        width: number;
        height: number;
        creditName: string;
        creditUrl: string;
    }[];
    weight: number;
}

export interface GlobalRegular {
    key: string;
    first: string;
    last: string;
    attention?: readonly {
        kind: "ALLERGY" | "MEDICAL" | "ACCESS" | "OTHER";
        label: string;
        detail: string;
        sensitive: boolean;
    }[];
    notes?: readonly string[];
    /** A note from the booking page, waiting for the team to look. */
    bookingNote?: { label: string; detail: string };
    /** Visits to their name, on top of whatever the diary draws. */
    visits?: number;
    orders?: number;
}

export interface GlobalManualInvoice {
    key: string;
    billTo: string;
    email: string;
    lines: readonly { description: string; quantity: number; unit: number }[];
    daysAgo: number;
    dueInDays: number;
    /** Paid this many days after issue, by this method. */
    paid?: { after: number; method: "CASH" | "CARD" | "BANK_TRANSFER" };
    draft?: boolean;
    /** The tax line ("VAT 20%") on this paper. */
    taxed?: boolean;
}

export interface GlobalBusiness {
    key: string;
    name: string;
    slug: string;
    legalName: string;
    /** ISO 3166-1 alpha-2. */
    country: "US" | "GB";
    countryName: string;
    currency: "USD" | "GBP";
    zone: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    phone: (n: number) => string;
    contactEmail: string;
    taxName: string | null;
    taxRate: number | null;
    taxId: string | null;
    modules: readonly string[];
    invoiceStyle?: string;
    invoiceColour?: string;
    stores: readonly { key: string; name: string; kind?: "SHOP" | "ONLINE" }[];
    hours: readonly {
        day: string;
        open: string;
        close: string;
        closed: boolean;
    }[];
    services: readonly GlobalService[];
    staff: readonly GlobalStaff[];
    categories: readonly { key: string; name: string }[];
    options: readonly {
        key: string;
        name: string;
        values: readonly string[];
    }[];
    products: readonly GlobalProduct[];
    regulars: readonly GlobalRegular[];
    /** Generated people on top of the regulars. */
    people: number;
    orders: number;
    manualInvoices: readonly GlobalManualInvoice[];
    site: {
        heading: string;
        text: string;
        cta: { label: string; href: string };
        servicesHeading: string;
        features: {
            heading: string;
            items: readonly { title: string; body: string }[];
        };
        visit: string;
        footer: string;
    };
    rules: {
        bookAheadDays: number;
        latestBookingMinutes: number;
        freeCancelHours: number;
    };
}

const usPhone = (n: number) =>
    `+1202555${String(100 + (n % 100)).padStart(4, "0")}`;
const ukPhone = (n: number) => `+44117496${String(n % 1000).padStart(4, "0")}`;

const WEEK = [["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]] as const;
const hoursFrom = (rows: Record<string, readonly [string, string] | null>) =>
    WEEK[0].map((day) => {
        const r = rows[day];
        return r
            ? { day, open: r[0], close: r[1], closed: false }
            : { day, open: "09:00", close: "17:00", closed: true };
    });

const photo = (slug: string) => PHOTOS[slug];
const cake = (slug: string) => RYE_CAKE_PHOTOS[slug];

export const THISTLEWICK: GlobalBusiness = {
    key: "shop",
    name: "Thistlewick Bakery",
    slug: "thistlewick-bakery",
    legalName: "Thistlewick Bakery LLC",
    country: "US",
    countryName: "United States",
    currency: "USD",
    zone: "America/Chicago",
    addressLine1: "118 Sample Street",
    city: "Madison",
    state: "WI",
    postalCode: "53703",
    phone: usPhone,
    contactEmail: "hello.thistlewick@example.com",
    taxName: "Sales tax",
    taxRate: 5.5,
    taxId: "00-0000000",
    modules: ["COMMERCE", "CRM", "WEBSITE"],
    invoiceStyle: "CLASSIC",
    stores: [
        { key: "main", name: "Downtown" },
        { key: "online", name: "Online", kind: "ONLINE" },
    ],
    hours: hoursFrom({
        MON: null,
        TUE: ["07:00", "16:00"],
        WED: ["07:00", "16:00"],
        THU: ["07:00", "16:00"],
        FRI: ["07:00", "17:00"],
        SAT: ["08:00", "15:00"],
        SUN: ["08:00", "13:00"],
    }),
    services: [],
    staff: [],
    categories: [
        { key: "bread", name: "Bread" },
        { key: "pastry", name: "Pastry" },
        { key: "cakes", name: "Cakes" },
        { key: "coffee", name: "Coffee" },
    ],
    options: [
        { key: "size", name: "Size", values: ["Large", "Small"] },
        { key: "pack", name: "Pack", values: ["Single", "Six-pack"] },
        { key: "cake", name: "Cake size", values: ["6 inch", "9 inch"] },
        { key: "grind", name: "Grind", values: ["Whole bean", "Ground"] },
    ],
    products: [
        {
            slug: "sourdough-loaf",
            name: "Sourdough loaf",
            category: "bread",
            price: "9.00",
            description:
                "Our everyday loaf: long-fermented, dark-crusted, baked each morning.",
            option: "size",
            variants: [
                {
                    title: "Large",
                    sku: "SD-LG",
                    price: "9.00",
                    stock: [24, 12],
                },
                { title: "Small", sku: "SD-SM", price: "5.50", stock: [18, 9] },
            ],
            warnAt: 5,
            photos: photo("sourdough-loaf"),
            weight: 6,
        },
        {
            slug: "cinnamon-bun",
            name: "Cinnamon bun",
            category: "pastry",
            price: "4.50",
            description: "Soft, sticky and baked before we open.",
            option: "pack",
            variants: [
                { title: "Single", sku: "CB-1", price: "4.50", stock: [30, 0] },
                {
                    title: "Six-pack",
                    sku: "CB-6",
                    price: "24.00",
                    stock: [1, 3],
                },
            ],
            warnAt: 4,
            photos: photo("cinnamon-bun"),
            weight: 5,
        },
        {
            slug: "rosemary-focaccia",
            name: "Rosemary focaccia",
            category: "bread",
            price: "8.00",
            description: "Olive oil, rosemary and flaky salt.",
            stock: [4, 2],
            warnAt: 6,
            photos: photo("focaccia-rosemary"),
            weight: 4,
        },
        {
            slug: "house-blend-beans",
            name: "House blend beans, 12 oz",
            category: "coffee",
            price: "16.00",
            description: "The coffee we pour at the counter, roasted weekly.",
            option: "grind",
            variants: [
                {
                    title: "Whole bean",
                    sku: "HB-WB",
                    price: "16.00",
                    stock: [22, 30],
                },
                {
                    title: "Ground",
                    sku: "HB-GR",
                    price: "16.00",
                    stock: [0, 14],
                },
            ],
            warnAt: 5,
            photos: photo("house-blend-beans-250g"),
            weight: 3,
        },
        {
            slug: "chocolate-truffle-cake",
            name: "Chocolate truffle cake",
            category: "cakes",
            price: "42.00",
            was: "48.00",
            description: "Made to order with two days' notice.",
            option: "cake",
            variants: [
                { title: "6 inch", sku: "CT-6", price: "42.00", stock: [3, 0] },
                { title: "9 inch", sku: "CT-9", price: "68.00", stock: [2, 0] },
            ],
            warnAt: 1,
            photos: cake("chocolate-truffle-cake"),
            weight: 1,
        },
        {
            slug: "lemon-blueberry-cake",
            name: "Lemon and blueberry cake",
            category: "cakes",
            price: "44.00",
            description: "Lemon sponge, blueberry compote.",
            stock: [4, 0],
            warnAt: 1,
            photos: cake("lemon-blueberry-cake"),
            weight: 1,
        },
        {
            slug: "coffee-walnut-cake",
            name: "Coffee and walnut cake",
            category: "cakes",
            price: "44.00",
            description: "Coffee sponge with walnut buttercream.",
            stock: [0, 0],
            warnAt: 1,
            photos: cake("coffee-walnut-cake"),
            weight: 1,
        },
        {
            slug: "vanilla-fruit-cake",
            name: "Vanilla and seasonal fruit cake",
            category: "cakes",
            price: "40.00",
            description:
                "Vanilla sponge with whatever fruit is good this week.",
            stock: [5, 0],
            warnAt: 1,
            photos: cake("vanilla-fruit-cake"),
            weight: 1,
        },
    ],
    regulars: [
        {
            key: "maya",
            first: "Maya",
            last: "Thompson",
            attention: [
                {
                    kind: "ALLERGY",
                    label: "Allergic to sesame",
                    detail: "Check seeded loaves and anything baked beside them.",
                    sensitive: false,
                },
            ],
            notes: ["Collects most Saturdays. Prefers the darker bake."],
            orders: 8,
        },
        { key: "ben", first: "Ben", last: "Carter", orders: 5 },
        { key: "lucy", first: "Lucy", last: "Alvarez", orders: 4 },
    ],
    people: 34,
    orders: 48,
    manualInvoices: [
        {
            key: "cedar",
            billTo: "Cedar Cup Cafe",
            email: "orders.cedarcup@example.com",
            lines: [
                {
                    description: "Sourdough loaf, large",
                    quantity: 30,
                    unit: 800,
                },
                { description: "Cinnamon bun", quantity: 48, unit: 350 },
            ],
            daysAgo: 3,
            dueInDays: 14,
            taxed: true,
        },
        {
            key: "lantern",
            billTo: "Lantern Street Kitchen",
            email: "accounts.lantern@example.com",
            lines: [
                { description: "Focaccia trays", quantity: 12, unit: 2400 },
            ],
            daysAgo: 24,
            dueInDays: 14,
            taxed: true,
        },
        {
            key: "marble",
            billTo: "Marble Row Coffee",
            email: "hello.marblerow@example.com",
            lines: [
                {
                    description: "House blend beans, 5 lb",
                    quantity: 6,
                    unit: 8200,
                },
            ],
            daysAgo: 12,
            dueInDays: 7,
            paid: { after: 6, method: "BANK_TRANSFER" },
            taxed: true,
        },
        {
            key: "harbor",
            billTo: "Tidewater Deli",
            email: "office.tidewater@example.com",
            lines: [
                { description: "Weekly bread order", quantity: 4, unit: 18500 },
            ],
            daysAgo: 40,
            dueInDays: 14,
            taxed: true,
        },
        {
            key: "draft",
            billTo: "Cedar Cup Cafe",
            email: "orders.cedarcup@example.com",
            lines: [
                {
                    description: "Holiday pastry boxes",
                    quantity: 20,
                    unit: 3600,
                },
            ],
            daysAgo: 0,
            dueInDays: 14,
            draft: true,
            taxed: true,
        },
    ],
    site: {
        heading: "Bread and pastry, baked before you wake.",
        text: "A neighborhood bakery on Sample Street. Order for pick-up, or stop by the counter.",
        cta: { label: "Visit us", href: "/visit" },
        servicesHeading: "",
        features: {
            heading: "What we bake",
            items: [
                {
                    title: "Bread",
                    body: "Sourdough, focaccia and baguettes, every morning.",
                },
                {
                    title: "Pastry",
                    body: "Buns and croissants until they run out.",
                },
                {
                    title: "Cakes",
                    body: "Made to order with two days' notice.",
                },
            ],
        },
        visit: "<h2>Come and see us</h2><p>118 Sample Street, Madison, WI 53703</p><p>Tuesday to Sunday, from 7 am. Closed Mondays.</p>",
        footer: "Thistlewick Bakery. A demo business.",
    },
    rules: {
        bookAheadDays: 14,
        latestBookingMinutes: 120,
        freeCancelHours: 24,
    },
};

export const LARKSPUR: GlobalBusiness = {
    key: "salon",
    name: "Larkspur & Vane",
    slug: "larkspur-and-vane",
    legalName: "Larkspur & Vane Ltd",
    country: "GB",
    countryName: "United Kingdom",
    currency: "GBP",
    zone: "Europe/London",
    addressLine1: "14 Sample Yard",
    city: "Bristol",
    state: "",
    postalCode: "BS1 4XX",
    phone: ukPhone,
    contactEmail: "hello.larkspur@example.com",
    taxName: "VAT",
    taxRate: 20,
    taxId: "GB000000000",
    modules: ["CRM", "APPOINTMENTS", "WEBSITE"],
    invoiceStyle: "CLASSIC",
    stores: [{ key: "main", name: "Larkspur & Vane" }],
    hours: hoursFrom({
        MON: null,
        TUE: ["09:30", "18:00"],
        WED: ["09:30", "18:00"],
        THU: ["09:30", "20:00"],
        FRI: ["09:30", "18:00"],
        SAT: ["09:00", "17:00"],
        SUN: null,
    }),
    services: [
        {
            key: "cut",
            name: "Cut and blow-dry",
            description: "A consultation, a cut and a finish.",
            minutes: 60,
            capacity: 1,
            price: 5800,
            weight: 6,
        },
        {
            key: "blow",
            name: "Blow-dry",
            description: "Wash and a finish that lasts.",
            minutes: 45,
            capacity: 1,
            price: 3400,
            weight: 5,
        },
        {
            key: "gents",
            name: "Gents' cut",
            description: "Scissors or clippers, thirty minutes.",
            minutes: 30,
            capacity: 1,
            price: 3200,
            weight: 4,
        },
        {
            key: "roots",
            name: "Root colour",
            description: "Regrowth colour with a blow-dry.",
            minutes: 90,
            capacity: 1,
            price: 8500,
            weight: 3,
        },
        {
            key: "balayage",
            name: "Balayage",
            description: "Hand-painted highlights, toner and finish.",
            minutes: 150,
            capacity: 1,
            price: 16500,
            weight: 2,
        },
        {
            key: "consult",
            name: "Colour consultation",
            description: "Fifteen minutes and a patch test.",
            minutes: 15,
            capacity: 1,
            price: 0,
            weight: 1,
        },
    ],
    staff: [
        {
            key: "imogen",
            name: "Imogen Vane",
            title: "Owner and stylist",
            owner: true,
            services: ["cut", "blow", "gents", "roots", "balayage", "consult"],
            hours: [
                { days: [2, 3, 5], from: "09:30", to: "18:00" },
                { days: [4], from: "09:30", to: "20:00" },
                { days: [6], from: "09:00", to: "17:00" },
            ],
        },
    ],
    categories: [{ key: "care", name: "Hair care" }],
    options: [],
    products: [],
    regulars: [
        {
            key: "hannah",
            first: "Hannah",
            last: "Clarke",
            attention: [
                {
                    kind: "ALLERGY",
                    label: "Allergic to PPD",
                    detail: "Patch test before any colour. Ammonia-free only.",
                    sensitive: false,
                },
            ],
            notes: [
                "Books Thursdays after work. Likes the colour a shade cooler.",
            ],
            visits: 9,
        },
        { key: "george", first: "George", last: "Whitlock", visits: 6 },
        { key: "amelia", first: "Amelia", last: "Rowe", visits: 5 },
    ],
    people: 40,
    orders: 0,
    manualInvoices: [
        {
            key: "draft",
            billTo: "Amelia Rowe",
            email: "amelia.rowe@example.com",
            lines: [
                {
                    description: "Colour and cut, three visits",
                    quantity: 1,
                    unit: 24000,
                },
            ],
            daysAgo: 0,
            dueInDays: 14,
            draft: true,
        },
        {
            key: "today",
            billTo: "Amelia Rowe",
            email: "amelia.rowe@example.com",
            lines: [
                {
                    description: "Blow-dry for an event",
                    quantity: 1,
                    unit: 4200,
                },
            ],
            daysAgo: 0,
            dueInDays: 0,
            paid: { after: 0, method: "CARD" },
        },
        {
            key: "bridal",
            billTo: "Sophie Marsden",
            email: "sophie.marsden@example.com",
            lines: [
                {
                    description: "Wedding-day hair, bride",
                    quantity: 1,
                    unit: 22000,
                },
                {
                    description: "Wedding-day hair, bridesmaid",
                    quantity: 3,
                    unit: 7500,
                },
            ],
            daysAgo: 4,
            dueInDays: 14,
            taxed: true,
        },
        {
            key: "corp",
            billTo: "Quayside Studio Ltd",
            email: "accounts.quayside@example.com",
            lines: [
                {
                    description: "Styling for a photo shoot, half day",
                    quantity: 1,
                    unit: 42000,
                },
            ],
            daysAgo: 26,
            dueInDays: 14,
            taxed: true,
        },
        {
            key: "paid",
            billTo: "Quayside Studio Ltd",
            email: "accounts.quayside@example.com",
            lines: [
                {
                    description: "Styling for a photo shoot, full day",
                    quantity: 1,
                    unit: 78000,
                },
            ],
            daysAgo: 45,
            dueInDays: 14,
            paid: { after: 10, method: "BANK_TRANSFER" },
            taxed: true,
        },
    ],
    site: {
        heading: "Good hair, no fuss, right in the old town.",
        text: "A one-chair salon in Bristol. Book a time that's really free.",
        cta: { label: "Book an appointment", href: "/book" },
        servicesHeading: "Services and prices",
        features: {
            heading: "How we work",
            items: [
                {
                    title: "One stylist, start to finish",
                    body: "Imogen does every cut and colour herself.",
                },
                {
                    title: "Tell us what matters",
                    body: "Allergies and sensitivities go on your booking.",
                },
                {
                    title: "Prices on the page",
                    body: "What you see here is what you pay.",
                },
            ],
        },
        visit: "<h2>Come and see us</h2><p>14 Sample Yard, Bristol BS1 4XX</p><p>Tuesday to Saturday. Late on Thursdays.</p>",
        footer: "Larkspur & Vane. A demo business.",
    },
    rules: {
        bookAheadDays: 42,
        latestBookingMinutes: 120,
        freeCancelHours: 24,
    },
};

export const IRONVALE: GlobalBusiness = {
    key: "gym",
    name: "Ironvale Fitness",
    slug: "ironvale-fitness",
    legalName: "Ironvale Fitness LLC",
    country: "US",
    countryName: "United States",
    currency: "USD",
    zone: "America/Denver",
    addressLine1: "2400 Sample Avenue",
    city: "Denver",
    state: "CO",
    postalCode: "80205",
    phone: usPhone,
    contactEmail: "hello.ironvale@example.com",
    taxName: null,
    taxRate: null,
    taxId: null,
    modules: ["CRM", "APPOINTMENTS", "WEBSITE"],
    invoiceStyle: "CLASSIC",
    stores: [{ key: "main", name: "Front desk" }],
    hours: hoursFrom({
        MON: ["09:00", "18:30"],
        TUE: ["06:30", "18:30"],
        WED: ["09:00", "18:30"],
        THU: ["06:30", "15:00"],
        FRI: ["09:00", "18:30"],
        SAT: ["08:30", "12:00"],
        SUN: null,
    }),
    services: [
        {
            key: "pt",
            name: "Personal training",
            description: "An hour with your coach, one to one.",
            minutes: 60,
            capacity: 1,
            price: 7500,
            weight: 4,
        },
        {
            key: "assess",
            name: "Movement assessment",
            description: "Where you are, and where to start.",
            minutes: 45,
            capacity: 1,
            price: 4500,
            weight: 1,
        },
        {
            key: "trial",
            name: "Free trial session",
            description: "Come in, try a session, meet your coach.",
            minutes: 30,
            capacity: 1,
            price: 0,
            weight: 2,
        },
        {
            key: "strength",
            name: "Strength class",
            description: "Barbells in a small group.",
            minutes: 60,
            capacity: 12,
            price: 2200,
            weight: 0,
            classAt: [
                { days: [1, 3, 5], at: "17:30" },
                { days: [2, 4], at: "06:30" },
            ],
            fill: [6, 12],
        },
        {
            key: "yoga",
            name: "Yoga flow",
            description: "An hour for the rest of you.",
            minutes: 60,
            capacity: 14,
            price: 2000,
            weight: 0,
            classAt: [
                { days: [2], at: "17:30" },
                { days: [6], at: "09:00" },
            ],
            fill: [5, 13],
        },
    ],
    staff: [
        {
            key: "jordan",
            name: "Jordan Reyes",
            title: "Owner and coach",
            owner: true,
            services: ["pt", "assess", "trial", "strength", "yoga"],
            hours: [
                { days: [1, 3, 5], from: "09:00", to: "18:30" },
                { days: [2], from: "06:30", to: "18:30" },
                { days: [4], from: "06:30", to: "15:00" },
                { days: [6], from: "08:30", to: "12:00" },
            ],
        },
    ],
    categories: [{ key: "gear", name: "Gear" }],
    options: [],
    products: [],
    regulars: [
        {
            key: "alex",
            first: "Alex",
            last: "Romero",
            attention: [
                {
                    kind: "MEDICAL",
                    label: "Old shoulder injury",
                    detail: "Scale overhead pressing.",
                    sensitive: true,
                },
            ],
            notes: ["Training for a first 10K in the spring."],
            visits: 10,
        },
        { key: "priscilla", first: "Nora", last: "Bennett", visits: 7 },
        { key: "marcus", first: "Marcus", last: "Hale", visits: 6 },
    ],
    people: 60,
    orders: 0,
    manualInvoices: [
        {
            key: "draft",
            billTo: "Marcus Hale",
            email: "marcus.hale@example.com",
            lines: [
                {
                    description: "Personal training, five sessions",
                    quantity: 1,
                    unit: 35000,
                },
            ],
            daysAgo: 0,
            dueInDays: 14,
            draft: true,
        },
        {
            key: "today",
            billTo: "Marcus Hale",
            email: "marcus.hale@example.com",
            lines: [
                {
                    description: "Personal training, one session",
                    quantity: 1,
                    unit: 7500,
                },
            ],
            daysAgo: 0,
            dueInDays: 0,
            paid: { after: 0, method: "CARD" },
        },
        {
            key: "corp",
            billTo: "Foothill Print Co.",
            email: "office.foothill@example.com",
            lines: [
                {
                    description: "Team strength sessions, April",
                    quantity: 4,
                    unit: 22000,
                },
            ],
            daysAgo: 30,
            dueInDays: 14,
        },
        {
            key: "corp2",
            billTo: "Foothill Print Co.",
            email: "office.foothill@example.com",
            lines: [
                {
                    description: "Team strength sessions, March",
                    quantity: 4,
                    unit: 22000,
                },
            ],
            daysAgo: 60,
            dueInDays: 14,
            paid: { after: 9, method: "BANK_TRANSFER" },
        },
    ],
    site: {
        heading: "Get strong, in good company.",
        text: "A small gym in Denver with a coach who knows your name. Your first session is free.",
        cta: { label: "Book a free trial", href: "/book" },
        servicesHeading: "Classes and coaching",
        features: {
            heading: "How it works",
            items: [
                {
                    title: "Start with a free trial",
                    body: "Thirty minutes, no pressure.",
                },
                {
                    title: "Small classes",
                    body: "Twelve people at most, and a coach watching your form.",
                },
                {
                    title: "Pay when you come",
                    body: "By card or cash at the desk, with no contract.",
                },
            ],
        },
        visit: "<h2>Come and see us</h2><p>2400 Sample Avenue, Denver, CO 80205</p><p>Monday to Saturday, from 6:30 am on Tuesdays and Thursdays.</p>",
        footer: "Ironvale Fitness. A demo business.",
    },
    rules: {
        bookAheadDays: 21,
        latestBookingMinutes: 120,
        freeCancelHours: 12,
    },
};

export const WRENFIELD: GlobalBusiness = {
    key: "clinic",
    name: "Wrenfield Dental",
    slug: "wrenfield-dental",
    legalName: "Wrenfield Dental PLLC",
    country: "US",
    countryName: "United States",
    currency: "USD",
    zone: "America/Chicago",
    addressLine1: "610 Sample Boulevard",
    city: "Austin",
    state: "TX",
    postalCode: "78701",
    phone: usPhone,
    contactEmail: "desk.wrenfield@example.com",
    taxName: null,
    taxRate: null,
    taxId: null,
    modules: ["CRM", "APPOINTMENTS", "WEBSITE", "COMMERCE"],
    invoiceStyle: "CLASSIC",
    stores: [{ key: "main", name: "Wrenfield Dental" }],
    hours: hoursFrom({
        MON: ["08:00", "17:00"],
        TUE: ["08:00", "17:00"],
        WED: ["08:00", "17:00"],
        THU: ["08:00", "17:00"],
        FRI: ["08:00", "15:00"],
        SAT: null,
        SUN: null,
    }),
    services: [
        {
            key: "checkup",
            name: "Check-up and clean",
            description: "Thirty minutes: we look, clean and explain.",
            minutes: 30,
            capacity: 1,
            price: 12000,
            weight: 6,
        },
        {
            key: "review",
            name: "Follow-up review",
            description: "How it's healing, and what's next.",
            minutes: 20,
            capacity: 1,
            price: 6000,
            weight: 3,
        },
        {
            key: "rootcanal",
            name: "Root canal treatment",
            description:
                "Three visits of an hour. We book the rest with you after the first.",
            minutes: 60,
            capacity: 1,
            price: 120000,
            visits: 3,
            weight: 0,
        },
        {
            key: "whitening",
            name: "Teeth whitening",
            description: "Two visits of 45 minutes.",
            minutes: 45,
            capacity: 1,
            price: 45000,
            visits: 2,
            weight: 0,
        },
        {
            key: "video",
            name: "Video consultation",
            description:
                "Twenty minutes with the dentist, at the clinic or by video.",
            minutes: 20,
            capacity: 1,
            price: 5000,
            locationType: "EITHER",
            meetingUrl: "https://meet.example.com/wrenfield",
            weight: 2,
        },
        {
            key: "xray",
            name: "X-ray, full mouth",
            description: "Booked by the desk after a check-up.",
            minutes: 20,
            capacity: 1,
            price: 9000,
            hidden: true,
            weight: 1,
        },
    ],
    staff: [
        {
            key: "helen",
            name: "Dr. Helen Marsh",
            title: "Dentist",
            owner: true,
            services: [
                "checkup",
                "review",
                "rootcanal",
                "whitening",
                "video",
                "xray",
            ],
            hours: [
                { days: [1, 2, 3, 4], from: "08:00", to: "17:00" },
                { days: [5], from: "08:00", to: "15:00" },
            ],
        },
    ],
    categories: [{ key: "care", name: "Dental care" }],
    options: [],
    products: [],
    regulars: [
        {
            key: "daniel",
            first: "Daniel",
            last: "Foster",
            attention: [
                {
                    kind: "MEDICAL",
                    label: "On blood thinners",
                    detail: "Check with the dentist before any extraction.",
                    sensitive: true,
                },
                {
                    kind: "ALLERGY",
                    label: "Latex allergy",
                    detail: "Nitrile gloves only.",
                    sensitive: false,
                },
            ],
            bookingNote: {
                label: "Started a new blood-pressure tablet",
                detail: "I started a new blood-pressure tablet last week.",
            },
            visits: 5,
        },
        {
            key: "grace",
            first: "Grace",
            last: "Kim",
            attention: [
                {
                    kind: "MEDICAL",
                    label: "Pregnant",
                    detail: "Second trimester. No X-rays.",
                    sensitive: true,
                },
            ],
            visits: 4,
        },
        {
            key: "liam",
            first: "Liam",
            last: "Becker",
            attention: [
                {
                    kind: "OTHER",
                    label: "Anxious patient",
                    detail: "Explain each step first.",
                    sensitive: false,
                },
            ],
            visits: 3,
        },
    ],
    people: 70,
    orders: 0,
    manualInvoices: [
        {
            key: "draft",
            billTo: "Liam Becker",
            email: "liam.becker@example.com",
            lines: [
                {
                    description: "Treatment plan, first stage",
                    quantity: 1,
                    unit: 64000,
                },
            ],
            daysAgo: 0,
            dueInDays: 14,
            draft: true,
        },
        {
            key: "today",
            billTo: "Liam Becker",
            email: "liam.becker@example.com",
            lines: [
                {
                    description: "Night guard fitting",
                    quantity: 1,
                    unit: 18000,
                },
            ],
            daysAgo: 0,
            dueInDays: 0,
            paid: { after: 0, method: "CARD" },
        },
    ],
    site: {
        heading: "A dentist who explains things first.",
        text: "Check-ups, treatment and video consultations in downtown Austin. See a real free time and book it yourself.",
        cta: { label: "Book an appointment", href: "/book" },
        servicesHeading: "What we do",
        features: {
            heading: "What happens at a check-up",
            items: [
                {
                    title: "We look, clean and explain",
                    body: "Thirty minutes, no surprises.",
                },
                {
                    title: "A plan and a price first",
                    body: "If anything needs treatment, you get both before we start.",
                },
                {
                    title: "Tell us what worries you",
                    body: "Medicines, allergies or nerves: say so when you book.",
                },
            ],
        },
        visit: "<h2>Come and see us</h2><p>610 Sample Boulevard, Austin, TX 78701</p><p>Monday to Friday, from 8 am.</p>",
        footer: "Wrenfield Dental. A demo business.",
    },
    rules: {
        bookAheadDays: 28,
        latestBookingMinutes: 120,
        freeCancelHours: 24,
    },
};

export const GLOBAL_BUSINESSES = [
    THISTLEWICK,
    LARKSPUR,
    IRONVALE,
    WRENFIELD,
] as const;

export const FIRST_NAMES = [
    "Emma",
    "Olivia",
    "Noah",
    "Ethan",
    "Ava",
    "Mia",
    "Lucas",
    "Mason",
    "Chloe",
    "Ella",
    "Henry",
    "Jack",
    "Sofia",
    "Isabel",
    "Leo",
    "Owen",
    "Ruby",
    "Clara",
    "Theo",
    "Nina",
    "Oscar",
    "Hazel",
    "Felix",
    "Ivy",
    "Caleb",
    "Julia",
    "Simon",
    "Tessa",
    "Elliot",
    "Paige",
] as const;

export const LAST_NAMES = [
    "Miller",
    "Davis",
    "Garcia",
    "Wilson",
    "Moore",
    "Taylor",
    "Anderson",
    "Lee",
    "Harris",
    "Clark",
    "Lewis",
    "Walker",
    "Hall",
    "Young",
    "Wright",
    "Scott",
    "Green",
    "Adams",
    "Nelson",
    "Baker",
    "Rivera",
    "Mitchell",
    "Campbell",
    "Parker",
    "Evans",
    "Collins",
    "Morris",
    "Murphy",
    "Cooper",
    "Bell",
] as const;
