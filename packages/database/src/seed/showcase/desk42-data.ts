import type { SeedSite } from "../data";
import type { ShowcasePack, ShowcaseService } from "./data";
import type { DemoImage } from "./demo-content";
import { demoAsset } from "./demo-content";
import { DK_PHOTOS } from "./desk42-photos";
import type {
    BusinessSpec,
    PlanSpec,
    ProductSpec,
    QrSpec,
    StaffSpec,
} from "./vertical";
import { block } from "./vertical";

/**
 * Desk 42 — a small coworking space on Baner Road, Pune, shown as a CONCEPT:
 * what a coworking space can run on Saroh today, kept honest.
 *
 * - The DAY PASS is a class-style service with 20 places a weekday (the 20
 *   hot desks), bought online or with a Flexi 10 pack of ten;
 * - the MEETING ROOM and the CALL BOOTH are one-to-one services by the
 *   hour: one room, so capacity 1. Two hours is two bookings;
 * - MEMBERSHIPS (hot desk, dedicated desk, virtual office) are monthly
 *   subscription plans;
 * - café items, lockers, printing credits and merch are products.
 *
 * What it cannot show: desks and rooms as bookable resources (a floor plan,
 * which desk, a room for 90 minutes), member credits (four room hours a
 * month), check-in at the door, or the mail a virtual office receives.
 */

export const DK_KEY = "dk";
export const DK_SLUG = "desk-42";
export const DK_NAME = "Desk 42";
/** Business centre and coworking services (GST, 18%). */
export const DK_SAC = "997212";

const asset = (file: string, alt: string): DemoImage => ({
    url: demoAsset(DK_SLUG, file),
    alt,
    width: 1600,
    height: 1000,
    creditName: null,
    creditUrl: null,
});

export const DK_DRAWN = {
    floorPlan: asset(
        "floor-plan.png",
        "Desk 42 floor plan: hot desks, dedicated desks, the Sahyadri Room, the call booth, café and lockers",
    ),
    plans: asset(
        "plans-card.png",
        "The three memberships compared: hot desk, dedicated desk, virtual office",
    ),
    roomBooking: asset(
        "room-booking.png",
        "How to book the Sahyadri Room, in four steps",
    ),
    tshirt: asset("tshirt.png", "Desk 42 T-shirt, charcoal, front"),
};

export const DK_SPEC: BusinessSpec = {
    key: DK_KEY,
    slug: DK_SLUG,
    name: DK_NAME,
    legalName: "Desk Forty Two Workspaces Private Limited",
    type: "pvt",
    gst: { state: "27", pan: "AAKCD4242M", prefix: "DK" },
    address: {
        line1: "4th floor, Sai Capital, Baner Road, near Balewadi Phata",
        city: "Pune",
        postalCode: "411045",
    },
    printedAddress:
        "4th floor, Sai Capital, Baner Road, near Balewadi Phata, Pune 411045, Maharashtra",
    phone: "+912041424242",
    contactEmail: "desk42@example.com",
    modules: [
        "APPOINTMENTS",
        "CRM",
        "WEBSITE",
        "PAYMENTS",
        "COMMERCE",
        "INSIGHTS",
        "CLASS_PACKS",
    ],
    team: [
        { first: "Rhea", last: "Deshpande", role: "ADMIN" },
        { first: "Omkar", last: "Pawar", role: "MEMBER" },
    ],
    paymentProvider: "RAZORPAY",
    createdDaysAgo: 520,
    storefront: {
        name: "Desk 42, Baner",
        description:
            "Café, lockers, printing and Desk 42 things, at the front desk.",
        address: "4th floor, Sai Capital, Baner Road, Pune 411045",
        hours: [
            { day: "MON", open: "08:00", close: "21:00", closed: false },
            { day: "TUE", open: "08:00", close: "21:00", closed: false },
            { day: "WED", open: "08:00", close: "21:00", closed: false },
            { day: "THU", open: "08:00", close: "21:00", closed: false },
            { day: "FRI", open: "08:00", close: "21:00", closed: false },
            { day: "SAT", open: "09:00", close: "18:00", closed: false },
            { day: "SUN", open: "00:00", close: "00:00", closed: true },
        ],
    },
    bookingRules: {
        bookAheadDays: 30,
        latestBookingMinutes: 30,
        freeCancelHours: 24,
    },
};

