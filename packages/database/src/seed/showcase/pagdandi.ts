import type { SeedSection } from "../data";
import type { Db } from "../helpers";
import { id } from "../helpers";
import { SHOWCASE_KEY } from "./data";
import type {
    DemoShopCheck,
    DemoShopConfig,
    DemoShopContext,
    DemoShopResult,
} from "./demo-shop";
import { checkDemoShop, seedDemoShop, shortDay } from "./demo-shop";
import type { DemoProduct } from "./demo-shop-types";
import {
    PAGDANDI_CATEGORIES,
    PAGDANDI_OPTIONS,
    PAGDANDI_PRODUCTS,
} from "./pagdandi-catalog";
import { PAGDANDI_POSTS } from "./pagdandi-posts";
import { istAt } from "./people";

/**
 * Pagdandi Books & Café — an independent bookshop with a café corner on
 * Prabhat Road, Pune. Anagha Joshi runs the shop; Siddharth Kale runs the
 * café corner and the till as a Member. It sells public-domain classics in
 * new and good used copies, books by (fictional) Pune writers, stationery
 * with many variants and a few café things to take home. Nearly half its
 * sales are at the counter to people who leave no email. One novel is on
 * pre-order and ships on 1 November, so its orders wait, paid. Author
 * evenings on Thursdays and a Saturday story hour are bookable classes, and
 * a Book of the Month club is a monthly plan.
 */

export const PAGDANDI_KEY = "pb";
const sid = (...parts: (string | number)[]) =>
    id(SHOWCASE_KEY, PAGDANDI_KEY, ...parts);
export const PAGDANDI_ORG_ID = sid("org");

const PRE_ORDER = "kasba-peth-rains";
/** When the pre-order novel ships: 1 November 2026, noon in Pune. */
const RELEASE = new Date("2026-11-01T06:30:00.000Z");

const isBook = (p: DemoProduct) =>
    [
        "indian-classics",
        "world-classics",
        "poetry",
        "children",
        "pune-writers",
    ].includes(p.category);
const fresh = (p: DemoProduct) => p.category === "cafe" && !p.tracked;

const published = (pred: (p: DemoProduct) => boolean) =>
    PAGDANDI_PRODUCTS.filter((p) => p.status === "PUBLISHED" && pred(p));
const topIds = (
    productId: (slug: string) => string,
    pred: (p: DemoProduct) => boolean,
    n: number,
) =>
    published(pred)
        .sort((a, b) => b.demand - a.demand)
        .slice(0, n)
        .map((p) => productId(p.slug));
const section = (type: string, content: Record<string, unknown>) =>
    ({ type, content }) as unknown as SeedSection;
const photoOf = (pred: (p: DemoProduct) => boolean) => {
    const img = published(pred)
        .sort((a, b) => b.demand - a.demand)
        .at(0)
        ?.images.at(0);
    if (!img) throw new Error("Pagdandi Books: no photo for the site");
    return { src: img.url, alt: img.alt, width: img.width, height: img.height };
};

const ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    {
        name: "message",
        label: "What are you looking for?",
        type: "textarea",
        required: true,
    },
] as const;
const ENQUIRY_CONTENT = {
    title: "Ask Anagha",
    description:
        "Looking for a book we don't have on the shelf, a school or office order, or a used copy of something long out of print? Tell us — we reply within a day.",
    submitLabel: "Send",
    successMessage: "Thank you — we'll write back within a day.",
};

