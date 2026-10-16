import type { SeedSection } from "../data";
import type { Db } from "../helpers";
import { id } from "../helpers";
import {
    ACHAAR_CATEGORIES,
    ACHAAR_OPTIONS,
    ACHAAR_PRODUCTS,
} from "./achaar-catalog";
import { ACHAAR_POSTS } from "./achaar-posts";
import { SHOWCASE_KEY } from "./data";
import type {
    DemoShopCheck,
    DemoShopConfig,
    DemoShopContext,
    DemoShopResult,
} from "./demo-shop";
import { checkDemoShop, seedDemoShop, shortDay, weekdayOf } from "./demo-shop";
import type { DemoProduct } from "./demo-shop-types";
import { istAt } from "./people";

/**
 * Ammi Ki Barni — a home pickle kitchen in Nishatganj, Lucknow. Shabana Khan
 * ("Ammi") cooks; her son Faizan takes the orders on WhatsApp and Instagram,
 * answers the phone and does the deliveries. Most of what it sells is made
 * only after the order comes in, so its open orders sit in Preparing for
 * three or four days with a pick-up or delivery day in their notes, and its
 * pickles count no stock. Its masalas, papad and aam papad sit on a shelf
 * and are counted. Diwali gifting is lifting the last fortnight.
 *
 * On the Grow plan: the catalogue's Free plan allows three products and
 * eight orders a month, which a kitchen this busy has long outgrown — the
 * Free → Grow story is told in its past, not its present.
 */

export const ACHAAR_KEY = "aa";
const sid = (...parts: (string | number)[]) =>
    id(SHOWCASE_KEY, ACHAAR_KEY, ...parts);
export const ACHAAR_ORG_ID = sid("org");

const madeToOrder = (p: DemoProduct) => !p.tracked;
const isHamper = (p: DemoProduct) =>
    p.category === "hampers" || p.slug.includes("hamper");
/** Pickles that need days in the sun before they are ready. */
const sunPickle = (p: DemoProduct) => /chunda|bharwa|stuffed/.test(p.slug);

const bySlug = (pred: (p: DemoProduct) => boolean) =>
    ACHAAR_PRODUCTS.filter((p) => p.status === "PUBLISHED" && pred(p));
const topIds = (
    productId: (slug: string) => string,
    pred: (p: DemoProduct) => boolean,
    n: number,
) =>
    bySlug(pred)
        .sort((a, b) => b.demand - a.demand)
        .slice(0, n)
        .map((p) => productId(p.slug));

const section = (type: string, content: Record<string, unknown>) =>
    ({ type, content }) as unknown as SeedSection;

/** A product's cover photo, for the site's own pictures. */
const coverOf = (pred: (p: DemoProduct) => boolean) => {
    const p = bySlug(pred)
        .sort((a, b) => b.demand - a.demand)
        .at(0);
    const img = p?.images.at(0);
    if (!img) throw new Error("Ammi Ki Barni: no product photo for the site");
    return { src: img.url, alt: img.alt, width: img.width, height: img.height };
};

const diwaliHamper = () => {
    const p =
        bySlug((x) => isHamper(x) && x.slug.includes("diwali")).at(0) ??
        bySlug(isHamper).at(0);
    if (!p) throw new Error("Ammi Ki Barni has no hamper");
    return p;
};
const mangoJar = () => {
    const p = bySlug(
        (x) => /aam|mango/.test(x.slug) && madeToOrder(x) && !sunPickle(x),
    ).at(0);
    if (!p) throw new Error("Ammi Ki Barni has no mango pickle");
    return p;
};

