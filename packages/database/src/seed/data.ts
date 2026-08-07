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
 * Which capabilities the org has turned on.
 *
 * Readiness is DERIVED by the API from evidence, never stored — a module is
 * ACTIVE because a publication, a pipeline or a connected provider exists, not
 * because anything here says so. The seed therefore sets up conditions and lets
 * the adapters draw their own conclusion, which means it keeps telling the truth
 * when the rules change.
 *
 * The consequence, now that the fixture also carries sites, analytics and live
 * providers: every ENABLED module below evaluates to ACTIVE. AUTOMATIONS is the
 * one capability left genuinely absent, and it short-circuits at the
 * "configured" gate rather than on readiness — so `SETUP_REQUIRED` and
 * `ATTENTION_REQUIRED` are no longer reachable from this fixture. Reaching them
 * again means removing evidence (drop the publications, or set every payment
 * provider to DISABLED), not adding a flag.
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
        why: "one live provider plus a retired one still on the account",
    },
    {
        key: "COMMUNICATIONS",
        status: "ENABLED",
        why: "a connected email sender exists",
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

// --- Billing -------------------------------------------------------------

/**
 * The plan Northwind is on.
 *
 * Not decoration: `EntitlementService` caps an unsubscribed org at ONE site and
 * refuses a custom-domain claim outright (`FREE_ENTITLEMENTS`). Without a
 * subscription the three sites and the domain claim below are states the
 * product would never have let this org reach, and a fixture that cannot exist
 * is the kind that produces confident, wrong findings.
 */
export const PLAN = {
    key: "business",
    version: 1,
    name: "Business",
    /** Paise, matching the schema's minor-unit convention — ₹1,499 a month. */
    priceCents: 149900,
    interval: "month",
    entitlements: { sites: 5, teamMembers: 10, customDomain: true },
} as const;

// --- Providers -----------------------------------------------------------

/**
 * A second payment provider, this one live.
 *
 * The RAZORPAY row the seed already writes is DISABLED, which on its own makes
 * `/settings/providers` report Payments as "Not working" — a true reading of a
 * merchant who has connected nothing that works, but not the state most of them
 * are in. Adding CASHFREE as CONNECTED (rather than editing the Razorpay row)
 * leaves that deliberate fixture intact and tells a story merchants recognise:
 * they switched processor and never removed the old connection.
 */
export const LIVE_PAYMENT_PROVIDER = {
    provider: "CASHFREE",
    status: "CONNECTED",
} as const;

/** The org's sending identity, so Communications reports a real connection. */
export const COMMUNICATION_PROVIDER = {
    channel: "EMAIL",
    provider: "RESEND",
    status: "CONNECTED",
    fromAddress: "orders@northwindsupply.in",
} as const;

/**
 * A custom domain part-way through DNS verification — the third state the
 * provider-health surface can report, and the one a merchant hits on the day
 * they buy a domain. Left PENDING rather than VERIFIED so the screen shows
 * something other than three identical green cards.
 */
export const DOMAIN = {
    hostname: "northwindsupply.in",
    status: "PENDING",
    /** The published TXT value, not a credential — safe to keep in the fixture. */
    verificationToken: "saroh-site-verification=northwind-supply-demo",
    /** Index into {@link SITES} — the site the hostname will route to. */
    site: 0,
} as const;

// --- Website -------------------------------------------------------------

/** A field descriptor shared by an `enquiry` section and its backing Form. */
export interface SeedFormField {
    name: string;
    label: string;
    type: "text" | "email" | "tel" | "textarea";
    required?: boolean;
}

/**
 * One authored section. `enquiry` and `booking` carry a reference rather than an
 * id because the thing they point at is created by the seed itself: the seed
 * resolves `form` into a real Form id and `service` into a real Service id
 * before writing, exactly as the editor does on save.
 */
export type SeedSection =
    | {
          type: "hero";
          content: {
              heading: string;
              subheading?: string;
              cta?: {
                  label: string;
                  href: string;
                  style: "primary" | "secondary" | "link";
              };
          };
      }
    | { type: "richText"; content: { format: "html"; value: string } }
    | {
          type: "cta";
          content: {
              label: string;
              href: string;
              style: "primary" | "secondary" | "link";
          };
      }
    | {
          type: "enquiry";
          /** Becomes a Form row; its id is written back into the section. */
          form: { name: string; fields: readonly SeedFormField[] };
          content: {
              title: string;
              description: string;
              submitLabel: string;
              successMessage: string;
          };
      }
    | {
          type: "booking";
          /** Index into {@link SERVICES}. */
          service: number;
          content: {
              title: string;
              description: string;
              submitLabel: string;
              successMessage: string;
          };
      };

/** The enquiry form Northwind uses everywhere it asks a visitor for details. */
const ENQUIRY_FIELDS: readonly SeedFormField[] = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "company", label: "Business name", type: "text" },
    {
        name: "message",
        label: "What do you need?",
        type: "textarea",
        required: true,
    },
];