const MON_FRI = [1, 2, 3, 4, 5] as const;

export const DK_SERVICES: readonly (ShowcaseService & {
    sac: string;
    shown: boolean;
})[] = [
    {
        name: "Day pass — hot desk",
        description:
            "A desk in the open area from 8 am to 9 pm, Monday to Friday: Wi-Fi, a locker for the day, tea and filter coffee. Twenty desks a day.",
        minutes: 780,
        capacity: 20,
        priceCents: 49_900,
        rules: [{ days: MON_FRI, from: "08:00", to: "21:00" }],
        weight: 2.6,
        regulars: 28,
        sac: DK_SAC,
        shown: true,
    },
    {
        name: "The Sahyadri Room — meeting room, per hour",
        description:
            "Eight seats, a 65-inch screen, a whiteboard and good light. Book by the hour; two hours is two bookings back to back.",
        minutes: 60,
        capacity: 1,
        priceCents: 80_000,
        rules: [
            { days: MON_FRI, from: "09:00", to: "20:00" },
            { days: [6], from: "10:00", to: "17:00" },
        ],
        weight: 9,
        regulars: 26,
        sac: DK_SAC,
        shown: true,
    },
    {
        name: "Call & podcast booth — per hour",
        description:
            "A soundproofed booth for one or two: two microphones, a ring light, a door that shuts. For interviews, client calls and recording.",
        minutes: 60,
        capacity: 1,
        priceCents: 30_000,
        rules: [
            { days: MON_FRI, from: "08:00", to: "21:00" },
            { days: [6], from: "09:00", to: "18:00" },
        ],
        weight: 3,
        regulars: 12,
        sac: DK_SAC,
        shown: true,
    },
    {
        name: "Free tour of the space",
        description:
            "Thirty minutes with Rhea: the desks, the room, the booth and the café, and which membership fits. Stay for a coffee.",
        minutes: 30,
        capacity: 1,
        priceCents: null,
        rules: [
            { days: [1, 2, 3, 4, 5, 6], from: "11:00", to: "13:00" },
            { days: [1, 2, 3, 4, 5, 6], from: "16:00", to: "18:00" },
        ],
        weight: 1.6,
        sac: DK_SAC,
        shown: true,
    },
];

export const DK_SERVICE = { dayPass: 0, room: 1, booth: 2, tour: 3 } as const;

export const DK_STAFF: readonly StaffSpec[] = [
    {
        key: "rhea",
        name: "Rhea Deshpande",
        title: "Community manager",
        login: "rhea",
        services: [DK_SERVICE.tour],
        hours: [
            { days: MON_FRI, from: "10:00", to: "19:00" },
            { days: [6], from: "10:00", to: "18:00" },
        ],
    },
    {
        key: "omkar",
        name: "Omkar Pawar",
        title: "Front desk & operations",
        login: "omkar",
        services: [],
        hours: [
            { days: MON_FRI, from: "08:00", to: "17:00" },
            { days: [6], from: "09:00", to: "18:00" },
        ],
    },
];

export const DK_PACKS: readonly ShowcasePack[] = [
    {
        name: "Flexi 10 — ten day passes",
        description:
            "Ten day passes to use within three months, on the days you choose. ₹449 a day instead of ₹499.",
        credits: 10,
        validityDays: 90,
        pricePaise: 449_000,
        services: [DK_SERVICE.dayPass],
        status: "ACTIVE",
        buyers: 12,
    },
];

