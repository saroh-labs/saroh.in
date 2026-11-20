import type { HubDetail } from "@saroh/marketing/solutions/hub-finder";

import { NAV_WORDS } from "./nav";

/**
 * The /for hub (boards SOHubDesk, SOHubPhone2): the trades by what they do,
 * each at one ordinary moment of its day. Names, promises and search words
 * stay each page's own (its MDX, read through `searchPages`); this file
 * holds only the hub's words, its groups and each trade's moment. A built
 * page missing here still shows, under its family, with its own hero line.
 */

export interface HubMoment {
    slug: string;
    /** "HH:MM", 24-hour. */
    at: string;
    line: string;
    detail: HubDetail;
}

export interface HubGroup {
    id: string;
    title: string;
    /** How customers come to this group's trades. */
    how: string;
    trades: readonly HubMoment[];
}

/** A page's schema family, for a trade this file doesn't place yet. */
export const FAMILY_GROUP: Readonly<Partial<Record<string, string>>> = {
    "Shops and food": "food",
    Beauty: "beauty",
    "Fitness and classes": "fitness",
    Health: "health",
    Learning: "learning",
};

export const HUB_WORDS = {
    crumb: "Solutions",
    h1Before: "A day in your",
    h1Mark: "trade.",
    lead: (n: number) =>
        `${n} kinds of small business, each shown at one ordinary moment of its day. Find yours and follow the whole day: the first booking, the order that comes in while you’re busy, the payment that lands, and what’s waiting tomorrow.`,
    phoneLead: (n: number) =>
        `${n} kinds of small business, each at one ordinary moment. Find yours.`,
    searchLabel: "Search trades",
    searchPlaceholder: "Search your trade, like bakery, salon or tuition",
    what: "What you do",
    all: "All",
    how: "How customers come to you",
    howShort: "Customers come to you by",
    anyWay: "Any way",
    ways: {
        appointments: "Booking a time",
        classes: "Joining a class",
        orders: "Placing an order",
    },
    /** Filled in the browser: {every}, {shown}. */
    count: { all: "All {every} trades", some: "{shown} of {every} trades" },
    reset: "Reset all",
    trades: "{n} trades",
    flagship: "A whole day, told in full",
    door: (n: number, example: string) =>
        `${n === 1 ? "One trade has" : `${n === 2 ? "Two" : n} trades have`} a whole day told in full. Start with Monday at ${example}.`,
    doorTime: "7 am to 9 pm",
    az: "All trades, A to Z",
    azLine: "One tap to each page",
    find: "Find your trade",
    none: 'No page for "{q}" yet',
    tellTitle: "Don’t see your trade? Tell us.",
    tellBody:
        "Saroh runs on three things: bookings, classes and orders. Tell us what you do and we’ll write your trade’s day next. If your customers book a time, join a batch or place an order, you can start today.",
    tellLink: "Tell us your trade",
    templates: "Browse templates",
    note: "Free to start. No card needed.",
    doors: [
        {
            title: NAV_WORDS.howItWorks,
            body: "Every moment on these pages uses a part of Saroh. See how each one works: your site, orders, bookings, payments and sharing.",
            link: "All features",
            href: "/features",
        },
        {
            title: "New to Saroh?",
            body: "Start at the beginning: what Saroh is, what it costs to start, and the four jobs it does for you.",
            link: "What Saroh is",
            href: "/",
        },
    ],
} as const;