/**
 * The org's websites.
 *
 * Three, in the two states the list page can distinguish: two live on a
 * saroh.in subdomain and one still being written, which is why the third has no
 * subdomain — the card falls back to the slug, and a merchant should see both
 * renderings rather than three identical ones.
 *
 * No section here carries an image. The shipped starter template points at
 * `/templates/starter/*.jpg`, and those files do not exist in any app's
 * `public/` — seeding them would put broken images in the editor.
 */
export const SITES: readonly {
    slug: string;
    name: string;
    subdomain: string | null;
    /** Published sites get a Publication and a live pointer; drafts do not. */
    published: boolean;
    /** Days before today the site was created, so the list is not all "just now". */
    createdDaysAgo: number;
    pages: readonly {
        path: string;
        title: string;
        isHome?: boolean;
        sections: readonly SeedSection[];
    }[];
}[] = [
    {
        slug: "northwind-supply",
        name: "Northwind Supply",
        subdomain: "northwind",
        published: true,
        createdDaysAgo: 213,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading: "Packaging, storage and safety supplies",
                            subheading:
                                "Cartons, tape, crates and protective kit for workshops and warehouses across Karnataka. Order by 2pm and stocked lines go out the same day.",
                            cta: {
                                label: "Browse the catalogue",
                                href: "/products",
                                style: "primary",
                            },
                        },
                    },
                    {
                        type: "richText",
                        content: {
                            format: "html",
                            value:
                                "<h2>What we hold</h2>" +
                                "<p>Around nine hundred lines across packaging, storage and safety, " +
                                "kept in our Peenya warehouse rather than ordered in when you ask. " +
                                "Bulk and custom runs are quoted within one working day.</p>" +
                                "<h2>Trade accounts</h2>" +
                                "<p>Businesses ordering monthly can open a 30-day account. Tiered " +
                                "pricing applies from the second order onwards, and your rates stay " +
                                "on the account rather than needing to be asked for each time.</p>",
                        },
                    },
                    {
                        type: "cta",
                        content: {
                            label: "Open a trade account",
                            href: "/contact",
                            style: "primary",
                        },
                    },
                ],
            },
            {
                path: "/about",
                title: "About",
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading: "About Northwind Supply",
                            subheading:
                                "Family-run since 2014, supplying the small manufacturers around us.",
                        },
                    },
                    {
                        type: "richText",
                        content: {
                            format: "html",
                            value:
                                "<h2>Our story</h2>" +
                                "<p>Northwind began as a single-shutter shop on Tumkur Road selling " +
                                "cartons to the workshops either side of it. Ten years on we hold " +
                                "nine hundred lines in Peenya and deliver across the state, but the " +
                                "way we work has not changed: real stock on the shelf, lead times we " +
                                "can actually meet, and someone who answers the phone.</p>",
                        },
                    },
                ],
            },
            {
                path: "/contact",
                title: "Contact",
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading: "Tell us what you need",
                            subheading:
                                "Send the sizes and quantities and we will come back with stock and pricing within one working day.",
                        },
                    },
                    {
                        type: "enquiry",
                        form: {
                            name: "Website enquiry",
                            fields: ENQUIRY_FIELDS,
                        },
                        content: {
                            title: "Send an enquiry",
                            description:
                                "Rough quantities are fine — we will tell you what is on the shelf and what needs a lead time.",
                            submitLabel: "Send enquiry",
                            successMessage:
                                "Thanks — we will be in touch within one working day.",
                        },
                    },
                ],
            },
            {
                path: "/book",
                title: "Book a walkthrough",
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading: "See the stock before you commit",
                            subheading:
                                "Worth an hour if you are placing a bulk order for the first time.",
                        },
                    },
                    {
                        type: "booking",
                        service: 1 /* Warehouse walkthrough */,
                        content: {
                            title: "Book a warehouse walkthrough",
                            description:
                                "An hour at the Peenya warehouse with someone from the trade counter. Bring your specifications.",
                            submitLabel: "Request a slot",
                            successMessage:
                                "Slot requested — we will confirm by email once it is in the diary.",
                        },
                    },
                ],
            },
        ],
    },
    {
        slug: "monsoon-stock-up-2026",
        name: "Monsoon Stock-Up 2026",
        subdomain: "monsoon",
        published: true,
        createdDaysAgo: 41,
        pages: [
            {
                path: "/",
                title: "Monsoon stock-up",
                isHome: true,
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading: "Stock up before the rains",
                            subheading:
                                "Moisture-resistant cartons, sealed crates and desiccant packs, ordered together and delivered together.",
                            cta: {
                                label: "See what is in the bundle",
                                href: "#bundle",
                                style: "primary",
                            },
                        },
                    },
                    {
                        type: "richText",
                        content: {
                            format: "html",
                            value:
                                "<h2>Why now</h2>" +
                                "<p>Damp gets into stock through the packaging long before it gets " +
                                "into the building. Every year we watch customers lose cartons that " +
                                "were fine in March, so we put the three lines that actually prevent " +
                                "it into one order.</p>" +
                                "<h2>In the bundle</h2>" +
                                "<ul>" +
                                "<li>Stackable crates with sealed lids, 30 and 50 litre</li>" +
                                "<li>Pallet wrap, 23 micron, one metre longer per pass than standard</li>" +
                                "<li>Silica desiccant packs, sized for a full crate</li>" +
                                "</ul>",
                        },
                    },
                    {
                        type: "enquiry",
                        form: {
                            name: "Monsoon stock-up enquiry",
                            fields: ENQUIRY_FIELDS,
                        },
                        content: {
                            title: "Reserve a bundle",
                            description:
                                "Tell us how many pallets you are protecting and we will size it for you.",
                            submitLabel: "Reserve a bundle",
                            successMessage:
                                "Reserved — we will call to confirm quantities before dispatch.",
                        },
                    },
                ],
            },
        ],
    },
    {
        slug: "trade-counter-whitefield",
        name: "Trade Counter — Whitefield",
        subdomain: null,
        published: false,
        createdDaysAgo: 9,
        pages: [
            {
                path: "/",
                title: "Trade counter",
                isHome: true,
                sections: [
                    {
                        type: "hero",
                        content: {
                            heading: "Trade counter, Whitefield",
                            subheading:
                                "Walk-in collection for the lines people run out of mid-job.",
                        },
                    },
                    {
                        type: "richText",
                        content: {
                            format: "html",
                            value:
                                "<h2>Opening this quarter</h2>" +
                                "<p>Off Whitefield Main Road, five minutes from the industrial " +
                                "estate. Tape, stretch film, gloves and the common carton sizes on " +
                                "the shelf; everything else on next-day transfer from Peenya.</p>" +
                                "<p>Opening hours and the exact address go here once the lease is " +
                                "signed.</p>",
                        },
                    },
                ],
            },
        ],
    },
];