const CONFIG: DemoShopConfig = {
    key: ACHAAR_KEY,
    name: "Ammi Ki Barni",
    slug: "ammi-ki-barni",
    planKey: "grow",
    modules: ["COMMERCE", "PAYMENTS", "CRM", "WEBSITE", "INSIGHTS"],
    createdDaysAgo: 400,
    profile: {
        legalName: null,
        type: "individual",
        phone: "+910000000023",
        contactEmail: "ammikibarni@example.com",
        addressLine1: "B-14, Nishatganj Colony",
        addressLine2: "Near Papermill Colony crossing",
        city: "Lucknow",
        postalCode: "226006",
        gstState: "09",
        stateName: "Uttar Pradesh",
    },
    store: {
        name: "Nishatganj kitchen",
        description:
            "Home-made achaar, made after you order. Pick up from Nishatganj or have Faizan bring it.",
        address: "B-14, Nishatganj Colony, Lucknow 226006",
        openingHours: [
            { day: "MON", open: "11:00", close: "19:00", closed: false },
            { day: "TUE", open: "11:00", close: "19:00", closed: false },
            { day: "WED", open: "11:00", close: "19:00", closed: false },
            { day: "THU", open: "11:00", close: "19:00", closed: false },
            { day: "FRI", open: "15:00", close: "19:00", closed: false },
            { day: "SAT", open: "11:00", close: "19:00", closed: false },
            { day: "SUN", open: "11:00", close: "19:00", closed: false },
        ],
        localDeliveryPaise: 6_000,
        freeDeliveryFromPaise: 99_900,
        shippingPaise: 15_000,
    },
    categories: ACHAAR_CATEGORIES,
    options: ACHAAR_OPTIONS,
    products: ACHAAR_PRODUCTS,
    // Glass jars of oil go by hand; sealed dry goods and boxed hampers can travel.
    fulfilmentTypes: (p) =>
        madeToOrder(p) && !isHamper(p) ? ["PICKUP", "LOCAL_DELIVERY"] : [],
    salesWindow: (p) => {
        if (p.seasonal === "winter") return null; // made from November
        if (p.seasonal === "festive" || isHamper(p)) {
            return p.slug.includes("eid") ? null : { from: 24, to: 0 };
        }
        return { from: 999, to: 0 };
    },
    readyAt: (products, placedAt) => {
        if (!products.some(madeToOrder)) {
            return istAt(placedAt, 1, 12 * 60);
        }
        const sun = products.some(sunPickle);
        const days = sun ? 5 : 3 + (placedAt.getUTCMinutes() % 2);
        return istAt(placedAt, days, 16 * 60 + 30);
    },
    openNote: ({ fulfilment, readyAt }) =>
        fulfilment === "PICKUP"
            ? `Pick-up ${shortDay(readyAt)}, after 5pm`
            : fulfilment === "LOCAL_DELIVERY"
              ? `Faizan delivers ${shortDay(nextDeliveryDay(readyAt))}`
              : `Courier on ${shortDay(nextMonday(readyAt))}`,
    people: {
        first: [
            "Farah",
            "Ayesha",
            "Zoya",
            "Sana",
            "Nazia",
            "Rukhsar",
            "Imran",
            "Faisal",
            "Arif",
            "Shadab",
            "Tariq",
            "Asif",
            "Huma",
            "Mehjabeen",
            "Priya",
            "Neha",
            "Shalini",
            "Anjali",
            "Pooja",
            "Ritu",
            "Swati",
            "Vandana",
            "Rahul",
            "Amit",
            "Vivek",
            "Saurabh",
            "Ankit",
            "Abhishek",
            "Manish",
            "Alok",
            "Deepak",
            "Rohit",
            "Kavita",
            "Meenakshi",
            "Sunita",
            "Rekha",
            "Nida",
            "Sameer",
            "Aditi",
            "Shruti",
        ],
        last: [
            "Siddiqui",
            "Ansari",
            "Rizvi",
            "Naqvi",
            "Zaidi",
            "Qureshi",
            "Abbasi",
            "Kidwai",
            "Srivastava",
            "Mishra",
            "Tripathi",
            "Shukla",
            "Pandey",
            "Awasthi",
            "Bajpai",
            "Dixit",
            "Agarwal",
            "Rastogi",
            "Saxena",
            "Verma",
            "Kapoor",
            "Tandon",
            "Mehrotra",
            "Nigam",
            "Khanna",
            "Yadav",
            "Singh",
            "Jaiswal",
        ],
        localities: [
            { name: "Hazratganj", zip: "226001" },
            { name: "Aminabad", zip: "226018" },
            { name: "Chowk", zip: "226003" },
            { name: "Nishatganj", zip: "226006" },
            { name: "Mahanagar", zip: "226006" },
            { name: "Aliganj", zip: "226024" },
            { name: "Gomti Nagar", zip: "226010" },
            { name: "Indira Nagar", zip: "226016" },
            { name: "Kapoorthala", zip: "226024" },
            { name: "Jankipuram", zip: "226021" },
            { name: "Alambagh", zip: "226005" },
            { name: "Vikas Nagar", zip: "226022" },
            { name: "Lalbagh", zip: "226001" },
            { name: "Daliganj", zip: "226020" },
        ],
        city: "Lucknow",
        state: "Uttar Pradesh",
        streets: [
            "House {n}, Lane 3",
            "{n}/12 Faizabad Road",
            "C-{n}, Sector B",
            "{n} Kaiserbagh Colony",
            "Flat {n}, Shalimar Towers",
            "{n}/4 Nawab Yusuf Road",
            "D-{n}, Sector 11",
            "{n} Rani Laxmi Bai Marg",
        ],
    },
    volume: {
        days: 92,
        ordersPerMonth: 150,
        customers: 105,
        walkInShare: 0,
        counterDays: [],
        fulfilment: { PICKUP: 55, LOCAL_DELIVERY: 40, SHIPPING: 5 },
        onlineShare: 0.3,
        prepaidShare: 0.35,
        weekday: [1.3, 0.9, 1, 1, 1, 0.7, 1.25],
        // Diwali gifting lifts the last three weeks; closed 2–5 October for
        // a family wedding; Raksha Bandhan (9 August) lifts a few days.
        bump: (daysAgo) =>
            daysAgo >= 10 && daysAgo <= 13
                ? 0.05
                : daysAgo <= 20
                  ? 1 + (20 - daysAgo) * 0.035
                  : daysAgo >= 64 && daysAgo <= 70
                    ? 1.25
                    : 1,
        lines: [55, 28, 12, 5],
        openMinute: 8 * 60 + 30,
        closeMinute: 22 * 60,
        cancelShare: 0.025,
        refundShare: 0.01,
        refundReasons: [
            "Jar cracked on the way — refunded by UPI",
            "Oil leaked in the delivery bag; refunded and a fresh jar promised",
            "Too sour for them — refunded as a goodwill gesture",
        ],
        cancelReasons: [
            "Customer travelling, will order next month",
            "Ordered twice by mistake on WhatsApp",
            "Wanted it the same day — couldn't make it in time",
            "Changed their mind after the price",
        ],
        latePickups: 2,
        unpaidDelivered: 3,
    },
    bulkOrders: [
        {
            daysAgo: 4,
            minute: 11 * 60 + 20,
            lines: [
                {
                    slug: diwaliHamper().slug,
                    variant: diwaliHamper().variants.at(-1)?.title ?? null,
                    qty: 12,
                },
            ],
            fulfilment: "LOCAL_DELIVERY",
            note: "Office Diwali gifting — 12 boxes, a card in each, deliver before 6 Nov to the Vibhuti Khand office",
            prepaid: true,
        },
        {
            daysAgo: 2,
            minute: 19 * 60 + 5,
            lines: [
                {
                    slug: diwaliHamper().slug,
                    variant: diwaliHamper().variants[0]?.title ?? null,
                    qty: 8,
                },
            ],
            fulfilment: "PICKUP",
            note: "Diwali boxes for the family in Kanpur — collecting together",
            prepaid: false,
        },
        {
            daysAgo: 41,
            minute: 13 * 60 + 40,
            lines: [
                {
                    slug: mangoJar().slug,
                    variant: mangoJar().variants[0]?.title ?? null,
                    qty: 25,
                },
            ],
            fulfilment: "LOCAL_DELIVERY",
            note: "Kitty party return gifts — 25 small jars, plain labels",
            prepaid: true,
        },
    ],
    orderNotes: [
        "Less oil please",
        "No garlic — Jain guests",
        "Gift — no price slip in the bag",
        "Call before coming, the gate is locked after 7",
        "Extra spicy, like last time",
        "Leave with the guard if nobody answers",
        "Please pack the jar in two bags, it's going to Delhi by train",
        "For my mother — write 'Ammi ka pyaar' on the lid",
        "Will pay by UPI when it arrives",
        "Same as last month",
    ],
    contactNotes: [
        "Orders every month for her mother in Aliganj; always the khatta nimbu, 500 g.",
        "Jain household — no garlic, no onion. Double-check the mixed achaar.",
        "Collects on Saturday evenings after office. Prefers a call, not WhatsApp.",
        "Runs a small dhaba on Faizabad Road; takes 1 kg jars and pays monthly.",
        "Sends jars to her son in Bengaluru — packs need the double bag.",
        "Allergic to sesame; never the til oil versions.",
        "Asked about a bulk order for her daughter's wedding in December.",
        "Likes it extra spicy. Ammi adds a little more lal mirch for her.",
    ],
    plans: [
        {
            name: "Achaar ka Dabba",
            description:
                "Three 250 g jars of the month's picks, made for you and ready on the first Saturday. Collect from Nishatganj or Faizan brings it.",
            pricePaise: 69_900,
            weight: 3,
            collectionWeekday: null,
            collectionNote: "Three 250 g jars, first Saturday of the month",
            gstRate: "12",
            sacCode: null,
        },
        {
            name: "Chhota Dabba",
            description:
                "Two 250 g jars of the month's picks, for a small household.",
            pricePaise: 44_900,
            weight: 2,
            collectionWeekday: null,
            collectionNote: "Two 250 g jars, first Saturday of the month",
            gstRate: "12",
            sacCode: null,
        },
    ],
    subscriptions: { ongoing: 50, paused: 4, cancelled: 50 },
    subscriberOnlyContacts: 30,
    manualInvoices: [
        {
            daysAgo: 52,
            lines: [
                {
                    description:
                        "Wedding favours — 100 g mixed achaar, ribboned jars",
                    quantity: 120,
                    unitPaise: 11_000,
                },
            ],
            state: "PAID",
            paidAfterDays: 4,
        },
        {
            daysAgo: 33,
            lines: [
                {
                    description: "Mixed achaar, 1 kg — café supply",
                    quantity: 4,
                    unitPaise: 76_000,
                },
                {
                    description: "Khatta nimbu, 1 kg — café supply",
                    quantity: 4,
                    unitPaise: 68_000,
                },
            ],
            state: "PAID",
            paidAfterDays: 9,
        },
        {
            daysAgo: 5,
            lines: [
                {
                    description: "Diwali gift box — 3 jars, corporate order",
                    quantity: 30,
                    unitPaise: 89_900,
                },
                {
                    description: "Delivery to Vibhuti Khand, Gomti Nagar",
                    quantity: 1,
                    unitPaise: 30_000,
                },
            ],
            state: "ISSUED",
        },
        {
            daysAgo: 1,
            lines: [
                {
                    description:
                        "Winter gajar-gobhi-shalgam, 500 g — school canteen, December",
                    quantity: 20,
                    unitPaise: 34_000,
                },
            ],
            state: "DRAFT",
        },
    ],
    enquiries: {
        formName: "Ask Ammi",
        fields: [
            { name: "name", label: "Your name", type: "text", required: true },
            { name: "email", label: "Email", type: "email", required: true },
            { name: "phone", label: "WhatsApp number", type: "tel" },
            {
                name: "message",
                label: "What would you like?",
                type: "textarea",
                required: true,
            },
        ],
        content: {
            title: "Ask Ammi",
            description:
                "Bulk orders, weddings, gifting, or a pickle you remember from your nani's kitchen — tell us and Faizan will call you back the same day.",
            submitLabel: "Send",
            successMessage: "Shukriya! Faizan will call or WhatsApp you today.",
        },
        messages: [
            {
                message:
                    "We need 150 small jars as wedding favours for 14 December. Mixed achaar, ribbon on top. Can you do it and what will it cost?",
            },
            {
                message:
                    "Do you make lehsun achaar without vinegar? My father can't have vinegar.",
            },
            {
                message:
                    "Can you send a 1 kg aam ka achaar to Pune? I'll pay the courier.",
            },
            {
                message:
                    "Our office wants 40 Diwali boxes. Can we taste a sample first?",
            },
            { message: "Is the mixed achaar Jain? No onion, no garlic?" },
            {
                message:
                    "My nani used to make teet (karil) achaar in Barabanki. Do you ever make it?",
            },
            {
                message:
                    "Can I pick up on Friday afternoon? I'm in Nishatganj only then.",
            },
            {
                message:
                    "Looking for a monthly supply for our café in Hazratganj — 4 kg a month, mixed and nimbu.",
            },
            { message: "Do you have amla achaar now or only in winter?" },
            {
                message:
                    "I want to gift the monthly box to my sister in Indira Nagar. Can I pay for three months?",
            },
            {
                message:
                    "The bharwa lal mirch was wonderful. Can I order 2 kg for my in-laws in Kanpur?",
            },
            { message: "Do you deliver to Jankipuram extension?" },
            {
                message:
                    "Can you make sweet nimbu with less sugar for a diabetic?",
            },
            {
                message:
                    "We run a homestay in Mahanagar and would like to keep your pickles on the breakfast table. Wholesale rates?",
            },
            {
                message:
                    "How long does the gajar-gobhi-shalgam keep? Want to take it to Dubai in January.",
            },
            {
                message:
                    "Is there an Eid box this year? Need 10 for the family.",
            },
        ],
        pipeline: {
            name: "Bulk and gifting",
            stages: ["New", "Replied", "Quote sent", "Confirmed"],
        },
        notes: [
            "Sent a photo of the ribboned jars on WhatsApp — they loved it.",
            "Quoted ₹110 a jar for 100 g favours, delivery free in Lucknow.",
            "Wants a tasting first; Faizan will drop samples on Thursday.",
            "Asked Ammi — she can do it without vinegar, ready in five days.",
            "Courier only for sealed jars; told them about the double bag.",
        ],
        tasks: [
            "Call back with the wedding quote",
            "Drop off tasting samples",
            "Confirm the delivery date",
            "Send UPI details for the advance",
            "Check with Ammi if teet is possible this winter",
        ],
    },
    services: [],
    bookings: 0,
    qr: [
        {
            code: "dbb4",
            place: "OTHER",
            placeNote: "Sticker on every jar lid",
            label: "Scan to order again",
            targetKind: "SHOP",
            color: "#9a3412",
            perDay: 4,
            createdDaysAgo: 140,
        },
        {
            code: "kh7m",
            place: "CARD",
            placeNote: "Card in every delivery bag",
            label: "Ammi's pickles, made after you order",
            targetKind: "SITE",
            color: "#9a3412",
            perDay: 1.5,
            createdDaysAgo: 90,
        },
    ],
    discounts: [
        {
            code: "DIWALI10",
            description: "10% off for Diwali gifting",
            percentBps: 1000,
            startsDaysAgo: 8,
            endsInDays: 24,
        },
        {
            code: "DABBA5",
            description: "5% off for monthly box subscribers",
            percentBps: 500,
            startsDaysAgo: 200,
            endsInDays: null,
        },
        {
            code: "RAKHI15",
            description: "Raksha Bandhan, for sisters and brothers far away",
            percentBps: 1500,
            startsDaysAgo: 75,
            endsInDays: -62,
        },
    ],
    site: ({ productId }) => ({
        slug: "ammi-ki-barni",
        name: "Ammi Ki Barni",
        subdomain: "ammi-ki-barni",
        published: true,
        createdDaysAgo: 300,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    section("hero", {
                        heading: "Achaar the way Ammi makes it",
                        subheading:
                            "Home-made pickles from our kitchen in Nishatganj, Lucknow — made after you order, ready in three or four days.",
                        cta: {
                            label: "See our pickles",
                            href: "/pickles",
                            style: "primary",
                        },
                        image: coverOf(
                            (p) => /aam|mango/.test(p.slug) && madeToOrder(p),
                        ),
                    }),
                    section("features", {
                        heading: "How it works",
                        items: [
                            {
                                title: "You order",
                                body: "On WhatsApp, Instagram or here. Tell us the jar size and when you want it.",
                            },
                            {
                                title: "Ammi makes it",
                                body: "Fresh, in small batches, in kachi ghani mustard oil. Three or four days; sun pickles take five.",
                            },
                            {
                                title: "You collect, or Faizan brings it",
                                body: "Pick up in Nishatganj, or delivery across Lucknow on Tuesday, Thursday and Saturday.",
                            },
                        ],
                    }),
                    section("productGrid", {
                        title: "What people order most",
                        source: "picked",
                        productIds: topIds(productId, (p) => !isHamper(p), 6),
                        showPrices: true,
                    }),
                    section("testimonials", {
                        heading: "From our customers",
                        items: [
                            {
                                quote: "Tastes exactly like my nani's. The nimbu is gone in a week every time.",
                                name: "Farah S.",
                                role: "Aliganj",
                            },
                            {
                                quote: "I order the monthly dabba for my parents in Indira Nagar. Faizan always calls before he comes.",
                                name: "Rahul M.",
                                role: "Gomti Nagar",
                            },
                            {
                                quote: "The bharwa lal mirch is worth the five days.",
                                name: "Shalini T.",
                                role: "Mahanagar",
                            },
                        ],
                    }),
                    section("journal", {
                        title: "From Ammi's kitchen",
                        count: 3,
                    }),
                ],
            },
            {
                path: "/pickles",
                title: "Our pickles",
                sections: [
                    section("richText", {
                        format: "html",
                        value: "<h2>Our pickles</h2><p>Everything in a jar is made after you order it, in the size you ask for. Masalas, papad and aam papad are made in batches and kept on the shelf, so they go out the next day.</p>",
                    }),
                    section("productGrid", {
                        title: "Mango",
                        source: "picked",
                        productIds: topIds(
                            productId,
                            (p) =>
                                /aam|mango|chunda|launji/.test(p.slug) &&
                                !isHamper(p),
                            8,
                        ),
                        showPrices: true,
                    }),
                    section("productGrid", {
                        title: "Nimbu, mirch, lehsun and more",
                        source: "picked",
                        productIds: topIds(
                            productId,
                            (p) =>
                                madeToOrder(p) &&
                                !isHamper(p) &&
                                !/aam|mango|chunda|launji/.test(p.slug),
                            12,
                        ),
                        showPrices: true,
                    }),
                    section("productGrid", {
                        title: "Masalas, papad and aam papad",
                        source: "picked",
                        productIds: topIds(productId, (p) => p.tracked, 8),
                        showPrices: true,
                    }),
                    section("productGrid", {
                        title: "Gift boxes",
                        source: "picked",
                        productIds: topIds(productId, isHamper, 4),
                        showPrices: true,
                    }),
                ],
            },
            {
                path: "/how-ordering-works",
                title: "How ordering works",
                sections: [
                    section("richText", {
                        format: "html",
                        value: "<h2>Made after you order</h2><p>We don't keep jars of achaar waiting on a shelf. When your order comes in, Ammi cuts, spices and fills your jar, and it rests in the oil until it is ready — three or four days for most pickles, five for the ones that need the sun.</p><p>Order on WhatsApp, Instagram or this site. Faizan confirms the day it will be ready, and you either collect it from Nishatganj or he brings it to you.</p>",
                    }),
                    section("faq", {
                        heading: "Questions people ask",
                        items: [
                            {
                                question: "Where do you deliver?",
                                answer: "Across Lucknow, on Tuesday, Thursday and Saturday. ₹60, free above ₹999. Masalas, papad and gift boxes can go by courier anywhere in India for ₹150, dispatched on Mondays.",
                            },
                            {
                                question: "How do I pay?",
                                answer: "UPI or cash when you collect or when Faizan delivers. For big orders and courier orders we take the money in advance by UPI.",
                            },
                            {
                                question: "Can I change or cancel?",
                                answer: "Yes, until Ammi starts your jar — usually the morning after you order. Message Faizan and he'll sort it.",
                            },
                            {
                                question: "How long does it keep?",
                                answer: "Months, if you use a dry spoon and keep the oil above the pieces. Every jar has the date it was made on the lid.",
                            },
                            {
                                question: "Is there a monthly box?",
                                answer: "Achaar ka Dabba: three 250 g jars of the month's picks for ₹699, or the Chhota Dabba with two jars for ₹449. Ready on the first Saturday.",
                            },
                        ],
                    }),
                ],
            },
            {
                path: "/about",
                title: "About Ammi",
                sections: [
                    section("person", {
                        name: "Shabana Khan — Ammi",
                        role: "Cooks every jar",
                        bio: "Ammi learnt achaar in her mother's kitchen near Chowk, cutting raw mangoes on the floor with her sisters every May. She started selling to the neighbours in 2019, when the jars she gave away kept coming back empty with requests for more. Her son Faizan takes the orders, does the deliveries and answers the phone — Ammi still does all the cooking.",
                    }),
                    section("richText", {
                        format: "html",
                        value: "<h2>What we believe</h2><p>Small batches, kachi ghani mustard oil, whole spices roasted on the day, and no shortcuts. If a pickle isn't ready, it doesn't go out.</p>",
                        image: coverOf((p) => p.tracked),
                        imageSide: "right",
                    }),
                ],
            },
            {
                path: "/journal",
                title: "Journal",
                sections: [
                    section("journal", {
                        title: "Notes from the kitchen",
                        count: 6,
                    }),
                ],
            },
            {
                path: "/contact",
                title: "Contact",
                sections: [
                    {
                        type: "enquiry",
                        form: {
                            name: "Ask Ammi",
                            fields: [
                                {
                                    name: "name",
                                    label: "Your name",
                                    type: "text",
                                    required: true,
                                },
                                {
                                    name: "email",
                                    label: "Email",
                                    type: "email",
                                    required: true,
                                },
                                {
                                    name: "phone",
                                    label: "WhatsApp number",
                                    type: "tel",
                                },
                                {
                                    name: "message",
                                    label: "What would you like?",
                                    type: "textarea",
                                    required: true,
                                },
                            ],
                        },
                        content: {
                            title: "Ask Ammi",
                            description:
                                "Bulk orders, weddings, gifting, or a pickle you remember from your nani's kitchen — tell us and Faizan will call you back the same day.",
                            submitLabel: "Send",
                            successMessage:
                                "Shukriya! Faizan will call or WhatsApp you today.",
                        },
                    },
                    section("contact", {
                        heading: "Find us",
                        address: "B-14, Nishatganj Colony, Lucknow 226006",
                        hours: "Pick-up 11am–7pm every day; Friday from 3pm",
                        phone: "+91 00000 00023",
                        whatsapp: "+91 00000 00023",
                        email: "ammikibarni@example.com",
                    }),
                ],
            },
        ],
    }),
    footer: "Ammi Ki Barni · B-14, Nishatganj Colony, Lucknow · Made after you order",
    posts: ACHAAR_POSTS,
    postAuthor: "Shabana Khan",
    analytics: {
        viewsPerDay: 150,
        weekendFactor: 1.15,
        paths: [
            { path: "/", weight: 0.34 },
            { path: "/pickles", weight: 0.24 },
            { path: "/shop", weight: 0.14 },
            { path: "/how-ordering-works", weight: 0.09 },
            { path: "/journal", weight: 0.07 },
            { path: "/about", weight: 0.06 },
            { path: "/contact", weight: 0.06 },
        ],
    },
    contactSources: [
        { source: "WHATSAPP", weight: 40 },
        { source: "INSTAGRAM", weight: 25 },
        { source: "REFERRAL", weight: 18 },
        { source: "WEBSITE", weight: 10 },
        { source: "QR", weight: 7 },
    ],
};