export const DK_PLANS: readonly PlanSpec[] = [
    {
        name: "Hot desk — monthly",
        description:
            "Any free desk in the open area, Monday to Saturday in opening hours. Wi-Fi, printing at member rates, café tab on your invoice.",
        interval: "MONTH",
        pricePaise: 650_000,
        sac: DK_SAC,
    },
    {
        name: "Dedicated desk — monthly",
        description:
            "Your own desk and storage pedestal, 24×7 access with a key card, and four meeting-room hours a month.",
        interval: "MONTH",
        pricePaise: 950_000,
        sac: DK_SAC,
    },
    {
        name: "Virtual office — monthly",
        description:
            "A Baner business address for your GST registration and letterhead, mail received and scanned, and two day passes a month.",
        interval: "MONTH",
        pricePaise: 199_900,
        sac: DK_SAC,
    },
];

export const DK_CATEGORIES = [
    { key: "cafe", name: "Café" },
    { key: "desk-extras", name: "Lockers & printing" },
    { key: "merch", name: "Desk 42 things" },
];

const CAFE = { hsn: "996331", gstRate: 5, category: "cafe" } as const;
const regularLarge = (sku: string, regular: string, large: string) => [
    {
        title: "Regular",
        sku: `${sku}-R`,
        price: regular,
        onHand: 120,
        warnAt: 20,
    },
    { title: "Large", sku: `${sku}-L`, price: large, onHand: 80, warnAt: 15 },
];

