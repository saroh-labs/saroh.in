/**
 * The fictional business the seed builds.
 *
 * Kept as data, separate from the writing logic, so the shape of the demo can
 * be read and changed without touching Prisma calls.
 *
 * Northwind Supply is a hybrid business on purpose: it sells products AND takes
 * bookings. That is the case the modular architecture exists to serve and the
 * one that a commerce-only or bookings-only fixture would never exercise.
 */

/** Everything the seed writes carries this id prefix, so teardown is exact. */
export const SEED_PREFIX = "seed_";

export const OWNER_EMAIL = "demo@saroh.dev";
/** Not a secret: this database is allow-listed as development-only. */
export const OWNER_PASSWORD = "demo-password-123";

export const ORG_SLUG = "demo-org";
export const ORG_NAME = "Northwind Supply";
export const STORE_SLUG = "demo-store";
export const CURRENCY = "INR";

/**
 * Module states, chosen to exercise every readiness the product can currently
 * PRODUCE: ACTIVE, SETUP_REQUIRED and DISABLED. `ATTENTION_REQUIRED` is absent
 * on purpose — no readiness adapter emits it today (the registry reserves it for
 * provider-health signals that are not wired yet), so no fixture can create it.
 *
 * Readiness is DERIVED by the API from blockers, not stored — so enabling
 * Payments without connecting a provider is what actually produces
 * SETUP_REQUIRED. The seed sets up the conditions rather than asserting the
 * outcome, which means it keeps telling the truth if the rules change.
 */
export const MODULE_STATES: readonly {
    key: string;
    status: "ENABLED" | "DISABLED";
    why: string;
}[] = [
    { key: "COMMERCE", status: "ENABLED", why: "catalog + orders exist" },
    { key: "CRM", status: "ENABLED", why: "contacts, pipeline, leads exist" },
    {
        key: "APPOINTMENTS",
        status: "ENABLED",
        why: "services + bookings exist",
    },
    { key: "WEBSITE", status: "ENABLED", why: "a site with posts exists" },
    { key: "INSIGHTS", status: "ENABLED", why: "reads the other modules" },
    {
        key: "PAYMENTS",
        status: "ENABLED",
        why: "provider present but DISABLED -> provider-health DEGRADED",
    },
    {
        key: "COMMUNICATIONS",
        status: "ENABLED",
        why: "no provider connected -> SETUP_REQUIRED",
    },
    {
        key: "AUTOMATIONS",
        status: "DISABLED",
        why: "left off so the nav shows a capability that is genuinely absent",
    },
];

export const CONTACTS: readonly {
    first: string;
    last: string;
    company?: string;
    source: string;
}[] = [
    {
        first: "Ananya",
        last: "Rao",
        company: "Sunrise Cafe",
        source: "WEBSITE",
    },
    {
        first: "Vikram",
        last: "Shetty",
        company: "Shetty & Co",
        source: "REFERRAL",
    },
    {
        first: "Meera",
        last: "Iyer",
        company: "Bloom Studio",
        source: "INSTAGRAM",
    },
    {
        first: "Rahul",
        last: "Nair",
        company: "Nair Interiors",
        source: "WEBSITE",
    },
    { first: "Priya", last: "Deshpande", source: "WALK_IN" },
    {
        first: "Arjun",
        last: "Kulkarni",
        company: "Kulkarni Foods",
        source: "REFERRAL",
    },
    {
        first: "Sneha",
        last: "Pillai",
        company: "Pillai Textiles",
        source: "WEBSITE",
    },
    { first: "Karthik", last: "Menon", source: "INSTAGRAM" },
    {
        first: "Divya",
        last: "Reddy",
        company: "Reddy Organics",
        source: "WEBSITE",
    },
    {
        first: "Sanjay",
        last: "Gupta",
        company: "Gupta Traders",
        source: "REFERRAL",
    },
    { first: "Nisha", last: "Verma", source: "WALK_IN" },
    {
        first: "Aditya",
        last: "Joshi",
        company: "Joshi Hardware",
        source: "WEBSITE",
    },
    {
        first: "Kavya",
        last: "Bhat",
        company: "Bhat Bakery",
        source: "INSTAGRAM",
    },
    { first: "Rohan", last: "Sharma", source: "WEBSITE" },
    {
        first: "Ishita",
        last: "Chatterjee",
        company: "Chatterjee Crafts",
        source: "REFERRAL",
    },
    {
        first: "Manish",
        last: "Agarwal",
        company: "Agarwal Steel",
        source: "WEBSITE",
    },
    { first: "Pooja", last: "Malhotra", source: "WALK_IN" },
    {
        first: "Siddharth",
        last: "Bose",
        company: "Bose Electronics",
        source: "REFERRAL",
    },
    {
        first: "Anjali",
        last: "Krishnan",
        company: "Krishnan Spices",
        source: "WEBSITE",
    },
    { first: "Varun", last: "Saxena", source: "INSTAGRAM" },
    {
        first: "Tara",
        last: "Mathew",
        company: "Mathew Farms",
        source: "WEBSITE",
    },
    {
        first: "Nikhil",
        last: "Ranganathan",
        company: "Ranga Logistics",
        source: "REFERRAL",
    },
    { first: "Lakshmi", last: "Subramanian", source: "WALK_IN" },
    {
        first: "Farhan",
        last: "Qureshi",
        company: "Qureshi Imports",
        source: "WEBSITE",
    },
];