const CONFIG: DemoShopConfig = {
    key: PAGDANDI_KEY,
    name: "Pagdandi Books & Café",
    slug: "pagdandi-books",
    planKey: "pro",
    modules: [
        "COMMERCE",
        "PAYMENTS",
        "CRM",
        "WEBSITE",
        "INSIGHTS",
        "APPOINTMENTS",
    ],
    createdDaysAgo: 520,
    profile: {
        legalName: "Pagdandi Books LLP",
        type: "llp",
        phone: "+912025674410",
        contactEmail: "pagdandibooks@example.com",
        addressLine1: "14 Prabhat Road, Lane 3",
        addressLine2: "Deccan Gymkhana",
        city: "Pune",
        postalCode: "411004",
        gstState: "27",
        stateName: "Maharashtra",
    },
    store: {
        name: "Prabhat Road shop",
        description:
            "New and good used books, stationery, and a café corner. Lane 3, Prabhat Road.",
        address: "14 Prabhat Road, Lane 3, Deccan Gymkhana, Pune 411004",
        openingHours: [
            { day: "MON", open: "10:00", close: "21:00", closed: true },
            { day: "TUE", open: "10:00", close: "21:00", closed: false },
            { day: "WED", open: "10:00", close: "21:00", closed: false },
            { day: "THU", open: "10:00", close: "21:00", closed: false },
            { day: "FRI", open: "10:00", close: "21:00", closed: false },
            { day: "SAT", open: "10:00", close: "21:00", closed: false },
            { day: "SUN", open: "10:00", close: "21:00", closed: false },
        ],
        localDeliveryPaise: 5_000,
        freeDeliveryFromPaise: 79_900,
        shippingPaise: 8_000,
    },
    categories: PAGDANDI_CATEGORIES,
    options: PAGDANDI_OPTIONS,
    products: PAGDANDI_PRODUCTS,
    fulfilmentTypes: (p) => (fresh(p) ? ["PICKUP"] : []),
    // The pre-order opened four weeks ago; everything else sells all year.
    salesWindow: (p) =>
        p.slug === PRE_ORDER ? { from: 28, to: 0 } : { from: 999, to: 0 },
    readyAt: (products, placedAt, now) => {
        if (products.some((p) => p.slug === PRE_ORDER)) {
            return new Date(
                Math.max(
                    RELEASE.getTime(),
                    placedAt.getTime() + 3_600_000,
                    now.getTime() - 86_400_000 * 365,
                ),
            );
        }
        // Off the shelf and wrapped within two hours; a Monday order the next day.
        const ready = new Date(placedAt.getTime() + 2 * 3_600_000);
        return ready.getUTCDay() === 1 ? istAt(ready, 1, 11 * 60) : ready;
    },
    openNote: ({ fulfilment, readyAt }) =>
        readyAt.getTime() === RELEASE.getTime()
            ? "Pre-order — Kasba Peth Rains ships 1 Nov"
            : fulfilment === "PICKUP"
              ? `Kept at the counter from ${shortDay(readyAt)}`
              : null,
    people: {
        first: [
            "Aditya",
            "Shreya",
            "Gauri",
            "Mrunal",
            "Ketaki",
            "Sai",
            "Omkar",
            "Nikhil",
            "Tejas",
            "Ninad",
            "Sanika",
            "Ruchira",
            "Aarti",
            "Prajakta",
            "Amruta",
            "Vaibhav",
            "Rohan",
            "Siddhesh",
            "Kaustubh",
            "Madhura",
            "Isha",
            "Anushka",
            "Varun",
            "Akshay",
            "Pallavi",
            "Rasika",
            "Hrishikesh",
            "Chinmay",
            "Sayali",
            "Aarav",
            "Meera",
            "Farhan",
            "Zainab",
            "Kabir",
            "Tanvi",
            "Ira",
            "Mihir",
            "Vrinda",
        ],
        last: [
            "Kulkarni",
            "Deshpande",
            "Joshi",
            "Gokhale",
            "Paranjpe",
            "Bhide",
            "Patil",
            "Pawar",
            "Jadhav",
            "Shinde",
            "Karve",
            "Ranade",
            "Sathe",
            "Khare",
            "Phadke",
            "Godbole",
            "Limaye",
            "Natu",
            "Damle",
            "Bapat",
            "Ghate",
            "Mehendale",
            "Chitale",
            "Pathak",
            "Shaikh",
            "Mehta",
            "Iyer",
            "Nair",
            "Wagh",
        ],
        localities: [
            { name: "Deccan Gymkhana", zip: "411004" },
            { name: "Erandwane", zip: "411004" },
            { name: "Kothrud", zip: "411038" },
            { name: "Shivajinagar", zip: "411005" },
            { name: "Sadashiv Peth", zip: "411030" },
            { name: "Narayan Peth", zip: "411030" },
            { name: "Model Colony", zip: "411016" },
            { name: "Aundh", zip: "411007" },
            { name: "Baner", zip: "411045" },
            { name: "Karve Nagar", zip: "411052" },
            { name: "Kasba Peth", zip: "411011" },
            { name: "Sahakar Nagar", zip: "411009" },
            { name: "Bhandarkar Road", zip: "411004" },
            { name: "Viman Nagar", zip: "411014" },
        ],
        city: "Pune",
        state: "Maharashtra",
        streets: [
            "Flat {n}, Shree Apartments",
            "{n} Law College Road",
            "{n}/B, Lane 7",
            "Flat {n}, Mrunmayee Society",
            "{n} Apte Road",
            "Bungalow {n}, Hindustan Colony",
            "{n} Karve Road",
            "Flat {n}, Sai Prasad CHS",
        ],
    },
    volume: {
        days: 92,
        ordersPerMonth: 155,
        customers: 110,
        walkInShare: 0.42,
        counterDays: [0, 2, 3, 4, 5, 6],
        fulfilment: { PICKUP: 58, LOCAL_DELIVERY: 30, SHIPPING: 12 },
        onlineShare: 0.45,
        prepaidShare: 0.5,
        weekday: [1.5, 0.35, 0.9, 0.9, 1, 1.05, 1.6],
        // Diwali gifting in the last fortnight; the monsoon's quiet August.
        bump: (daysAgo) =>
            daysAgo <= 14
                ? 1 + (14 - daysAgo) * 0.025
                : daysAgo >= 50 && daysAgo <= 75
                  ? 0.85
                  : 1,
        lines: [60, 28, 9, 3],
        openMinute: 10 * 60,
        closeMinute: 21 * 60,
        cancelShare: 0.02,
        refundShare: 0.008,
        refundReasons: [
            "Used copy had pages missing that we missed — refunded in full",
            "Courier damaged the hardcover; refunded, a fresh copy sent free",
            "Bought twice as a gift — returned unopened",
        ],
        cancelReasons: [
            "Found a copy at home",
            "Wanted the Marathi edition instead — reordered",
            "Delivery address outside Pune, changed to courier on a new order",
        ],
        latePickups: 2,
        unpaidDelivered: 2,
    },
    bulkOrders: [
        {
            daysAgo: 6,
            minute: 12 * 60 + 15,
            lines: [{ slug: "godaan", variant: null, qty: 10 }],
            fulfilment: "LOCAL_DELIVERY",
            note: "Book club at Symbiosis staff room — 10 copies of Godaan for October",
            prepaid: true,
        },
        {
            daysAgo: 3,
            minute: 16 * 60 + 40,
            lines: [
                { slug: "pagdandi-field-notebook", variant: null, qty: 20 },
            ],
            fulfilment: "PICKUP",
            note: "Diwali gifts for an architects' office — wrap each, no price",
            prepaid: false,
        },
    ],
    orderNotes: [
        "Gift wrap please — it's a birthday",
        "Please write 'For Aai, with love' on the first page",
        "Any good used copy is fine",
        "Hindi edition only",
        "Leave with the watchman if we're out",
        "Will collect after story hour on Saturday",
        "Bubble-wrap the hardcover, it's going to my father",
        "Call before delivering, office hours",
    ],
    contactNotes: [
        "Collects every Premchand we get in Hindi. Tell him when a used Gaban comes in.",
        "Teacher at a school in Kothrud — orders class sets for the library each term.",
        "Prefers Marathi editions; reading Shyamchi Aai with her grandson.",
        "Brings her two kids to every story hour; the younger one is shy, sit him near the front.",
        "Sold us 40 used books from his father's collection in August.",
        "Uses only the A5 dotted notebook in Indigo — keep one aside when stock is low.",
        "Book club regular since the first meet-up; usually brings filter coffee for Siddharth.",
        "Wants a first-edition style hardcover of Pride and Prejudice for a wedding gift.",
    ],
    plans: [
        {
            name: "Book of the Month",
            description:
                "One book Anagha chooses each month, collected or delivered, a café coupon, and the meet-up on the last Sunday at 5pm.",
            pricePaise: 64_900,
            weight: 4,
            collectionWeekday: null,
            collectionNote:
                "The month's book — collect from the 1st, or delivered in Pune",
            gstRate: "0",
            sacCode: null,
        },
        {
            name: "Young Readers' Book of the Month",
            description:
                "A picture book or early reader each month for ages 4–8, with a story-hour place on the first Saturday.",
            pricePaise: 44_900,
            weight: 2,
            collectionWeekday: null,
            collectionNote: "The month's children's book",
            gstRate: "0",
            sacCode: null,
        },
    ],
    subscriptions: { ongoing: 50, paused: 3, cancelled: 50 },
    subscriberOnlyContacts: 40,
    manualInvoices: [
        {
            daysAgo: 64,
            lines: [
                {
                    description:
                        "Library books for Std V–VII — classics in English and Marathi",
                    quantity: 42,
                    unitPaise: 26_500,
                },
            ],
            state: "PAID",
            paidAfterDays: 12,
        },
        {
            daysAgo: 18,
            lines: [
                {
                    description: "Office book club — October title, 15 copies",
                    quantity: 15,
                    unitPaise: 34_900,
                },
            ],
            state: "ISSUED",
        },
        {
            daysAgo: 40,
            lines: [
                {
                    description:
                        "Author evening — private booking for a reading circle",
                    quantity: 1,
                    unitPaise: 600_000,
                },
                {
                    description: "Chai and biscuits for 25",
                    quantity: 25,
                    unitPaise: 6_000,
                },
            ],
            state: "PAID",
            paidAfterDays: 2,
        },
        {
            daysAgo: 2,
            lines: [
                {
                    description:
                        "Diwali gift sets for a CA firm — 3 classics, wrapped",
                    quantity: 12,
                    unitPaise: 119_900,
                },
            ],
            state: "DRAFT",
        },
    ],
    enquiries: {
        formName: "Ask Anagha",
        fields: [...ENQUIRY_FIELDS],
        content: ENQUIRY_CONTENT,
        messages: [
            {
                message:
                    "Do you have a Marathi copy of Shyamchi Aai in hardcover? Looking for a gift for my grandmother.",
            },
            {
                message:
                    "Our school library needs about 40 classics for Std VI–VIII. Can you suggest a list and quote?",
            },
            {
                message:
                    "Can I sell you about 60 old books — mostly Marathi novels and some English classics?",
            },
            {
                message:
                    "Is the Thursday author evening suitable for a 12-year-old?",
            },
            {
                message:
                    "We'd like to hold our office book club at the café once a month. Is that possible?",
            },
            {
                message:
                    "Looking for an old Bengali edition of Devdas — any used copies?",
            },
            {
                message:
                    "Can you courier to Nagpur? I want the Tagore stories set.",
            },
            {
                message:
                    "Do you do gift wrapping for 25 books for a wedding return gift?",
            },
            {
                message:
                    "I'd like to pre-order 5 copies of Kasba Peth Rains for my reading group. Signed if possible?",
            },
            {
                message:
                    "My daughter is 3 and a half — can she come to story hour?",
            },
            {
                message:
                    "Do you stock fountain pen ink cartridges or only bottles?",
            },
            {
                message:
                    "Can I reserve the A5 dotted notebook in Indigo? It's sold out online.",
            },
            {
                message:
                    "We're a small publisher in Kolhapur — would you stock our Marathi poetry titles?",
            },
            {
                message:
                    "Is there parking near the shop? Coming with my father who uses a walker.",
            },
            {
                message:
                    "Can the book club gift subscription start in November as a birthday present?",
            },
            { message: "Do you have Chekhov's plays, not just the stories?" },
            {
                message:
                    "Corporate order: 30 copies of Gandhi's autobiography for a leadership workshop.",
            },
        ],
        pipeline: {
            name: "Orders and requests",
            stages: ["New", "Replied", "Quoted", "Arranged"],
        },
        notes: [
            "Sent the school a list of 40 titles with Marathi and English options.",
            "Checked the back room — two used copies, both good. Holding one.",
            "Offered store credit for the books; they'll bring them on Wednesday.",
            "Spoke to Meghna — she will sign pre-orders at the launch.",
            "Café corner is free on the second Friday evenings for the club.",
        ],
        tasks: [
            "Send the quote with the school discount",
            "Call back about the used books",
            "Confirm the date for the reading circle",
            "Order the plays from the distributor",
            "Hold a copy at the counter",
        ],
    },
    services: [
        {
            name: "Author evening",
            description:
                "A Thursday reading and conversation with a Pune writer, in the café corner. Chai and biscuits included. 30 seats.",
            minutes: 90,
            capacity: 30,
            priceCents: 20_000,
            rules: [{ days: [4], from: "18:30", to: "20:00" }],
            weight: 1.6,
        },
        {
            name: "Saturday story hour",
            description:
                "Stories read aloud for ages 4–8, with a little drawing after. 15 places; grown-ups wait in the café.",
            minutes: 60,
            capacity: 15,
            priceCents: 15_000,
            rules: [{ days: [6], from: "11:00", to: "12:00" }],
            weight: 1,
        },
    ],
    bookings: 320,
    qr: [
        {
            code: "pgd2",
            place: "COUNTER",
            placeNote: "Stand by the till",
            label: "Our shelves, online",
            targetKind: "SHOP",
            color: "#1e3a5f",
            perDay: 6,
            createdDaysAgo: 160,
        },
        {
            code: "kth9",
            place: "FLYER",
            placeNote: "Story hour flyers at Kamala Nehru Park and schools",
            label: "Book a story hour place",
            targetKind: "BOOK",
            color: "#1e3a5f",
            perDay: 2,
            createdDaysAgo: 75,
        },
    ],
    discounts: [
        {
            code: "BOOKCLUB10",
            description: "10% off for Book of the Month members",
            percentBps: 1000,
            startsDaysAgo: 300,
            endsInDays: null,
        },
        {
            code: "DIWALIREADS",
            description: "Diwali gift sets and wrapped books",
            percentBps: 1000,
            startsDaysAgo: 6,
            endsInDays: 25,
        },
        {
            code: "MONSOON15",
            description: "The monsoon reading sale",
            percentBps: 1500,
            startsDaysAgo: 100,
            endsInDays: -45,
        },
    ],
    site: ({ productId, storeId, serviceIndex }) => ({
        slug: "pagdandi-books",
        name: "Pagdandi Books & Café",
        subdomain: "pagdandi-books",
        published: true,
        createdDaysAgo: 400,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    section("hero", {
                        heading: "A small bookshop on Prabhat Road",
                        subheading:
                            "Classics new and used, books by Pune writers, good paper and ink, and filter coffee in the corner. Open Tuesday to Sunday, 10am to 9pm.",
                        cta: {
                            label: "Browse the shelves",
                            href: "/books",
                            style: "primary",
                        },
                        image: photoOf((p) => p.category === "stationery"),
                    }),
                    section("productGrid", {
                        title: "On the front table",
                        source: "picked",
                        productIds: topIds(productId, isBook, 8),
                        showPrices: true,
                    }),
                    section("features", {
                        heading: "What you'll find here",
                        items: [
                            {
                                title: "Used copies, checked page by page",
                                body: "Every used book is read through before it goes on the shelf, and priced by its condition.",
                            },
                            {
                                title: "Thursday author evenings",
                                body: "Pune writers read and talk in the café corner. Thirty seats, chai included.",
                            },
                            {
                                title: "Book of the Month",
                                body: "One book a month chosen by Anagha, and a meet-up on the last Sunday.",
                            },
                        ],
                    }),
                    section("journal", { title: "From the shop", count: 3 }),
                ],
            },
            {
                path: "/books",
                title: "Books",
                sections: [
                    section("productGrid", {
                        title: "Indian classics",
                        source: "picked",
                        productIds: topIds(
                            productId,
                            (p) => p.category === "indian-classics",
                            12,
                        ),
                        showPrices: true,
                    }),
                    section("productGrid", {
                        title: "World classics",
                        source: "picked",
                        productIds: topIds(
                            productId,
                            (p) => p.category === "world-classics",
                            12,
                        ),
                        showPrices: true,
                    }),
                    section("productGrid", {
                        title: "Pune writers",
                        source: "picked",
                        productIds: topIds(
                            productId,
                            (p) => p.category === "pune-writers",
                            8,
                        ),
                        showPrices: true,
                    }),
                    section("productGrid", {
                        title: "For children",
                        source: "picked",
                        productIds: topIds(
                            productId,
                            (p) => p.category === "children",
                            8,
                        ),
                        showPrices: true,
                    }),
                    section("productGrid", {
                        title: "Paper, ink and things",
                        source: "picked",
                        productIds: topIds(
                            productId,
                            (p) =>
                                p.category === "stationery" ||
                                p.category === "cafe",
                            12,
                        ),
                        showPrices: true,
                    }),
                ],
            },
            {
                path: "/events",
                title: "Events",
                sections: [
                    section("richText", {
                        format: "html",
                        value: "<h2>Evenings and story hours</h2><p>On Thursdays at 6:30pm a Pune writer reads in the café corner and stays to talk. On Saturdays at 11am we read aloud to children aged four to eight. On Thursday 5 November, Meghna Apte launches <em>Kasba Peth Rains</em> here.</p>",
                    }),
                    {
                        type: "servicesList",
                        services: [
                            serviceIndex("Author evening"),
                            serviceIndex("Saturday story hour"),
                        ],
                        content: { heading: "Book a place", showPrices: true },
                    },
                    section("timetable", { title: "This week" }),
                ],
            },
            {
                path: "/book-club",
                title: "Book club",
                sections: [
                    section("plans", {
                        title: "Book of the Month",
                        intro: "One book a month, chosen by Anagha. Collect it from the shop or have it delivered in Pune, and come to the meet-up on the last Sunday at 5pm.",
                    }),
                    section("faq", {
                        heading: "About the club",
                        items: [
                            {
                                question: "When is the book ready?",
                                answer: "From the 1st of each month. Delivery in Pune is included; members outside Pune pay ₹80 a month for courier.",
                            },
                            {
                                question: "Can I skip a month or pause?",
                                answer: "Yes — tell us by the 20th and we'll skip the next month's book.",
                            },
                            {
                                question: "Can I give it as a gift?",
                                answer: "Yes. Ask at the counter or write to us and we'll start it on the month you choose.",
                            },
                        ],
                    }),
                ],
            },
            {
                path: "/journal",
                title: "Journal",
                sections: [
                    section("journal", {
                        title: "News, help and reading",
                        count: 6,
                    }),
                ],
            },
            {
                path: "/visit-us",
                title: "Visit us",
                sections: [
                    section("visitUs", { title: "Find the shop", storeId }),
                    section("contact", {
                        heading: "Get in touch",
                        address:
                            "14 Prabhat Road, Lane 3, Deccan Gymkhana, Pune 411004",
                        hours: "Tuesday to Sunday, 10am–9pm. Closed Mondays.",
                        phone: "+91 20 2567 4410",
                        email: "pagdandibooks@example.com",
                    }),
                    {
                        type: "enquiry",
                        form: { name: "Ask Anagha", fields: ENQUIRY_FIELDS },
                        content: ENQUIRY_CONTENT,
                    },
                ],
            },
        ],
    }),
    footer: "Pagdandi Books & Café · 14 Prabhat Road, Lane 3, Pune · Open Tue–Sun, 10am–9pm",
    posts: PAGDANDI_POSTS,
    postAuthor: "Anagha Joshi",
    analytics: {
        viewsPerDay: 210,
        weekendFactor: 1.2,
        paths: [
            { path: "/", weight: 0.3 },
            { path: "/books", weight: 0.22 },
            { path: "/shop", weight: 0.14 },
            { path: "/events", weight: 0.11 },
            { path: "/book-club", weight: 0.08 },
            { path: "/journal", weight: 0.09 },
            { path: "/visit-us", weight: 0.06 },
        ],
    },
    contactSources: [
        { source: "WALK_IN", weight: 35 },
        { source: "INSTAGRAM", weight: 20 },
        { source: "GOOGLE", weight: 18 },
        { source: "REFERRAL", weight: 12 },
        { source: "WEBSITE", weight: 10 },
        { source: "QR", weight: 5 },
    ],
};