export const DK_PRODUCTS: readonly ProductSpec[] = [
    {
        ...CAFE,
        slug: "filter-coffee",
        name: "Filter coffee",
        description:
            "South Indian filter coffee, decoction brewed fresh every morning, with hot milk and a little sugar unless you say otherwise.",
        keyPoints: [
            "Brewed fresh every morning",
            "Regular 150 ml, Large 250 ml",
        ],
        price: "60.00",
        images: [DK_PHOTOS.filterCoffee],
        option: "Size",
        variants: regularLarge("FC", "60.00", "90.00"),
        weight: 6,
        qty: [1, 2],
    },
    {
        ...CAFE,
        slug: "cappuccino",
        name: "Cappuccino",
        description: "A double shot of Chikmagalur arabica with steamed milk.",
        keyPoints: ["Double shot", "Oat milk on request"],
        price: "120.00",
        images: [DK_PHOTOS.cappuccino],
        option: "Size",
        variants: regularLarge("CP", "120.00", "160.00"),
        weight: 5,
        qty: [1, 2],
    },
    {
        ...CAFE,
        slug: "cold-coffee",
        name: "Cold coffee",
        description:
            "Blended with ice and a scoop of vanilla ice cream. The 4 pm one.",
        keyPoints: ["Made to order"],
        price: "140.00",
        images: [DK_PHOTOS.coldCoffee],
        option: "Size",
        variants: regularLarge("CC", "140.00", "180.00"),
        weight: 3,
        qty: [1, 1],
    },
    {
        ...CAFE,
        slug: "masala-chai",
        name: "Masala chai",
        description:
            "Sunita's chai: ginger, cardamom, a little clove. Boiled, not brewed.",
        keyPoints: ["Ginger and cardamom", "Cutting or full glass"],
        price: "40.00",
        images: [DK_PHOTOS.chai],
        stock: { onHand: 200, warnAt: 30 },
        weight: 6,
        qty: [1, 3],
    },
    {
        ...CAFE,
        slug: "poha",
        name: "Kanda poha",
        description:
            "Poha with onion, peanuts and a squeeze of lime, made until 11 am.",
        keyPoints: ["Until 11 am"],
        price: "70.00",
        images: [DK_PHOTOS.poha],
        stock: { onHand: 30, warnAt: 8 },
        weight: 3,
        qty: [1, 2],
    },
    {
        ...CAFE,
        slug: "veg-grilled-sandwich",
        name: "Veg grilled sandwich",
        description:
            "Potato, capsicum, tomato and green chutney, grilled. With ketchup.",
        keyPoints: ["Green chutney", "Grilled to order"],
        price: "110.00",
        images: [DK_PHOTOS.sandwich],
        stock: { onHand: 40, warnAt: 8 },
        weight: 3,
        qty: [1, 2],
    },
    {
        ...CAFE,
        slug: "oat-jaggery-cookies",
        name: "Oat & jaggery cookies — two",
        description: "Baked for us by a home baker in Aundh. Two in a bag.",
        keyPoints: ["Baked in Aundh", "No refined sugar"],
        price: "60.00",
        images: [DK_PHOTOS.cookies],
        stock: { onHand: 36, warnAt: 10 },
        weight: 2,
        qty: [1, 2],
    },
    {
        slug: "locker-rental",
        name: "Locker — one month",
        category: "desk-extras",
        description:
            "A locker by the front desk for a month, with its own key. A lost key is ₹300.",
        keyPoints: ["Small fits a laptop bag", "Large fits a monitor box"],
        price: "600.00",
        hsn: DK_SAC,
        gstRate: 18,
        images: [DK_PHOTOS.lockers],
        option: "Locker size",
        variants: [
            {
                title: "Small",
                sku: "LK-S",
                price: "600.00",
                onHand: 9,
                warnAt: 2,
            },
            {
                title: "Large",
                sku: "LK-L",
                price: "900.00",
                onHand: 2,
                warnAt: 1,
            },
        ],
        weight: 1.2,
        qty: [1, 1],
    },
    {
        slug: "printing-credits",
        name: "Printing credits",
        category: "desk-extras",
        description:
            "Credits for the printer and scanner by the café. Black and white is ₹3 a page, colour ₹12. Credits carry over month to month.",
        keyPoints: ["Scan to email is free", "Credits carry over"],
        price: "300.00",
        hsn: "998912",
        gstRate: 18,
        images: [DK_PHOTOS.printer],
        option: "Pack",
        variants: [
            {
                title: "100 black & white pages",
                sku: "PR-BW100",
                price: "300.00",
                onHand: 500,
                warnAt: 50,
            },
            {
                title: "50 colour pages",
                sku: "PR-CL50",
                price: "600.00",
                onHand: 500,
                warnAt: 50,
            },
        ],
        weight: 2.5,
        qty: [1, 1],
    },
    {
        slug: "desk-42-tote",
        name: "Desk 42 tote bag",
        category: "merch",
        description:
            "A heavy cotton tote that takes a 15-inch laptop and lunch.",
        keyPoints: ["Heavy cotton canvas", "Fits a 15-inch laptop"],
        price: "399.00",
        hsn: "6305",
        gstRate: 5,
        images: [DK_PHOTOS.tote],
        stock: { onHand: 22, warnAt: 5 },
        weight: 0.6,
        qty: [1, 1],
    },
    {
        slug: "desk-42-mug",
        name: "Desk 42 mug",
        category: "merch",
        description: "The mug members leave at their desk. 350 ml, stoneware.",
        keyPoints: ["350 ml stoneware", "Dishwasher safe"],
        price: "349.00",
        hsn: "6912",
        gstRate: 5,
        images: [DK_PHOTOS.mug],
        stock: { onHand: 3, warnAt: 5 },
        weight: 0.6,
        qty: [1, 2],
    },
    {
        slug: "desk-42-notebook",
        name: "Desk 42 notebook",
        category: "merch",
        description: "A5, dotted, 160 pages, lies flat.",
        keyPoints: ["A5 dotted", "160 pages"],
        price: "249.00",
        hsn: "4820",
        gstRate: 0,
        images: [DK_PHOTOS.notebook],
        stock: { onHand: 30, warnAt: 6 },
        weight: 0.5,
        qty: [1, 2],
    },
    {
        slug: "desk-42-t-shirt",
        name: "Desk 42 T-shirt",
        category: "merch",
        description: "Charcoal cotton, the 42 small on the chest.",
        keyPoints: ["100% cotton", "S to XL"],
        price: "549.00",
        hsn: "6109",
        gstRate: 5,
        images: [DK_DRAWN.tshirt],
        option: "Size",
        variants: ["S", "M", "L", "XL"].map((title, k) => ({
            title,
            sku: `DT-${title}`,
            onHand: [4, 9, 7, 3][k],
            warnAt: 2,
        })),
        weight: 0.4,
        qty: [1, 1],
    },
];