export const PIPELINE_STAGES = [
    "New",
    "Qualified",
    "Proposal sent",
    "Negotiation",
    "Closing",
] as const;

/**
 * Leads, spread across stages. `overdueDays` puts a follow-up task in the past
 * with no completion, which is what produces Home's OVERDUE action — the seed
 * has to make that real, because a merchant reviewing Home cannot judge the
 * ranking against an empty list.
 */
export const LEADS: readonly {
    contact: number;
    stage: number;
    title: string;
    value: number;
    status?: "OPEN" | "WON" | "LOST";
    overdueDays?: number;
    dueInDays?: number;
}[] = [
    {
        contact: 0,
        stage: 0,
        title: "Bulk order — 200 units",
        value: 4500000,
        overdueDays: 6,
    },
    { contact: 1, stage: 0, title: "Quarterly resupply", value: 1200000 },
    {
        contact: 2,
        stage: 1,
        title: "Custom packaging run",
        value: 890000,
        overdueDays: 2,
    },
    {
        contact: 3,
        stage: 1,
        title: "Fit-out materials",
        value: 3200000,
        dueInDays: 3,
    },
    {
        contact: 5,
        stage: 2,
        title: "Annual contract",
        value: 7500000,
        overdueDays: 11,
    },
    { contact: 6, stage: 2, title: "Sample request follow-up", value: 450000 },
    {
        contact: 8,
        stage: 3,
        title: "Wholesale pricing",
        value: 2100000,
        dueInDays: 1,
    },
    { contact: 9, stage: 3, title: "Distribution agreement", value: 5600000 },
    {
        contact: 11,
        stage: 4,
        title: "Renewal — Joshi Hardware",
        value: 1850000,
        dueInDays: 5,
    },
    { contact: 14, stage: 4, title: "Craft supplies contract", value: 980000 },
    { contact: 15, stage: 1, title: "Steel fittings enquiry", value: 4100000 },
    {
        contact: 17,
        stage: 2,
        title: "Electronics bundle",
        value: 2750000,
        overdueDays: 4,
    },
    { contact: 18, stage: 0, title: "Spice packaging", value: 620000 },
    { contact: 21, stage: 3, title: "Logistics partnership", value: 8900000 },
    {
        contact: 23,
        stage: 4,
        title: "Import consolidation",
        value: 3400000,
        status: "WON",
    },
    {
        contact: 4,
        stage: 1,
        title: "One-off enquiry",
        value: 150000,
        status: "LOST",
    },
];

export const SERVICES: readonly {
    name: string;
    description: string;
    minutes: number;
    priceCents: number | null;
}[] = [
    {
        name: "Product consultation",
        description: "Talk through requirements and get a tailored quote.",
        minutes: 30,
        priceCents: null,
    },
    {
        name: "Warehouse walkthrough",
        description: "See stock in person before placing a bulk order.",
        minutes: 60,
        priceCents: 50000,
    },
    {
        name: "Account review",
        description: "Quarterly review of pricing, volumes and delivery.",
        minutes: 45,
        priceCents: null,
    },
];