/** Faizan delivers on Tuesday, Thursday and Saturday. */
function nextDeliveryDay(at: Date): Date {
    for (let d = 0; d < 7; d++) {
        const day = istAt(at, d, 15 * 60);
        if ([2, 4, 6].includes(weekdayOf(day))) return day;
    }
    return at;
}

/** Couriers go out on Mondays. */
function nextMonday(at: Date): Date {
    for (let d = 0; d < 7; d++) {
        const day = istAt(at, d, 12 * 60);
        if (weekdayOf(day) === 1) return day;
    }
    return at;
}

export function seedAchaar(ctx: DemoShopContext): Promise<DemoShopResult> {
    return seedDemoShop(ctx, CONFIG);
}

/** The states Ammi Ki Barni's demo and films rely on. */
const CHECKS: DemoShopCheck[] = [
    {
        what: "fewer than 15 made-to-order products that count no stock",
        rows: async (prisma, orgId) => {
            const n = await prisma.product.count({
                where: {
                    organizationId: orgId,
                    stockTracked: false,
                    status: "PUBLISHED",
                },
            });
            return n >= 15 ? [] : [{ madeToOrder: n }];
        },
    },
    {
        what: "no open order being made, due in the next two to four days",
        rows: async (prisma, orgId, now) => {
            const open = await prisma.order.findMany({
                where: {
                    organizationId: orgId,
                    stage: { in: ["NEW", "PREPARING"] },
                    status: { not: "CANCELLED" },
                },
                select: { createdAt: true },
            });
            const due = open.filter((o) => {
                const age =
                    (now.getTime() - o.createdAt.getTime()) / 86_400_000;
                return age >= 0 && age <= 2;
            });
            return due.length >= 5 ? [] : [{ makingNow: due.length }];
        },
    },
    {
        what: "no Diwali bulk order, or no shelf sold out and low",
        rows: async (prisma, orgId) => {
            const [bulk, levels] = await Promise.all([
                prisma.orderItem.count({
                    where: {
                        order: { organizationId: orgId },
                        quantity: { gte: 8 },
                    },
                }),
                prisma.stockLevel.findMany({
                    where: { organizationId: orgId },
                    select: {
                        onHand: true,
                        promised: true,
                        lowStockAlert: true,
                    },
                }),
            ]);
            const soldOut = levels.filter(
                (l) => l.onHand - l.promised <= 0,
            ).length;
            const low = levels.filter(
                (l) =>
                    l.onHand - l.promised > 0 &&
                    l.onHand - l.promised <= l.lowStockAlert,
            ).length;
            return bulk >= 2 && soldOut >= 1 && low >= 1
                ? []
                : [{ bulk, soldOut, low }];
        },
    },
    {
        what: "orders by month outside 120–200, or customers outside 90–130",
        rows: async (prisma, orgId, now) => {
            const since = new Date(now.getTime() - 30 * 86_400_000);
            const [month, customers] = await Promise.all([
                prisma.order.count({
                    where: { organizationId: orgId, createdAt: { gte: since } },
                }),
                prisma.customer.count({ where: { organizationId: orgId } }),
            ]);
            return month >= 120 &&
                month <= 200 &&
                customers >= 90 &&
                customers <= 130
                ? []
                : [{ month, customers }];
        },
    },
    {
        what: "subscriptions not about 50 ongoing and 50 ended",
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

export function checkAchaar(prisma: Db, now: Date) {
    return checkDemoShop(prisma, {
        orgId: ACHAAR_ORG_ID,
        name: CONFIG.name,
        now,
        checks: CHECKS,
    });
}