export const DK_QR: readonly QrSpec[] = [
    {
        key: "front-desk",
        code: "b3kd",
        targetKind: "BOOK",
        place: "COUNTER",
        placeNote: "Standee at the front desk",
        label: "Book a day pass or the meeting room",
        color: "#0f766e",
        createdDaysAgo: 150,
        perDay: 4,
    },
    {
        key: "cafe-counter",
        code: "c8nv",
        targetKind: "SHOP",
        place: "COUNTER",
        placeNote: "Café counter, next to the menu board",
        label: "Order from the café",
        color: "#b45309",
        createdDaysAgo: 150,
        perDay: 5,
    },
    {
        key: "visiting-card",
        code: "v2tp",
        targetKind: "SITE",
        place: "CARD",
        placeNote: "Back of Rhea's visiting cards",
        label: "Desk 42, Baner",
        color: "#0f766e",
        createdDaysAgo: 120,
        perDay: 1,
    },
];

export const DK_NAMES = {
    first: [
        "Aditya",
        "Amruta",
        "Aniket",
        "Ashwini",
        "Chinmay",
        "Gauri",
        "Harshad",
        "Isha",
        "Ketaki",
        "Mihir",
        "Neha",
        "Nikhil",
        "Pooja",
        "Prathamesh",
        "Rasika",
        "Rohan",
        "Rutuja",
        "Sagar",
        "Saee",
        "Shreyas",
        "Siddharth",
        "Sneha",
        "Tanvi",
        "Tejas",
        "Varun",
        "Vrushali",
        "Yash",
        "Arjun",
        "Kabir",
        "Meera",
        "Zoya",
        "Ankita",
        "Devika",
        "Kunal",
        "Priya",
        "Rahul",
        "Aarti",
        "Manish",
    ],
    last: [
        "Kulkarni",
        "Deshpande",
        "Joshi",
        "Patil",
        "Bhosale",
        "Gokhale",
        "Apte",
        "Kale",
        "Shinde",
        "Jadhav",
        "Phadke",
        "Ranade",
        "Sathe",
        "Karve",
        "Naik",
        "Gadgil",
        "Mehta",
        "Shah",
        "Iyer",
        "Nair",
        "Rao",
        "Menon",
        "Khan",
        "D'Souza",
        "Chavan",
    ],
    companies: [
        "Pixel and Paper Studio",
        "Patil & Associates, Chartered Accountants",
        "Monsoon Labs",
        "Sahyadri Treks",
        "Inkwell Content Co.",
        "TrailRoute Logistics",
        "Kale Interiors",
        "Brightwire Analytics",
        "Ghats & Grains Foods",
        "Rao Legal",
        "Northstar HR Consulting",
    ],
    companyShare: 0.55,
};

export const DK_LEADS: readonly { title: string; value: number }[] = [
    { title: "Dedicated desks for a team of four", value: 3_800_000 },
    { title: "Hot desk membership", value: 650_000 },
    { title: "Virtual office for GST registration", value: 2_398_800 },
    { title: "Monthly workshop in the Sahyadri Room", value: 960_000 },
    { title: "Weekly podcast recording in the booth", value: 480_000 },
    { title: "Dedicated desk from next month", value: 950_000 },
];

export const DK_PIPELINE = {
    name: "Memberships",
    stages: ["Enquiry", "Tour booked", "Trial day", "Proposal sent", "Joined"],
};