/** Bookings relative to today: negative is past, positive upcoming. */
export const BOOKINGS: readonly {
    service: number;
    contact: number;
    dayOffset: number;
    hour: number;
    status: "CONFIRMED" | "PENDING" | "CANCELLED";
}[] = [
    { service: 0, contact: 0, dayOffset: -12, hour: 10, status: "CONFIRMED" },
    { service: 1, contact: 3, dayOffset: -9, hour: 14, status: "CONFIRMED" },
    { service: 0, contact: 6, dayOffset: -5, hour: 11, status: "CANCELLED" },
    { service: 2, contact: 8, dayOffset: -3, hour: 16, status: "CONFIRMED" },
    { service: 0, contact: 11, dayOffset: -1, hour: 9, status: "CONFIRMED" },
    { service: 1, contact: 2, dayOffset: 1, hour: 10, status: "CONFIRMED" },
    { service: 0, contact: 14, dayOffset: 2, hour: 15, status: "PENDING" },
    { service: 2, contact: 17, dayOffset: 4, hour: 11, status: "CONFIRMED" },
    { service: 1, contact: 21, dayOffset: 6, hour: 13, status: "CONFIRMED" },
    { service: 0, contact: 23, dayOffset: 9, hour: 14, status: "PENDING" },
];

export const CATEGORIES = [
    { slug: "packaging", name: "Packaging" },
    { slug: "storage", name: "Storage" },
    { slug: "safety", name: "Safety" },
] as const;

export const PRODUCTS: readonly {
    slug: string;
    name: string;
    description: string;
    price: string;
    category: number;
    variants: readonly { sku: string; title: string; price: string }[];
    stock: number;
}[] = [
    {
        slug: "kraft-mailer-box",
        name: "Kraft Mailer Box",
        description: "Recyclable corrugated mailer, ships flat.",
        price: "45.00",
        category: 0,
        variants: [
            { sku: "KMB-S", title: "Small", price: "45.00" },
            { sku: "KMB-M", title: "Medium", price: "62.00" },
            { sku: "KMB-L", title: "Large", price: "88.00" },
        ],
        stock: 420,
    },
    {
        slug: "bubble-wrap-roll",
        name: "Bubble Wrap Roll",
        description: "50m roll, 10mm bubbles, anti-static.",
        price: "780.00",
        category: 0,
        variants: [{ sku: "BWR-50", title: "50 metre", price: "780.00" }],
        stock: 85,
    },
    {
        slug: "packing-tape",
        name: "Packing Tape",
        description: "Heavy-duty acrylic tape, 48mm x 100m.",
        price: "120.00",
        category: 0,
        variants: [
            { sku: "PT-CLR", title: "Clear", price: "120.00" },
            { sku: "PT-BRN", title: "Brown", price: "120.00" },
        ],
        stock: 0,
    },
    {
        slug: "stackable-crate",
        name: "Stackable Crate",
        description: "Ventilated polypropylene crate, nests when empty.",
        price: "540.00",
        category: 1,
        variants: [
            { sku: "SC-30L", title: "30 litre", price: "540.00" },
            { sku: "SC-50L", title: "50 litre", price: "760.00" },
        ],
        stock: 140,
    },
    {
        slug: "pallet-wrap",
        name: "Pallet Wrap",
        description: "Blown stretch film, 500mm, 23 micron.",
        price: "1150.00",
        category: 1,
        variants: [{ sku: "PW-500", title: "500mm", price: "1150.00" }],
        stock: 12,
    },
    {
        slug: "shelving-unit",
        name: "Steel Shelving Unit",
        description: "Five-tier boltless shelving, 200kg per tier.",
        price: "4800.00",
        category: 1,
        variants: [{ sku: "SU-5T", title: "Five tier", price: "4800.00" }],
        stock: 26,
    },
    {
        slug: "safety-gloves",
        name: "Cut-Resistant Gloves",
        description: "Level 5 cut resistance, touchscreen compatible.",
        price: "310.00",
        category: 2,
        variants: [
            { sku: "SG-M", title: "Medium", price: "310.00" },
            { sku: "SG-L", title: "Large", price: "310.00" },
        ],
        stock: 210,
    },
    {
        slug: "hi-vis-vest",
        name: "Hi-Vis Vest",
        description: "Class 2 reflective vest, machine washable.",
        price: "260.00",
        category: 2,
        variants: [{ sku: "HVV-STD", title: "Standard", price: "260.00" }],
        stock: 95,
    },
    {
        slug: "first-aid-kit",
        name: "Workplace First Aid Kit",
        description: "25-person kit, wall-mountable case.",
        price: "1650.00",
        category: 2,
        variants: [{ sku: "FAK-25", title: "25 person", price: "1650.00" }],
        stock: 34,
    },
    {
        slug: "label-printer",
        name: "Thermal Label Printer",
        description: "Direct thermal, 104mm, USB and network.",
        price: "12500.00",
        category: 0,
        variants: [{ sku: "TLP-104", title: "104mm", price: "12500.00" }],
        stock: 7,
    },
    {
        slug: "shipping-labels",
        name: "Shipping Labels",
        description: "Thermal labels, 100x150mm, 500 per roll.",
        price: "420.00",
        category: 0,
        variants: [{ sku: "SL-500", title: "500 roll", price: "420.00" }],
        stock: 300,
    },
    {
        slug: "trolley",
        name: "Platform Trolley",
        description: "300kg capacity, folding handle, rubber wheels.",
        price: "3900.00",
        category: 1,
        variants: [{ sku: "TR-300", title: "300kg", price: "3900.00" }],
        stock: 18,
    },
];