export const HUB_GROUPS: readonly HubGroup[] = [
    {
        id: "food",
        title: "Food and shops",
        how: "They place an order, at the counter or on your site.",
        trades: [
            {
                slug: "home-bakers",
                at: "07:00",
                line: "Three cakes to bake today, and one still isn’t paid.",
                detail: {
                    kind: "pill",
                    text: "Unpaid · ₹1,450 · Send pay link",
                    tone: "warn",
                },
            },
            {
                slug: "florists",
                at: "06:00",
                line: "Three orders go out today, each with its card.",
                detail: {
                    kind: "pill",
                    text: "3 orders · 11 am to 7 pm",
                },
            },
            {
                slug: "cafes",
                at: "08:15",
                line: "An office order for twelve cold coffees, billed before the rush.",
                detail: {
                    kind: "bill",
                    label: "Bill 212 · GST",
                    amount: "₹2,640",
                },
            },
            {
                slug: "shops",
                at: "09:00",
                line: "Shutter up. Two orders from last night are ready to pack.",
                detail: {
                    kind: "pill",
                    text: "2 to pack · 1 collect",
                },
            },
            {
                slug: "boutiques",
                at: "11:30",
                line: "A kurta in M sells at the counter, and the site knows straight away.",
                detail: {
                    kind: "pill",
                    text: "Size M · 3 → 2 left",
                },
            },
            {
                slug: "cloud-kitchens",
                at: "12:40",
                line: "Lunch orders cooked and sent out in the order they came.",
                detail: {
                    kind: "slots",
                    label: "Order 88 cooking · 89 next",
                    taken: 3,
                    of: 6,
                },
            },
            {
                slug: "gift-shops",
                at: "16:00",
                line: "Christmas hampers are going fast. Twelve left on the shelf.",
                detail: {
                    kind: "bar",
                    label: "Christmas hamper",
                    n: 12,
                    of: 40,
                },
            },
        ],
    },
    {
        id: "beauty",
        title: "Beauty and wellness",
        how: "They book a time, with the person they want.",
        trades: [
            {
                slug: "barbers",
                at: "09:30",
                line: "Every chair booked, and nobody standing at the door.",
                detail: {
                    kind: "pill",
                    text: "3 chairs · 0 waiting",
                    tone: "paid",
                },
            },
            {
                slug: "salons",
                at: "10:30",
                line: "Neel’s chair is booked till four. Walk-ins see who’s free.",
                detail: {
                    kind: "slots",
                    label: "Neel · free from 4 pm",
                    taken: 6,
                    of: 8,
                },
            },
            {
                slug: "nail-studios",
                at: "13:15",
                line: "A gel set booked for the ninety minutes it really takes.",
                detail: {
                    kind: "pill",
                    text: "Gel set · 90 min",
                },
            },
            {
                slug: "makeup-artists",
                at: "14:00",
                line: "The December wedding date is held, and the advance is in.",
                detail: {
                    kind: "pill",
                    text: "Advance paid · Sat 12 Dec",
                    tone: "paid",
                },
            },
            {
                slug: "spas",
                at: "17:00",
                line: "Two therapists, four rooms, and the phone stays quiet.",
                detail: {
                    kind: "bar",
                    label: "Rooms this evening",
                    n: 4,
                    of: 4,
                },
            },
            {
                slug: "tattoo-studios",
                at: "19:00",
                line: "The deposit is in before the stencil is drawn.",
                detail: {
                    kind: "pill",
                    text: "Deposit paid · ₹2,000",
                    tone: "paid",
                },
            },
            {
                slug: "mehendi-artists",
                at: "20:00",
                line: "A bridal date fixed in one message, not twenty.",
                detail: {
                    kind: "pill",
                    text: "Bridal · Sun 13 Dec · held",
                },
            },
        ],
    },
    {
        id: "fitness",
        title: "Fitness and classes",
        how: "They join a class, a batch or a pack.",
        trades: [
            {
                slug: "gyms",
                at: "06:00",
                line: "The six o’clock batch is full, and you know who hasn’t paid this month.",
                detail: {
                    kind: "bar",
                    label: "6 am strength",
                    n: 18,
                    of: 18,
                },
            },
            {
                slug: "personal-trainers",
                at: "06:45",
                line: "Your clients, their sessions and their fees, all on your phone.",
                detail: {
                    kind: "pill",
                    text: "Client · session 7 of 10",
                },
            },
            {
                slug: "yoga-studios",
                at: "07:00",
                line: "Twelve mats booked for sunrise flow.",
                detail: {
                    kind: "bar",
                    label: "Sunrise flow",
                    n: 12,
                    of: 15,
                },
            },
            {
                slug: "swimming-classes",
                at: "08:00",
                line: "The summer batch filled before the phone started ringing.",
                detail: {
                    kind: "bar",
                    label: "Summer batch",
                    n: 20,
                    of: 20,
                },
            },
            {
                slug: "dance-classes",
                at: "17:30",
                line: "Saturday batch, fees in, and no paper register.",
                detail: {
                    kind: "pill",
                    text: "November fees · 22 of 24 paid",
                    tone: "paid",
                },
            },
            {
                slug: "martial-arts",
                at: "18:30",
                line: "Grading day on Sunday, every student’s belt on one list.",
                detail: {
                    kind: "pill",
                    text: "Grading · Sun · 31 students",
                },
            },
            {
                slug: "zumba-classes",
                at: "19:30",
                line: "A full floor tonight, and the month’s fees already in.",
                detail: {
                    kind: "bar",
                    label: "Evening Zumba",
                    n: 25,
                    of: 25,
                },
            },
        ],
    },
    {
        id: "health",
        title: "Health and care",
        how: "Patients and clients book a visit, then come back.",
        trades: [
            {
                slug: "pathology-labs",
                at: "07:00",
                line: "A calmer morning queue, and a bill for every test.",
                detail: {
                    kind: "bill",
                    label: "Bill 88 · 3 tests",
                    amount: "₹1,250",
                },
            },
            {
                slug: "ayurveda-clinics",
                at: "07:30",
                line: "Panchakarma day three: therapist and room ready.",
                detail: {
                    kind: "pill",
                    text: "Day 3 of 7 · Room 2",
                },
            },
            {
                slug: "physiotherapy",
                at: "08:30",
                line: "Knee rehab, visit seven, written in before the next patient.",
                detail: {
                    kind: "pill",
                    text: "Visit 7 of 12",
                },
            },
            {
                slug: "clinics",
                at: "09:00",
                line: "Patients booked their own times. You know what to check first.",
                detail: {
                    kind: "slots",
                    label: "9 of 12 slots booked",
                    taken: 9,
                    of: 12,
                },
            },
            {
                slug: "dental-clinics",
                at: "10:00",
                line: "Root canal, sitting two of three, booked for Thursday.",
                detail: {
                    kind: "pill",
                    text: "Sitting 2 of 3 · Thu",
                },
            },
            {
                slug: "dermatology-clinics",
                at: "11:00",
                line: "Laser sitting four of six, and every one on track.",
                detail: {
                    kind: "bar",
                    label: "Laser course",
                    n: 4,
                    of: 6,
                },
            },
            {
                slug: "dieticians",
                at: "15:00",
                line: "Week-four follow-up booked, and the plan billed.",
                detail: {
                    kind: "pill",
                    text: "Follow-up · week 4",
                    tone: "paid",
                },
            },
            {
                slug: "homeopathy-clinics",
                at: "16:30",
                line: "Follow-up booked, with your notes from last time at hand.",
                detail: {
                    kind: "pill",
                    text: "Notes · 2 visits",
                },
            },
            {
                slug: "counsellors",
                at: "18:00",
                line: "A session booked and paid, without the back-and-forth.",
                detail: {
                    kind: "pill",
                    text: "Paid · 50 min",
                    tone: "paid",
                },
            },
        ],
    },
    {
        id: "learning",
        title: "Learning",
        how: "Students take a seat in a batch and pay by the month.",
        trades: [
            {
                slug: "art-classes",
                at: "11:00",
                line: "Saturday kids’ workshop: eight of ten seats taken.",
                detail: {
                    kind: "bar",
                    label: "Kids’ workshop",
                    n: 8,
                    of: 10,
                },
            },
            {
                slug: "coaching-centres",
                at: "16:00",
                line: "Batch seats counted, and the month’s fees asked for.",
                detail: {
                    kind: "pill",
                    text: "Class 10 batch · 36 of 40",
                },
            },
            {
                slug: "home-tuition",
                at: "17:00",
                line: "Timings fixed and fees asked for, with no notebook.",
                detail: {
                    kind: "pill",
                    text: "Mon · Wed · Fri · 5 pm",
                },
            },
            {
                slug: "music-classes",
                at: "18:00",
                line: "Every lesson booked, and this month’s fee asked for.",
                detail: {
                    kind: "pill",
                    text: "Fee link sent · 6 students",
                },
            },
        ],
    },
];