export const DK_TIMELINE = {
    notes: [
        "Works for a Bengaluru startup, fully remote. Tired of working from home in Wakad.",
        "Team of four designers; want desks together near a window. Desks 9–12 are free from the 1st.",
        "Needs the address for GST registration only. Sent the NOC format.",
        "Came for the tour, loved the booth. Records a weekly podcast on Thursdays.",
        "Comparing us with a bigger space in Hinjewadi — price is close, commute is the point.",
        "Wants a monthly invoice in the company name with GSTIN. Confirmed.",
        "Went with a space in Kharadi, closer to the client.",
    ],
    tasks: [
        "Send the membership comparison on WhatsApp",
        "Book the free tour",
        "Share the NOC format for GST",
        "Follow up after the trial day",
        "Send the proposal for four dedicated desks",
    ],
};

export const DK_ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "company", label: "Company (if any)", type: "text" },
    { name: "team", label: "How many desks?", type: "text" },
    {
        name: "message",
        label: "What do you need?",
        type: "textarea",
        required: true,
    },
] as const;

export const DK_ENQUIRIES: readonly { team: string; message: string }[] = [
    {
        team: "4",
        message:
            "We are a four-person design studio moving out of a flat in Aundh. Do you have four dedicated desks together?",
    },
    {
        team: "1",
        message:
            "Need a virtual office address in Baner for GST registration. What documents do you give?",
    },
    {
        team: "1",
        message: "Can I try a day before taking the hot desk membership?",
    },
    {
        team: "0",
        message:
            "Is the meeting room available for a half-day workshop on Saturdays, 10 to 2?",
    },
    {
        team: "1",
        message:
            "I record a podcast. How soundproof is the booth, and can I bring my own mic?",
    },
    {
        team: "2",
        message:
            "Two of us, remote for a Bengaluru company. Is the Wi-Fi reliable enough for calls all day?",
    },
    {
        team: "1",
        message: "Do you have parking for a car, or only two-wheelers?",
    },
    {
        team: "6",
        message:
            "Our team of six needs a base in Pune for three months. Can you do a custom monthly price?",
    },
    {
        team: "1",
        message: "Is there 24-hour access? I work US hours sometimes.",
    },
    {
        team: "1",
        message: "Can I bring a client to the café without a day pass?",
    },
    { team: "1", message: "Do day passes work on Saturdays?" },
    {
        team: "3",
        message:
            "Looking for a small space for our CA practice — three desks and a cabinet.",
    },
    {
        team: "1",
        message: "How does mail handling work for the virtual office?",
    },
    {
        team: "1",
        message:
            "I'm moving to Baner next month. Can I book a tour on Saturday?",
    },
];

// --- The site ----------------------------------------------------------------

const img = (image: DemoImage) => ({
    src: image.url,
    alt: image.alt,
    width: image.width,
    height: image.height,
});

const hero = (
    heading: string,
    subheading: string,
    image?: DemoImage,
    cta?: { label: string; href: string },
) =>
    block("hero", {
        heading,
        subheading,
        ...(image ? { image: img(image) } : {}),
        ...(cta ? { cta: { ...cta, style: "primary" } } : {}),
    });

const text = (
    value: string,
    image: DemoImage,
    imageSide: "left" | "right" | "above",
) => block("richText", { format: "html", value, image: img(image), imageSide });

export const DK_FOOTER =
    "Desk 42 · 4th floor, Sai Capital, Baner Road, Pune 411045 · Mon–Fri 8 am–9 pm, Sat 9 am–6 pm · +91 20 4142 4242";