/**
 * Orders across every status the UI renders. The PENDING and PROCESSING ones
 * are what Home counts as open work — without them the OVERDUE branch of the
 * ranking is unreachable and cannot be reviewed.
 */
export const ORDERS: readonly {
    customer: number;
    dayOffset: number;
    status: "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
    paymentStatus: "UNPAID" | "PAID" | "FAILED" | "REFUNDED";
    lines: readonly { product: number; quantity: number }[];
}[] = [
    {
        customer: 0,
        dayOffset: -1,
        status: "PENDING",
        paymentStatus: "PAID",
        lines: [
            { product: 0, quantity: 50 },
            { product: 2, quantity: 10 },
        ],
    },
    {
        customer: 1,
        dayOffset: -2,
        status: "PENDING",
        paymentStatus: "UNPAID",
        lines: [{ product: 5, quantity: 2 }],
    },
    {
        customer: 2,
        dayOffset: -3,
        status: "PROCESSING",
        paymentStatus: "PAID",
        lines: [
            { product: 3, quantity: 20 },
            { product: 4, quantity: 5 },
        ],
    },
    {
        customer: 3,
        dayOffset: -5,
        status: "PROCESSING",
        paymentStatus: "PAID",
        lines: [
            { product: 9, quantity: 1 },
            { product: 10, quantity: 12 },
        ],
    },
    {
        customer: 4,
        dayOffset: -8,
        status: "SHIPPED",
        paymentStatus: "PAID",
        lines: [{ product: 6, quantity: 40 }],
    },
    {
        customer: 5,
        dayOffset: -12,
        status: "DELIVERED",
        paymentStatus: "PAID",
        lines: [
            { product: 1, quantity: 6 },
            { product: 7, quantity: 25 },
        ],
    },
    {
        customer: 0,
        dayOffset: -18,
        status: "DELIVERED",
        paymentStatus: "PAID",
        lines: [{ product: 8, quantity: 3 }],
    },
    {
        customer: 6,
        dayOffset: -21,
        status: "CANCELLED",
        paymentStatus: "REFUNDED",
        lines: [{ product: 11, quantity: 1 }],
    },
    {
        customer: 7,
        dayOffset: -25,
        status: "DELIVERED",
        paymentStatus: "PAID",
        lines: [{ product: 0, quantity: 120 }],
    },
    {
        customer: 2,
        dayOffset: -30,
        status: "DELIVERED",
        paymentStatus: "FAILED",
        lines: [{ product: 4, quantity: 3 }],
    },
];

export const POSTS: readonly {
    slug: string;
    title: string;
    excerpt: string;
    status: "PUBLISHED" | "DRAFT";
}[] = [
    {
        slug: "choosing-the-right-mailer",
        title: "Choosing the right mailer for fragile stock",
        excerpt: "Corrugated grade, bubble weight, and when neither is enough.",
        status: "PUBLISHED",
    },
    {
        slug: "warehouse-safety-basics",
        title: "Warehouse safety basics for small teams",
        excerpt: "The five things worth getting right before you scale.",
        status: "PUBLISHED",
    },
    {
        slug: "cutting-packaging-costs",
        title: "Cutting packaging costs without cutting corners",
        excerpt: "Where the savings actually are.",
        status: "DRAFT",
    },
];