// --- Analytics -----------------------------------------------------------

/**
 * How far back the daily aggregates go. The dashboard's widest quick range is
 * 90 days, so anything shorter leaves that button showing a truncated chart.
 */
export const ANALYTICS_DAYS = 90;

/**
 * Paths the traffic is split across, weighted. Every one of these is somewhere
 * this business actually publishes — a seeded CMS page, a seeded product, or a
 * seeded post — so the top-pages table cannot name a page that does not exist.
 *
 * There are exactly ten because the table shows the top ten; an eleventh would
 * be written and never read.
 *
 * The weights sum to 1 and the seed hands the rounding remainder to `/`, so the
 * paths always add up to the day's total views rather than drifting past it.
 */
export const ANALYTICS_PATHS: readonly { path: string; weight: number }[] = [
    { path: "/", weight: 0.3 },
    { path: "/products", weight: 0.17 },
    { path: "/products/kraft-mailer-box", weight: 0.11 },
    { path: "/products/stackable-crate", weight: 0.08 },
    { path: "/products/safety-gloves", weight: 0.07 },
    { path: "/contact", weight: 0.07 },
    { path: "/about", weight: 0.06 },
    { path: "/blog/warehouse-safety-basics", weight: 0.05 },
    { path: "/book", weight: 0.05 },
    { path: "/blog/choosing-the-right-mailer", weight: 0.04 },
];