export const DK_SITE: SeedSite = {
    slug: DK_SLUG,
    name: DK_NAME,
    subdomain: DK_SLUG,
    published: true,
    createdDaysAgo: 480,
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                hero(
                    "A small, quiet place to work in Baner",
                    "Twenty hot desks, fourteen dedicated desks, one good meeting room and a call booth, above Baner Road. Come for a day, stay for the month.",
                    DK_PHOTOS.hero,
                    { label: "Book a day pass", href: "/day-pass" },
                ),
                block("features", {
                    variant: "facts",
                    heading: "Desk 42 at a glance",
                    items: [
                        {
                            value: "₹499",
                            title: "a day pass",
                            body: "Monday to Friday, 8 am to 9 pm.",
                        },
                        {
                            value: "300 Mbps",
                            title: "fibre, and a backup line",
                            body: "Two providers, so a call never drops.",
                        },
                        {
                            value: "8 seats",
                            title: "in the Sahyadri Room",
                            body: "Screen, whiteboard, booked by the hour.",
                        },
                        {
                            value: "24×7",
                            title: "for dedicated desks",
                            body: "With your own key card.",
                        },
                    ],
                }),
                {
                    type: "servicesList",
                    services: [0, 1, 2],
                    content: {
                        heading: "Book by the day or the hour",
                        showPrices: true,
                    },
                },
                block("plans", { title: "Memberships", highlight: "first" }),
                block("testimonials", {
                    heading: "Members",
                    items: [
                        {
                            quote: "I used to lose an hour a day to the Hinjewadi traffic. Now I walk here, and my calls don't drop.",
                            name: "Nikhil Bhosale",
                            role: "Remote engineer, member since 2024",
                        },
                        {
                            quote: "We moved our studio out of a flat in Aundh. Four desks by the window and a room for client reviews — that was all we needed.",
                            name: "Ananya Kulkarni",
                            role: "Pixel and Paper Studio",
                        },
                        {
                            quote: "The booth is properly quiet. I record two episodes a week there.",
                            name: "Tanvi Rao",
                            role: "Podcaster",
                        },
                    ],
                }),
                block("journal", { title: "From the front desk", count: 3 }),
                {
                    type: "cta",
                    content: {
                        label: "Book a free tour",
                        href: "/visit",
                        style: "primary",
                    },
                },
            ],
        },
        {
            path: "/plans",
            title: "Plans",
            sections: [
                hero(
                    "Memberships",
                    "Three ways to be a member, billed monthly with GST. Upgrade any time; downgrade or cancel before your next renewal.",
                    DK_PHOTOS.dedicatedDesk,
                ),
                block("plans", {
                    title: "Choose a membership",
                    intro: "Prices include 18% GST. Your invoice comes in your company's name if you give us its GSTIN.",
                    highlight: "first",
                    buttonLabel: "Join",
                }),
                text(
                    "<h2>What each one includes</h2><p><strong>Hot desk</strong> — any free desk in the open area, Monday to Saturday. <strong>Dedicated desk</strong> — your own desk and pedestal, 24×7 access and four meeting-room hours a month. <strong>Virtual office</strong> — a Baner address for GST registration and letterhead, mail scanned the day it arrives, and two day passes a month.</p>",
                    DK_DRAWN.plans,
                    "above",
                ),
                {
                    type: "faq",
                    content: {
                        heading: "Memberships",
                        items: [
                            {
                                question: "Can I pause?",
                                answer: "Once a year, for up to a month. Tell Rhea before your renewal date.",
                            },
                            {
                                question: "Can I bring a guest?",
                                answer: "One guest a day for up to two hours. Longer than that, they need a day pass.",
                            },
                            {
                                question: "Is there a deposit?",
                                answer: "One month's fee for a dedicated desk, returned when you leave. None for the others.",
                            },
                        ],
                    },
                },
            ],
        },
        {
            path: "/day-pass",
            title: "Day pass",
            sections: [
                hero(
                    "Book a day pass",
                    "A desk in the open area from 8 am to 9 pm, Monday to Friday. Twenty desks a day; Saturdays are for members.",
                    DK_PHOTOS.hotDesks,
                ),
                {
                    type: "booking",
                    service: 0,
                    content: {
                        title: "Pick your day",
                        description:
                            "Pay online when you book. Cancel up to 24 hours before for a full refund.",
                        submitLabel: "Book my desk",
                        successMessage:
                            "Booked. Ask for Omkar at the front desk on the 4th floor.",
                    },
                },
                block("packs", {
                    title: "Coming often? Flexi 10",
                    buttonLabel: "Buy Flexi 10",
                }),
            ],
        },
        {
            path: "/meeting-rooms",
            title: "Meeting rooms",
            sections: [
                hero(
                    "The Sahyadri Room and the booth",
                    "One meeting room for eight, and a soundproofed booth for calls and recording. Both by the hour; members and non-members alike.",
                    DK_PHOTOS.meetingRoom,
                ),
                {
                    type: "booking",
                    service: 1,
                    content: {
                        title: "Book the Sahyadri Room",
                        description:
                            "₹800 an hour. Need two hours? Book two slots back to back.",
                        submitLabel: "Book the room",
                        successMessage:
                            "Booked. The screen's HDMI and USB-C cables are in the drawer.",
                    },
                },
                {
                    type: "booking",
                    service: 2,
                    content: {
                        title: "Book the call & podcast booth",
                        description:
                            "₹300 an hour. Two microphones and a ring light inside.",
                        submitLabel: "Book the booth",
                        successMessage:
                            "Booked. The booth's door code is on your confirmation.",
                    },
                },
                text(
                    "<h2>Booking the room, step by step</h2><p>Pick a slot, pay online, and you get a confirmation by email. Arriving guests sign in at the front desk; we bring them up.</p>",
                    DK_DRAWN.roomBooking,
                    "above",
                ),
            ],
        },
        {
            path: "/cafe",
            title: "Café & shop",
            sections: [
                hero(
                    "The café counter",
                    "Filter coffee, chai and something to eat, 8:30 am to 7 pm on weekdays. Members can run a tab on their monthly invoice.",
                    DK_PHOTOS.cafe,
                ),
                block("productGrid", { title: "From the counter", count: 8 }),
            ],
        },
        {
            path: "/journal",
            title: "Journal",
            sections: [
                block("journal", {
                    variant: "archive",
                    title: "Notes from Desk 42",
                    showTotal: true,
                }),
            ],
        },
        {
            path: "/visit",
            title: "Visit us",
            sections: [
                hero(
                    "Come and see it",
                    "Fourth floor, Sai Capital, on Baner Road near Balewadi Phata. Two-wheeler parking in the basement; cars on the lane behind.",
                    DK_PHOTOS.pune,
                ),
                block("visitUs", {
                    title: "Where we are",
                    showMap: true,
                    showHours: true,
                }),
                text(
                    "<h2>The floor</h2><p>The open hot desks by the windows, dedicated desks along the back wall, the Sahyadri Room and the booth on the left as you come in, the café and lockers by the front desk.</p>",
                    DK_DRAWN.floorPlan,
                    "above",
                ),
                {
                    type: "booking",
                    service: 3,
                    content: {
                        title: "Book a free tour",
                        description:
                            "Thirty minutes with Rhea, Monday to Saturday.",
                        submitLabel: "Book the tour",
                        successMessage:
                            "Booked. Ask for Rhea at the front desk.",
                    },
                },
                {
                    type: "enquiry",
                    form: {
                        name: "Membership enquiry",
                        fields: DK_ENQUIRY_FIELDS,
                    },
                    content: {
                        title: "Ask about a membership",
                        description: "Rhea replies the same working day.",
                        submitLabel: "Send",
                        successMessage: "Thank you — Rhea will reply today.",
                    },
                },
            ],
        },
    ],
};

export const DK_PATHS = [
    { path: "/", weight: 0.32 },
    { path: "/day-pass", weight: 0.18 },
    { path: "/plans", weight: 0.14 },
    { path: "/meeting-rooms", weight: 0.12 },
    { path: "/visit", weight: 0.08 },
    { path: "/blog", weight: 0.08 },
    { path: "/cafe", weight: 0.05 },
    { path: "/shop", weight: 0.03 },
];