export function seedPagdandi(ctx: DemoShopContext): Promise<DemoShopResult> {
    return seedDemoShop(ctx, CONFIG);
}

const CHECKS: DemoShopCheck[] = [
    {
        what: "no paid pre-order waiting for its release",
        rows: async (prisma, orgId, now) => {
            if (now >= RELEASE) return [];
            const n = await prisma.orderItem.count({
                where: {
                    product: { slug: PRE_ORDER, organizationId: orgId },
                    order: { status: { in: ["PENDING", "PROCESSING"] } },
                },
            });
            return n >= 3 ? [] : [{ preOrders: n }];
        },
    },
    {
        what: "the pre-order counts stock, or a product has more than 30 variants",
        rows: async (prisma, orgId) => {
            const [pre, most] = await Promise.all([
                prisma.product.findFirst({
                    where: { organizationId: orgId, slug: PRE_ORDER },
                    select: { stockTracked: true },
                }),
                prisma.product.findMany({
                    where: { organizationId: orgId },
                    select: { _count: { select: { variants: true } } },
                }),
            ]);
            const max = Math.max(...most.map((p) => p._count.variants));
            return pre && !pre.stockTracked && max >= 20 && max <= 30
                ? []
                : [{ pre, max }];
        },
    },
    {
        what: "no counter sales, or no author evening and story hour booked ahead",
        rows: async (prisma, orgId, now) => {
            const [walkIns, ahead] = await Promise.all([
                prisma.order.count({
                    where: { organizationId: orgId, customerId: null },
                }),
                prisma.booking.groupBy({
                    by: ["serviceId"],
                    where: {
                        organizationId: orgId,
                        startAt: { gt: now },
                        status: "CONFIRMED",
                    },
                    _count: true,
                }),
            ]);
            return walkIns >= 100 && ahead.length === 2
                ? []
                : [{ walkIns, ahead: ahead.length }];
        },
    },
    {
        what: "orders a month outside 120–220, or customers outside 90–140",
        rows: async (prisma, orgId, now) => {
            const since = new Date(now.getTime() - 30 * 86_400_000);
            const [month, customers] = await Promise.all([
                prisma.order.count({
                    where: { organizationId: orgId, createdAt: { gte: since } },
                }),
                prisma.customer.count({ where: { organizationId: orgId } }),
            ]);
            return month >= 120 &&
                month <= 220 &&
                customers >= 90 &&
                customers <= 140
                ? []
                : [{ month, customers }];
        },
    },
    {
        what: "book club not about 50 ongoing and 50 ended",
        rows: async (prisma, orgId) => {
            const [ongoing, ended] = await Promise.all([
                prisma.customerSubscription.count({
                    where: {
                        organizationId: orgId,
                        status: { not: "CANCELLED" },
                    },
                }),
                prisma.customerSubscription.count({
                    where: { organizationId: orgId, status: "CANCELLED" },
                }),
            ]);
            return ongoing >= 45 && ended >= 45 ? [] : [{ ongoing, ended }];
        },
    },
];

export function checkPagdandi(prisma: Db, now: Date) {
    return checkDemoShop(prisma, {
        orgId: PAGDANDI_ORG_ID,
        name: CONFIG.name,
        now,
        checks: CHECKS,
    });
}
