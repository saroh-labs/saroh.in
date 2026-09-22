/**
 * The showcase: five small businesses a product film is shot in.
 *
 * Layered on top of the base seed (Northwind Supply stays exactly as `../data`
 * describes it and grows here). Each business is chosen so the demo account's
 * ROLE in it is the point — switching business changes what they can do:
 *
 *   Northwind Supply   OWNER     commerce, CRM, website, payments (base seed)
 *   Pulse Fitness      OWNER     appointments, CRM, website, payments, courses:
 *                                memberships billed monthly or quarterly,
 *                                class packs, one course
 *   Prana Yoga         ADMIN     appointments, CRM, website, payments, courses:
 *                                studio and online classes, courses, packs
 *   CarePoint Clinic   MEMBER    appointments, CRM, website — no billing; the
 *                                point is what a Member may and may not see
 *   Lumen Studio       REVIEWER  CRM, website (reviewer of its site only)
 *
 * Data only. `./run.ts` turns it into rows; the volume (customers, orders,
 * bookings, subscriptions, invoices) is generated there from a seeded PRNG so
 * every run is identical.
 *
 * Prices on products are rupee strings, as `Product.price` stores them
 * (Decimal(10,2)); prices on services and lead values are paise, as
 * `Service.priceCents` and `Lead.value` store them (minor units, Int). Plan,
 * pack, course and invoice prices here are paise too; the run writes them to
 * their Decimal(12,2) columns.
 */
import type { SeedSection, SeedSite } from "../data";
import { ENQUIRY_FIELDS } from "../data";

/** The PRNG seed. Change it and every generated row changes with it. */
export const SHOWCASE_SEED = 20_260_922;

/** Showcase ids read `seed_sc_<business>_…`, inside the base seed's prefix. */
export const SHOWCASE_KEY = "sc";

export const SHOWCASE_PASSWORD = "demo-password-123";
export const TIMEZONE = "Asia/Kolkata";

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";
export type ModuleKey =
    | "COMMERCE"
    | "CRM"
    | "APPOINTMENTS"
    | "WEBSITE"
    | "PAYMENTS"
    | "INSIGHTS"
    | "COMMUNICATIONS"
    | "AUTOMATIONS"
    | "COURSES";

// --- Accounts ------------------------------------------------------------

/** The role-test accounts. `demo@` and `reviewer@` come from the base seed. */
export const ROLE_ACCOUNTS = {
    admin: { key: "admin", email: "admin@saroh.dev", name: "Arun (admin)" },
    member: { key: "member", email: "member@saroh.dev", name: "Maya (member)" },
} as const;

export interface TeamMember {
    first: string;
    last: string;
    role: OrgRole;
}

/** A team member's sign-in: obviously fake, on the seed's own domain. */
export const staffEmail = (p: { first: string; last: string }) =>
    `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@saroh.dev";

// --- People --------------------------------------------------------------

export const FIRST_NAMES: readonly string[] = [
    "Aarav",
    "Aditi",
    "Akash",
    "Amrita",
    "Ananya",
    "Anil",
    "Anjali",
    "Arjun",
    "Asha",
    "Ayesha",
    "Bhavna",
    "Chetan",
    "Deepak",
    "Devika",
    "Dhruv",
    "Divya",
    "Gautam",
    "Geeta",
    "Harish",
    "Hema",
    "Isha",
    "Jatin",
    "Jaya",
    "Karan",
    "Kavitha",
    "Kiran",
    "Lakshmi",
    "Madhav",
    "Manoj",
    "Meera",
    "Mohan",
    "Naveen",
    "Neha",
    "Nikhil",
    "Nisha",
    "Pallavi",
    "Pooja",
    "Pradeep",
    "Priya",
    "Rahul",
    "Rajesh",
    "Ramya",
    "Ravi",
    "Rekha",
    "Ritu",
    "Rohit",
    "Sachin",
    "Sahana",
    "Sameer",
    "Sandeep",
    "Sangeeta",
    "Sanjana",
    "Shalini",
    "Shreya",
    "Siddharth",
    "Sneha",
    "Srinivas",
    "Sunil",
    "Swati",
    "Tanya",
    "Tarun",
    "Uma",
    "Varun",
    "Vidya",
    "Vijay",
    "Vinay",
    "Yamini",
    "Yash",
    "Zara",
    "Farhan",
    "Imran",
    "Salman",
    "Nazia",
    "Joseph",
    "Maria",
    "Thomas",
    "Anita",
    "Gurpreet",
    "Harpreet",
    "Simran",
    "Manpreet",
    "Abhishek",
    "Kunal",
    "Rhea",
    "Tejas",
    "Aishwarya",
    "Keerthi",
    "Pavan",
    "Shruti",
    "Vivek",
];

export const LAST_NAMES: readonly string[] = [
    "Acharya",
    "Agarwal",
    "Bhat",
    "Banerjee",
    "Chandra",
    "Chopra",
    "D'Souza",
    "Das",
    "Desai",
    "Deshmukh",
    "Fernandes",
    "Gowda",
    "Gupta",
    "Hegde",
    "Iyer",
    "Jain",
    "Joshi",
    "Kamath",
    "Kapoor",
    "Khan",
    "Kulkarni",
    "Kumar",
    "Mehta",
    "Menon",
    "Mishra",
    "Mukherjee",
    "Nair",
    "Naidu",
    "Pai",
    "Patel",
    "Pillai",
    "Prabhu",
    "Rao",
    "Reddy",
    "Saxena",
    "Sen",
    "Shah",
    "Sharma",
    "Shetty",
    "Singh",
    "Sinha",
    "Srinivasan",
    "Subramanian",
    "Thakur",
    "Varghese",
    "Verma",
    "Yadav",
    "Bhatt",
    "Chatterjee",
    "Krishnan",
    "Malhotra",
    "Mathew",
    "Qureshi",
    "Shaikh",
    "Sethi",
    "Talwar",
    "Raman",
    "Venkatesh",
    "Ghosh",
    "Bose",
    "Dutta",
    "Kaur",
    "Gill",
    "Ahuja",
    "Bajaj",
    "Chauhan",
    "Rajan",
    "Nambiar",
    "Kini",
];

/** Where Northwind's trade customers are, weighted towards home. */
export const CITIES: readonly {
    city: string;
    state: string;
    zip: string;
    weight: number;
}[] = [
    { city: "Bengaluru", state: "Karnataka", zip: "560058", weight: 30 },
    { city: "Mysuru", state: "Karnataka", zip: "570016", weight: 6 },
    { city: "Hubballi", state: "Karnataka", zip: "580030", weight: 4 },
    { city: "Mangaluru", state: "Karnataka", zip: "575001", weight: 4 },
    { city: "Hosur", state: "Tamil Nadu", zip: "635109", weight: 5 },
    { city: "Chennai", state: "Tamil Nadu", zip: "600032", weight: 8 },
    { city: "Coimbatore", state: "Tamil Nadu", zip: "641021", weight: 5 },
    { city: "Hyderabad", state: "Telangana", zip: "500037", weight: 8 },
    { city: "Kochi", state: "Kerala", zip: "682024", weight: 4 },
    { city: "Pune", state: "Maharashtra", zip: "411026", weight: 6 },
    { city: "Mumbai", state: "Maharashtra", zip: "400072", weight: 6 },
    { city: "Ahmedabad", state: "Gujarat", zip: "382445", weight: 3 },
    { city: "New Delhi", state: "Delhi", zip: "110020", weight: 3 },
    { city: "Vijayawada", state: "Andhra Pradesh", zip: "520007", weight: 2 },
];

/** Trade-name endings for Northwind's buyers ("Shetty Foods"). */
export const COMPANY_SUFFIXES: readonly string[] = [
    "Traders",
    "Enterprises",
    "Foods",
    "Textiles",
    "Exports",
    "Hardware",
    "Industries",
    "Distributors",
    "Agencies",
    "Organics",
    "Crafts",
    "Logistics",
    "Garments",
    "Pharma",
    "Electricals",
    "Kitchens",
    "Home Store",
    "Spices",
    "Cosmetics",
    "Engineering",
];

// --- Northwind Supply (grows the base seed) -------------------------------

export const NORTHWIND = {
    /** Base seed ids, reused so the showcase extends rather than duplicates. */
    orgId: "seed_org",
    storeId: "seed_store",
    pipelineId: "seed_pipeline",
    siteId: "seed_site_0",
    /** The base seed's ten orders are ORD-001…ORD-010; ours continue after. */
    firstOrderNumber: 11,
    customers: 492,
    orders: 490,
    orderDays: 120,
    contacts: 96,
    /** How many of the new contacts are also trade customers. */
    contactsFromCustomers: 70,
    staff: [
        { first: "Suresh", last: "Gowda", role: "MEMBER" },
        { first: "Anita", last: "Fernandes", role: "ADMIN" },
    ] as readonly TeamMember[],
    /** Shipping and GST as the order form sends them. */
    taxRate: 0.18,
    freeShippingFromPaise: 1_000_000,
    shippingPaise: 25_000,
} as const;

/** Categories the base seed does not have. Base: packaging, storage, safety. */
export const NORTHWIND_NEW_CATEGORIES = [
    { slug: "labels", name: "Labels" },
    { slug: "tools", name: "Tools" },
    { slug: "shipping", name: "Shipping" },
] as const;

/** Category slug → the base seed's category id or ours. */
export const NORTHWIND_CATEGORY_INDEX: Readonly<Record<string, number>> = {
    packaging: 0,
    storage: 1,
    safety: 2,
    labels: 3,
    tools: 4,
    shipping: 5,
};

export interface CatalogProduct {
    slug: string;
    name: string;
    description: string;
    /** Rupees, two decimals, as `Product.price` stores it. */
    price: string;
    category: string;
    variants: readonly { sku: string; title: string; price: string }[];
    stock: number;
    /** How many a buyer takes in one line: [min, max, step]. */
    bulk: readonly [number, number, number];
    /** Relative popularity on an order. */
    weight: number;
}

/** How the base seed's twelve products sell, by slug. */
export const NORTHWIND_BASE_PRODUCT_DEMAND: Readonly<
    Record<
        string,
        { price: string; bulk: [number, number, number]; weight: number }
    >
> = {
    "kraft-mailer-box": { price: "45.00", bulk: [50, 300, 50], weight: 6 },
    "bubble-wrap-roll": { price: "780.00", bulk: [1, 8, 1], weight: 4 },
    "packing-tape": { price: "120.00", bulk: [12, 72, 12], weight: 6 },
    "stackable-crate": { price: "540.00", bulk: [5, 40, 5], weight: 3 },
    "pallet-wrap": { price: "1150.00", bulk: [2, 12, 1], weight: 4 },
    "shelving-unit": { price: "4800.00", bulk: [1, 4, 1], weight: 1 },
    "safety-gloves": { price: "310.00", bulk: [10, 60, 10], weight: 3 },
    "hi-vis-vest": { price: "260.00", bulk: [5, 40, 5], weight: 2 },
    "first-aid-kit": { price: "1650.00", bulk: [1, 3, 1], weight: 1 },
    "label-printer": { price: "12500.00", bulk: [1, 1, 1], weight: 0.4 },
    "shipping-labels": { price: "420.00", bulk: [2, 20, 1], weight: 5 },
    trolley: { price: "3900.00", bulk: [1, 2, 1], weight: 0.6 },
};

const one = (sku: string, title: string, price: string) => [
    { sku, title, price },
];

export const NORTHWIND_NEW_PRODUCTS: readonly CatalogProduct[] = [
    // Packaging
    {
        slug: "corrugated-carton-3ply",
        name: "3-Ply Corrugated Carton",
        description:
            "Brown RSC carton for everyday dispatch, 150 gsm kraft liner.",
        price: "38.00",
        category: "packaging",
        variants: [
            { sku: "CC3-S", title: "Small — 250×200×150mm", price: "32.00" },
            { sku: "CC3-M", title: "Medium — 350×250×200mm", price: "38.00" },
            { sku: "CC3-L", title: "Large — 450×350×300mm", price: "52.00" },
        ],
        stock: 1800,
        bulk: [50, 500, 50],
        weight: 7,
    },
    {
        slug: "corrugated-carton-5ply",
        name: "5-Ply Heavy Duty Carton",
        description: "Double-wall carton for machine parts and export loads.",
        price: "72.00",
        category: "packaging",
        variants: [
            { sku: "CC5-M", title: "Medium — 400×300×300mm", price: "72.00" },
            { sku: "CC5-L", title: "Large — 600×400×400mm", price: "96.00" },
        ],
        stock: 640,
        bulk: [25, 200, 25],
        weight: 4,
    },
    {
        slug: "poly-mailer",
        name: "Tamper-Evident Poly Mailer",
        description: "Opaque 60 micron mailer with a permanent seal strip.",
        price: "6.50",
        category: "packaging",
        variants: [
            { sku: "PM-1014", title: "10×14 in", price: "6.50" },
            { sku: "PM-1216", title: "12×16 in", price: "8.20" },
        ],
        stock: 12000,
        bulk: [200, 2000, 100],
        weight: 6,
    },
    {
        slug: "kraft-void-fill",
        name: "Kraft Void-Fill Paper Roll",
        description: "80 gsm recycled kraft, 450mm × 250m, plastic-free.",
        price: "950.00",
        category: "packaging",
        variants: one("KVF-450", "450mm × 250m", "950.00"),
        stock: 60,
        bulk: [2, 20, 1],
        weight: 2,
    },
    {
        slug: "air-pillow-film",
        name: "Air Pillow Film",
        description: "Pre-perforated film for tabletop air-cushion machines.",
        price: "1850.00",
        category: "packaging",
        variants: one("APF-200", "200×100mm pillows", "1850.00"),
        stock: 22,
        bulk: [1, 8, 1],
        weight: 1,
    },
    {
        slug: "epe-foam-roll",
        name: "EPE Foam Sheet Roll",
        description:
            "2mm expanded polyethylene, 1m × 100m, for scratch protection.",
        price: "1280.00",
        category: "packaging",
        variants: one("EPE-2", "2mm", "1280.00"),
        stock: 40,
        bulk: [1, 10, 1],
        weight: 2,
    },
    {
        slug: "corner-protectors",
        name: "Edge & Corner Protectors",
        description: "Laminated paperboard angle, 50×50×3mm, cut to 1m.",
        price: "14.00",
        category: "packaging",
        variants: one("ECP-1M", "1 metre", "14.00"),
        stock: 3200,
        bulk: [100, 1000, 100],
        weight: 2,
    },
    {
        slug: "food-grade-pouch",
        name: "Stand-Up Zip Pouch, Food Grade",
        description: "Kraft-look laminate with a zip and tear notch.",
        price: "4.20",
        category: "packaging",
        variants: [
            { sku: "FGP-100", title: "100 g", price: "3.40" },
            { sku: "FGP-250", title: "250 g", price: "4.20" },
            { sku: "FGP-500", title: "500 g", price: "5.60" },
        ],
        stock: 25000,
        bulk: [500, 5000, 500],
        weight: 4,
    },
    {
        slug: "paper-carry-bag",
        name: "Kraft Paper Carry Bag",
        description: "Twisted-handle bag, 120 gsm, holds 5kg.",
        price: "9.50",
        category: "packaging",
        variants: [
            { sku: "PCB-S", title: "Small", price: "7.80" },
            { sku: "PCB-M", title: "Medium", price: "9.50" },
            { sku: "PCB-L", title: "Large", price: "12.40" },
        ],
        stock: 7000,
        bulk: [250, 2000, 250],
        weight: 3,
    },
    {
        slug: "tissue-paper",
        name: "Acid-Free Tissue Paper",
        description: "17 gsm, 500×750mm, 480 sheets a ream.",
        price: "1150.00",
        category: "packaging",
        variants: one("TP-480", "480 sheets", "1150.00"),
        stock: 18,
        bulk: [1, 6, 1],
        weight: 1,
    },
    // Storage
    {
        slug: "storage-bin",
        name: "Stackable Storage Bin",
        description: "Open-front polypropylene bin for picking shelves.",
        price: "380.00",
        category: "storage",
        variants: [
            { sku: "SB-15", title: "15 litre", price: "380.00" },
            { sku: "SB-25", title: "25 litre", price: "520.00" },
        ],
        stock: 210,
        bulk: [5, 40, 5],
        weight: 2,
    },
    {
        slug: "hdpe-pallet",
        name: "HDPE Plastic Pallet",
        description:
            "1200×1000mm, 1.5 tonne dynamic load, hygienic and washable.",
        price: "3200.00",
        category: "storage",
        variants: one("HP-1210", "1200×1000mm", "3200.00"),
        stock: 9,
        bulk: [2, 12, 1],
        weight: 1,
    },
    {
        slug: "wire-rack",
        name: "Heavy Duty Wire Rack",
        description: "Chrome wire shelving, four tiers, 250kg per shelf.",
        price: "6400.00",
        category: "storage",
        variants: one("WR-4T", "Four tier", "6400.00"),
        stock: 14,
        bulk: [1, 4, 1],
        weight: 0.8,
    },
    {
        slug: "euro-container",
        name: "Euro Container with Lid",
        description:
            "Hinged-lid tote, stacks and nests, fits standard pallets.",
        price: "690.00",
        category: "storage",
        variants: [
            { sku: "EC-40", title: "40 litre", price: "690.00" },
            { sku: "EC-60", title: "60 litre", price: "840.00" },
        ],
        stock: 150,
        bulk: [5, 40, 5],
        weight: 2,
    },
    {
        slug: "bin-shelving-kit",
        name: "Bin Shelving Kit",
        description: "Louvred panel with 48 hanging bins for small parts.",
        price: "8900.00",
        category: "storage",
        variants: one("BSK-48", "48 bins", "8900.00"),
        stock: 4,
        bulk: [1, 2, 1],
        weight: 0.4,
    },
    {
        slug: "pallet-rack-beams",
        name: "Pallet Racking Beam Pair",
        description: "2.7m step beams with safety locks, 2,000kg per pair.",
        price: "2450.00",
        category: "storage",
        variants: one("PRB-27", "2.7 metre", "2450.00"),
        stock: 0,
        bulk: [2, 10, 2],
        weight: 0.8,
    },
    // Labels
    {
        slug: "barcode-labels",
        name: "Barcode Labels 50×25mm",
        description: "Direct thermal paper labels, 2,000 a roll, 25mm core.",
        price: "380.00",
        category: "labels",
        variants: one("BL-5025", "2,000 per roll", "380.00"),
        stock: 450,
        bulk: [5, 50, 5],
        weight: 4,
    },
    {
        slug: "fragile-labels",
        name: "Fragile Warning Labels",
        description: "Red and white 'Handle with care' labels, 500 a roll.",
        price: "240.00",
        category: "labels",
        variants: one("FL-500", "500 per roll", "240.00"),
        stock: 320,
        bulk: [2, 20, 1],
        weight: 2,
    },
    {
        slug: "wax-resin-ribbon",
        name: "Wax-Resin Ribbon",
        description:
            "110mm × 300m outside-wound ribbon for thermal transfer printers.",
        price: "520.00",
        category: "labels",
        variants: one("WRR-110", "110mm × 300m", "520.00"),
        stock: 160,
        bulk: [5, 30, 5],
        weight: 2,
    },
    {
        slug: "price-gun",
        name: "Price Labelling Gun",
        description:
            "Single-line, eight-digit labeller with a spare ink roller.",
        price: "1350.00",
        category: "labels",
        variants: one("PG-8", "Eight digit", "1350.00"),
        stock: 27,
        bulk: [1, 5, 1],
        weight: 0.8,
    },
    {
        slug: "custom-printed-labels",
        name: "Custom Printed Product Labels",
        description:
            "Your artwork on 1,000 labels, up to four colours, seven-day turnaround.",
        price: "1800.00",
        category: "labels",
        variants: [
            { sku: "CPL-MAT", title: "Matte", price: "1800.00" },
            { sku: "CPL-GLS", title: "Gloss", price: "1950.00" },
        ],
        stock: 60,
        bulk: [1, 10, 1],
        weight: 2,
    },
    {
        slug: "magnetic-location-labels",
        name: "Magnetic Location Labels",
        description: "Write-on magnetic strips for racking, pack of 50.",
        price: "890.00",
        category: "labels",
        variants: one("MLL-50", "Pack of 50", "890.00"),
        stock: 0,
        bulk: [1, 6, 1],
        weight: 0.8,
    },
    // Safety
    {
        slug: "safety-shoes",
        name: "Steel-Toe Safety Shoes",
        description: "Oil-resistant sole, 200 joule toe cap, ISI marked.",
        price: "1450.00",
        category: "safety",
        variants: [
            { sku: "SS-7", title: "UK 7", price: "1450.00" },
            { sku: "SS-8", title: "UK 8", price: "1450.00" },
            { sku: "SS-9", title: "UK 9", price: "1450.00" },
            { sku: "SS-10", title: "UK 10", price: "1450.00" },
        ],
        stock: 88,
        bulk: [2, 20, 1],
        weight: 2,
    },
    {
        slug: "safety-helmet",
        name: "ISI Safety Helmet",
        description: "HDPE shell with a ratchet harness and sweatband.",
        price: "220.00",
        category: "safety",
        variants: [
            { sku: "SH-YEL", title: "Yellow", price: "220.00" },
            { sku: "SH-WHT", title: "White", price: "220.00" },
        ],
        stock: 300,
        bulk: [5, 50, 5],
        weight: 2,
    },
    {
        slug: "ear-plugs",
        name: "Foam Ear Plugs",
        description: "Tapered PU foam, 33 dB, 100 pairs in a dispenser box.",
        price: "650.00",
        category: "safety",
        variants: one("EP-100", "100 pairs", "650.00"),
        stock: 70,
        bulk: [1, 10, 1],
        weight: 1.5,
    },
    {
        slug: "dust-masks",
        name: "N95 Dust Masks",
        description:
            "Cup-style respirator with an exhalation valve, box of 20.",
        price: "780.00",
        category: "safety",
        variants: one("DM-20", "Box of 20", "780.00"),
        stock: 6,
        bulk: [2, 20, 1],
        weight: 2,
    },
    {
        slug: "safety-goggles",
        name: "Anti-Fog Safety Goggles",
        description: "Polycarbonate lens, indirect vents, fits over glasses.",
        price: "180.00",
        category: "safety",
        variants: one("SG-AF", "Clear", "180.00"),
        stock: 240,
        bulk: [5, 50, 5],
        weight: 1.5,
    },
    {
        slug: "fire-extinguisher",
        name: "ABC Fire Extinguisher 4kg",
        description:
            "Stored-pressure dry powder, wall bracket included, ISI marked.",
        price: "2650.00",
        category: "safety",
        variants: one("FE-4", "4 kg", "2650.00"),
        stock: 21,
        bulk: [1, 6, 1],
        weight: 1,
    },
    {
        slug: "floor-marking-tape",
        name: "Floor Marking Tape 50mm",
        description: "PVC lane-marking tape, 33m rolls, forklift-rated.",
        price: "340.00",
        category: "safety",
        variants: [
            { sku: "FMT-Y", title: "Yellow", price: "340.00" },
            { sku: "FMT-YB", title: "Yellow / black", price: "380.00" },
        ],
        stock: 180,
        bulk: [5, 30, 5],
        weight: 1.5,
    },
    // Tools
    {
        slug: "tape-dispenser",
        name: "Pistol-Grip Tape Dispenser",
        description: "Steel frame with a brake, takes 48mm and 72mm tape.",
        price: "420.00",
        category: "tools",
        variants: one("TD-48", "48–72mm", "420.00"),
        stock: 95,
        bulk: [2, 20, 1],
        weight: 2,
    },
    {
        slug: "strapping-kit",
        name: "Strapping Tensioner & Sealer Kit",
        description:
            "Manual tensioner, sealer and 1,000 seals for 12mm PP strap.",
        price: "3800.00",
        category: "tools",
        variants: one("STK-12", "12mm strap", "3800.00"),
        stock: 11,
        bulk: [1, 3, 1],
        weight: 0.6,
    },
    {
        slug: "pp-strapping-roll",
        name: "PP Strapping Roll 12mm",
        description: "Embossed polypropylene strap, 1,000m on a 200mm core.",
        price: "1050.00",
        category: "tools",
        variants: one("PPS-12", "12mm × 1,000m", "1050.00"),
        stock: 55,
        bulk: [2, 15, 1],
        weight: 2,
    },
    {
        slug: "safety-box-cutter",
        name: "Safety Box Cutter",
        description:
            "Spring-retracting blade that cannot cut past the carton wall.",
        price: "160.00",
        category: "tools",
        variants: one("SBC-1", "Standard", "160.00"),
        stock: 400,
        bulk: [10, 60, 10],
        weight: 2,
    },
    {
        slug: "stretch-film-dispenser",
        name: "Stretch Film Hand Dispenser",
        description: "Adjustable-brake dispenser for 500mm hand rolls.",
        price: "690.00",
        category: "tools",
        variants: one("SFD-500", "500mm", "690.00"),
        stock: 38,
        bulk: [1, 6, 1],
        weight: 1,
    },
    {
        slug: "parcel-scale",
        name: "Parcel Scale 60kg",
        description: "Stainless platform, 10g resolution, rechargeable.",
        price: "3450.00",
        category: "tools",
        variants: one("PS-60", "60 kg", "3450.00"),
        stock: 8,
        bulk: [1, 3, 1],
        weight: 0.6,
    },
    // Shipping
    {
        slug: "courier-bags",
        name: "Courier Bags with POD Pocket",
        description:
            "Grey-lined security bags with a proof-of-delivery pocket.",
        price: "5.80",
        category: "shipping",
        variants: [
            { sku: "CB-S", title: "Small — 8×10 in", price: "4.60" },
            { sku: "CB-M", title: "Medium — 12×14 in", price: "5.80" },
            { sku: "CB-L", title: "Large — 16×20 in", price: "8.40" },
        ],
        stock: 15000,
        bulk: [200, 2000, 100],
        weight: 5,
    },
    {
        slug: "document-pouch",
        name: "Self-Adhesive Document Pouch",
        description: "Clear 'Invoice enclosed' pouch, 240×165mm.",
        price: "2.40",
        category: "shipping",
        variants: one("DP-240", "240×165mm", "2.40"),
        stock: 20000,
        bulk: [500, 5000, 500],
        weight: 3,
    },
    {
        slug: "shipping-tubes",
        name: "Kraft Shipping Tube with Caps",
        description: "76mm spiral-wound tube for posters and drawings.",
        price: "48.00",
        category: "shipping",
        variants: [
            { sku: "ST-50", title: "50cm", price: "38.00" },
            { sku: "ST-75", title: "75cm", price: "48.00" },
            { sku: "ST-100", title: "100cm", price: "62.00" },
        ],
        stock: 520,
        bulk: [20, 200, 20],
        weight: 1.5,
    },
    {
        slug: "pallet-cover-hood",
        name: "Pallet Cover Hood",
        description: "Waterproof LDPE top cover, 1200×1000×1500mm.",
        price: "185.00",
        category: "shipping",
        variants: one("PCH-12", "1200×1000mm", "185.00"),
        stock: 260,
        bulk: [5, 40, 5],
        weight: 1.5,
    },
];

/** What Northwind's trade buyers come to talk about. `value` is paise. */
export const NORTHWIND_LEADS: readonly { title: string; value: number }[] = [
    { title: "Quarterly carton resupply", value: 1_850_000 },
    { title: "Custom printed mailers — 10,000", value: 3_400_000 },
    { title: "Warehouse racking fit-out", value: 9_600_000 },
    { title: "Annual safety kit contract", value: 4_200_000 },
    { title: "Label printer + 12 months of stock", value: 2_650_000 },
    { title: "Pallet wrap supply agreement", value: 5_100_000 },
    { title: "Food-grade pouches, monthly", value: 2_300_000 },
    { title: "New store opening — full kit", value: 1_450_000 },
    { title: "Export cartons, 5-ply", value: 3_800_000 },
    { title: "Plastic-free packaging switch", value: 2_900_000 },
    { title: "Festive season gift boxes", value: 1_750_000 },
    { title: "Courier bags — D2C brand", value: 1_250_000 },
];

// --- The four new businesses ------------------------------------------------

export interface ShowcaseService {
    name: string;
    description: string;
    minutes: number;
    capacity: number;
    /** Paise; null is "no price shown". */
    priceCents: number | null;
    /** Weekly opening, in the service's own zone (Asia/Kolkata). */
    rules: readonly { days: readonly number[]; from: string; to: string }[];
    /** How much of the diary this service fills, relative to the others. */
    weight: number;
    /**
     * Booked mostly by a few regulars — personal training is the same dozen
     * people every week, not a different stranger each hour.
     */
    regulars?: number;
    /**
     * An online class (ADR-007): its https meeting link. Every booker is sent
     * it, so it is a placeholder on a reserved domain, never a real room.
     */
    meetingUrl?: string;
}

export interface ShowcaseLead {
    title: string;
    /** Paise. */
    value: number;
}

// --- What a business sells beyond a single booking (ADR-007) ---------------

/** A plan people subscribe to. Money in paise. */
export interface ShowcasePlan {
    name: string;
    description: string;
    interval: "MONTH" | "QUARTER";
    pricePaise: number;
    /**
     * What it cost before the last price rise. A subscription keeps the price
     * it was sold at, so members who joined earlier still pay this.
     */
    earlier?: { pricePaise: number; beforeDaysAgo: number };
    /** Its share of the subscribers. */
    weight: number;
}

/** A pack of prepaid classes on some of the business's services. */
export interface ShowcasePack {
    name: string;
    description: string;
    credits: number;
    validityDays: number;
    pricePaise: number;
    /** Indexes into the business's services. */
    services: readonly number[];
    /** Archived packs are no longer sold; the ones sold before still count. */
    status: "ACTIVE" | "ARCHIVED";
    /** How many people bought one. */
    buyers: number;
}

/** A course: dated sessions on one service, sold once. */
export interface ShowcaseCourse {
    name: string;
    description: string;
    /** Index into the business's services. */
    service: number;
    pricePaise: number;
    seats: number;
    status: "DRAFT" | "OPEN" | "CLOSED";
    /** The first session's day, relative to today (negative: it has begun). */
    firstDay: number;
    /** Its weekly times: weekday (0 = Sunday) and local start, "HH:MM". */
    schedule: readonly { day: number; at: string }[];
    sessions: number;
    /** People who enrolled before it began. */
    enrolled: number;
    /** People who joined after it began, at a lower price. */
    lateJoiners?: number;
    /** Of those enrolled, how many were taken off it part-way. */
    cancelled?: number;
}

/** An invoice written by hand, not by a subscription, pack or course. */
export interface ShowcaseManualInvoice {
    lines: readonly {
        description: string;
        quantity: number;
        unitPaise: number;
    }[];
    taxPaise: number;
    /** When it was issued (or drafted), days before today. */
    daysAgo: number;
    /** PAID, still ISSUED (overdue once past due), a DRAFT, or VOID. */
    state: "PAID" | "ISSUED" | "DRAFT" | "VOID";
    voidReason?: string;
    /** Bill a contact with a company, when there is one. */
    company?: boolean;
}

export interface ShowcaseBilling {
    plans: readonly ShowcasePlan[];
    /** How many people are, or were, on a plan. */
    subscriptions: number;
    packs: readonly ShowcasePack[];
    courses: readonly ShowcaseCourse[];
    manualInvoices: readonly ShowcaseManualInvoice[];
}

export interface ShowcaseBusiness {
    key: string;
    slug: string;
    name: string;
    modules: readonly ModuleKey[];
    /** The demo account's role here. */
    demoRole: OrgRole;
    /** Who owns it, when the demo account does not. */
    owner: TeamMember | null;
    staff: readonly TeamMember[];
    /** The role-test accounts that belong here too. */
    roleAccounts: readonly { account: "admin" | "member"; role: OrgRole }[];
    pipeline: { name: string; stages: readonly string[] } | null;
    leads: readonly ShowcaseLead[];
    /** How many leads it carries, form entries included. */
    leadTarget?: number;
    /** People in the CRM who are not otherwise generated. */
    contacts: number;
    /** Businesses the contacts work for, when they are businesses. */
    companies?: readonly string[];
    services: readonly ShowcaseService[];
    bookings: number;
    /** Extra weight for a weekday in the diary, Sunday first. */
    weekdayWeights?: readonly number[];
    /** A Razorpay connection, so Payments reads as working. */
    paymentProvider?: "RAZORPAY" | "CASHFREE";
    /** Plans, packs, courses and invoices; needs PAYMENTS for the invoices. */
    billing?: ShowcaseBilling;
    site: SeedSite;
    footer: string;
    submissions: readonly {
        message: string;
        phone?: string;
        extra?: Record<string, string>;
    }[];
    analytics: {
        paths: readonly { path: string; weight: number }[];
        trendBase: number;
        weekendFactor: number;
        enquiryRate: number;
    };
}

const MEMBERSHIP_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel", required: true },
    {
        name: "message",
        label: "What are you training for?",
        type: "textarea",
        required: true,
    },
] as const;

/** A person's own enquiry: no business name, as a class or a clinic asks. */
const CONTACT_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    {
        name: "message",
        label: "Your message",
        type: "textarea",
        required: true,
    },
] as const;

const hero = (
    heading: string,
    subheading?: string,
    cta?: { label: string; href: string },
): SeedSection => ({
    type: "hero",
    content: {
        heading,
        ...(subheading ? { subheading } : {}),
        ...(cta ? { cta: { ...cta, style: "primary" as const } } : {}),
    },
});

const html = (value: string): SeedSection => ({
    type: "richText",
    content: { format: "html", value },
});

const button = (label: string, href: string): SeedSection => ({
    type: "cta",
    content: { label, href, style: "primary" },
});

export const PULSE: ShowcaseBusiness = {
    key: "pulse",
    slug: "pulse-fitness",
    name: "Pulse Fitness",
    modules: ["APPOINTMENTS", "CRM", "WEBSITE", "PAYMENTS", "COURSES"],
    demoRole: "OWNER",
    owner: null,
    staff: [
        { first: "Kabir", last: "Sethi", role: "ADMIN" },
        { first: "Ritika", last: "Nair", role: "MEMBER" },
        { first: "Imran", last: "Shaikh", role: "MEMBER" },
        { first: "Deepa", last: "Hegde", role: "MEMBER" },
    ],
    roleAccounts: [{ account: "admin", role: "ADMIN" }],
    pipeline: {
        name: "Memberships",
        stages: [
            "New enquiry",
            "Trial booked",
            "Visited",
            "Offer sent",
            "Joining",
        ],
    },
    leads: [
        { title: "Annual membership", value: 1_800_000 },
        { title: "Quarterly membership", value: 650_000 },
        { title: "Monthly membership", value: 250_000 },
        { title: "Personal training — 12 sessions", value: 1_440_000 },
        { title: "Couple membership, annual", value: 3_200_000 },
        { title: "Personal training — 24 sessions", value: 2_640_000 },
        { title: "Corporate plan — 8 seats", value: 9_600_000 },
        { title: "Half-yearly membership", value: 1_100_000 },
    ],
    leadTarget: 25,
    // Leads and entries come first; the members behind them come after.
    contacts: 190,
    services: [
        {
            name: "Personal training",
            description:
                "One hour, one coach, a plan written for you and reviewed every month.",
            minutes: 60,
            capacity: 1,
            priceCents: 120_000,
            rules: [
                { days: [1, 2, 3, 4, 5, 6], from: "06:00", to: "11:00" },
                { days: [1, 2, 3, 4, 5], from: "17:00", to: "21:00" },
            ],
            // One person a slot, so it needs the weight to fill a diary.
            weight: 40,
            regulars: 12,
        },
        {
            name: "HIIT class",
            description:
                "Forty-five minutes of intervals, capped at twelve so a coach sees every rep.",
            minutes: 45,
            capacity: 12,
            priceCents: 50_000,
            rules: [
                { days: [1, 3, 5], from: "07:00", to: "07:45" },
                { days: [1, 2, 3, 4, 5], from: "18:30", to: "19:15" },
                { days: [6], from: "08:00", to: "08:45" },
            ],
            weight: 9,
        },
        {
            name: "Yoga flow",
            description:
                "A steady vinyasa class for mobility and recovery. Mats provided.",
            minutes: 60,
            capacity: 15,
            priceCents: 40_000,
            rules: [
                { days: [2, 4, 6], from: "07:00", to: "08:00" },
                { days: [0], from: "08:00", to: "09:00" },
                { days: [2, 4], from: "19:30", to: "20:30" },
            ],
            weight: 7,
        },
        {
            name: "Free trial session",
            description:
                "Thirty minutes with a coach: a tour, a short assessment and an honest answer on which plan fits.",
            minutes: 30,
            capacity: 1,
            priceCents: null,
            rules: [
                { days: [1, 2, 3, 4, 5, 6], from: "10:00", to: "12:00" },
                { days: [1, 2, 3, 4, 5], from: "16:00", to: "17:30" },
            ],
            weight: 1.5,
        },
        {
            name: "Strength foundations",
            description:
                "Squat, hinge, push and pull, taught properly in a small group. Runs as a four-week course; spare places are open to drop-ins.",
            minutes: 60,
            capacity: 10,
            priceCents: 60_000,
            rules: [
                { days: [3], from: "19:30", to: "20:30" },
                { days: [6], from: "10:00", to: "11:00" },
            ],
            weight: 0.6,
        },
    ],
    bookings: 420,
    paymentProvider: "RAZORPAY",
    billing: {
        plans: [
            {
                name: "Monthly membership",
                description:
                    "Classes, the gym floor and a monthly review with a coach. Cancel with a month's notice.",
                interval: "MONTH",
                pricePaise: 250_000,
                earlier: { pricePaise: 220_000, beforeDaysAgo: 200 },
                weight: 7,
            },
            {
                name: "Quarterly membership",
                description:
                    "Everything in the monthly plan for three months, at a better rate.",
                interval: "QUARTER",
                pricePaise: 650_000,
                weight: 3,
            },
        ],
        subscriptions: 120,
        packs: [
            {
                name: "Personal training — 12 sessions",
                description:
                    "Twelve one-hour sessions with a coach, on top of any membership.",
                credits: 12,
                validityDays: 120,
                pricePaise: 1_440_000,
                services: [0],
                status: "ACTIVE",
                buyers: 8,
            },
            {
                name: "Class pack — 10 classes",
                description:
                    "Ten HIIT or yoga classes for people who would rather not join.",
                credits: 10,
                validityDays: 60,
                pricePaise: 450_000,
                services: [1, 2],
                status: "ACTIVE",
                buyers: 14,
            },
        ],
        courses: [
            {
                name: "Strength foundations — four weeks",
                description:
                    "Eight coached sessions on the big lifts, for people new to the weights floor.",
                service: 4,
                pricePaise: 480_000,
                seats: 8,
                status: "OPEN",
                firstDay: -11,
                schedule: [
                    { day: 3, at: "19:30" },
                    { day: 6, at: "10:00" },
                ],
                sessions: 8,
                enrolled: 6,
                lateJoiners: 1,
            },
        ],
        manualInvoices: [
            {
                lines: [
                    {
                        description:
                            "Corporate membership · 8 seats, this month",
                        quantity: 8,
                        unitPaise: 220_000,
                    },
                ],
                taxPaise: 316_800,
                daysAgo: 3,
                state: "ISSUED",
                company: true,
            },
            {
                lines: [
                    {
                        description: "Personal training session",
                        quantity: 4,
                        unitPaise: 120_000,
                    },
                    {
                        description: "Body composition scan",
                        quantity: 1,
                        unitPaise: 50_000,
                    },
                ],
                taxPaise: 0,
                daysAgo: 24,
                state: "PAID",
            },
            {
                lines: [
                    {
                        description: "Locker rental · three months",
                        quantity: 1,
                        unitPaise: 90_000,
                    },
                ],
                taxPaise: 0,
                daysAgo: 16,
                state: "VOID",
                voidReason: "Charged twice — the locker is in the membership",
            },
            {
                lines: [
                    {
                        description: "Personal training session",
                        quantity: 6,
                        unitPaise: 120_000,
                    },
                ],
                taxPaise: 0,
                daysAgo: 38,
                state: "ISSUED",
            },
            {
                lines: [
                    {
                        description: "Nutrition consultation",
                        quantity: 1,
                        unitPaise: 150_000,
                    },
                ],
                taxPaise: 0,
                daysAgo: 1,
                state: "DRAFT",
            },
        ],
    },
    footer: "Pulse Fitness · 12th Main, Indiranagar, Bengaluru · Mon–Sat 6am–10pm, Sun 7am–12pm",
    site: {
        slug: "pulse-fitness",
        name: "Pulse Fitness",
        subdomain: "pulse-fitness",
        published: true,
        createdDaysAgo: 146,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    hero(
                        "Train with people who know your name",
                        "A neighbourhood gym on 12th Main, Indiranagar. Small classes, coaches who plan your sessions, and a free first session so you can see if it fits.",
                        { label: "Book a free trial", href: "/book-a-trial" },
                    ),
                    {
                        type: "features",
                        content: {
                            heading: "Why members stay",
                            items: [
                                {
                                    title: "Coached, not just supervised",
                                    body: "Every member sits down with a coach once a month to review the plan and change what is not working.",
                                },
                                {
                                    title: "Classes kept small",
                                    body: "HIIT tops out at twelve and yoga at fifteen, so nobody trains unseen.",
                                },
                                {
                                    title: "Open early, open late",
                                    body: "6am to 10pm on weekdays, with the busiest classes before and after office hours.",
                                },
                                {
                                    title: "No lock-in on monthly plans",
                                    body: "Pause for travel or leave with a month's notice. Nobody chases you.",
                                },
                            ],
                        },
                    },
                    {
                        type: "servicesList",
                        services: [0, 1, 2],
                        content: { heading: "Ways to train", showPrices: true },
                    },
                    button("See membership plans", "/join"),
                ],
            },
            {
                path: "/classes",
                title: "Classes",
                sections: [
                    hero(
                        "Classes and personal training",
                        "Drop in to a class, or book an hour with a coach. Members book both from the same place.",
                    ),
                    {
                        type: "servicesList",
                        services: [1, 2, 0],
                        content: { showPrices: true },
                    },
                    {
                        type: "faq",
                        content: {
                            heading: "Before your first class",
                            items: [
                                {
                                    question:
                                        "Do I need to be fit to join a HIIT class?",
                                    answer: "No. Every movement has an easier version and the coach will show it to you. Come ten minutes early the first time.",
                                },
                                {
                                    question: "What should I bring?",
                                    answer: "Water, a towel and indoor shoes. Mats, lockers and showers are here.",
                                },
                                {
                                    question: "Can I bring a friend?",
                                    answer: "Yes — book them a free trial session and they can join you for a class that week.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/book-a-trial",
                title: "Free trial",
                sections: [
                    hero(
                        "Your first session is on us",
                        "Thirty minutes with a coach: a look around, a short assessment and an honest answer on which plan fits.",
                    ),
                    {
                        type: "booking",
                        service: 3,
                        content: {
                            title: "Book a free trial",
                            description:
                                "Pick a time that suits you. We will send a reminder the evening before.",
                            submitLabel: "Book my trial",
                            successMessage:
                                "You're booked in — see you at the front desk.",
                        },
                    },
                ],
            },
            {
                path: "/join",
                title: "Memberships",
                sections: [
                    hero(
                        "Memberships",
                        "Every plan includes classes, the gym floor and a monthly review with a coach.",
                    ),
                    html(
                        "<h2>Plans</h2>" +
                            "<ul>" +
                            "<li><strong>Monthly</strong> — ₹2,500, cancel with a month's notice</li>" +
                            "<li><strong>Quarterly</strong> — ₹6,500</li>" +
                            "<li><strong>Half-yearly</strong> — ₹11,000</li>" +
                            "<li><strong>Annual</strong> — ₹18,000, with two weeks' pause</li>" +
                            "</ul>" +
                            "<h2>Personal training</h2>" +
                            "<p>Packs of 12 sessions for ₹14,400 or 24 for ₹26,400, on top of any membership.</p>",
                    ),
                    {
                        type: "enquiry",
                        form: {
                            name: "Membership enquiry",
                            fields: MEMBERSHIP_FIELDS,
                        },
                        content: {
                            title: "Ask about joining",
                            description:
                                "Tell us a little about what you want from training and a coach will call you back today.",
                            submitLabel: "Send",
                            successMessage:
                                "Thanks — a coach will call you back today.",
                        },
                    },
                ],
            },
        ],
    },
    submissions: [
        {
            message:
                "Looking at the annual plan. I work late — are there evening PT slots after 7?",
            phone: "98450 22817",
        },
        {
            message:
                "Training for my first half marathon in December. Do your coaches do run-specific strength?",
            phone: "99001 38264",
        },
        {
            message:
                "Want to join with my wife. Is there a couple rate on the annual membership?",
            phone: "98862 40193",
        },
        {
            message:
                "Recovering from a knee injury, physio has cleared me. Can a coach take me through it slowly?",
            phone: "97411 55026",
        },
        {
            message:
                "Our office of 8 people nearby wants a corporate plan. Who do I speak to?",
            phone: "98441 70358",
        },
        {
            message:
                "Just moved to Indiranagar. What time is the quietest to use the gym floor?",
            phone: "90085 16472",
        },
        {
            message:
                "Interested in the yoga classes only. Is there a class-pack instead of a membership?",
            phone: "96113 82650",
        },
        {
            message:
                "Want to lose about 8 kg before a wedding in February. Is PT 3x a week enough?",
            phone: "98804 91237",
        },
        {
            message: "Can I pause my membership for a month when I travel?",
            phone: "99160 24785",
        },
        {
            message: "Do you have women-only batches or a female coach for PT?",
            phone: "97402 63518",
        },
        {
            message: "My son is 16 — can he join with me?",
            phone: "98455 07342",
        },
        {
            message: "Is the free trial really free? No card needed?",
            phone: "90361 48829",
        },
    ],
    analytics: {
        paths: [
            { path: "/", weight: 0.42 },
            { path: "/classes", weight: 0.2 },
            { path: "/book-a-trial", weight: 0.22 },
            { path: "/join", weight: 0.16 },
        ],
        trendBase: 58,
        weekendFactor: 0.7,
        enquiryRate: 0.02,
    },
};

/** A meeting link on a reserved domain: shaped like one, never a real room. */
const meeting = (room: string) => `https://meet.example.com/${room}`;

export const PRANA: ShowcaseBusiness = {
    key: "prana",
    slug: "prana-yoga",
    name: "Prana Yoga",
    modules: ["APPOINTMENTS", "CRM", "WEBSITE", "PAYMENTS", "COURSES"],
    demoRole: "ADMIN",
    owner: { first: "Radhika", last: "Bhat", role: "OWNER" },
    staff: [
        { first: "Anand", last: "Murthy", role: "MEMBER" },
        { first: "Leela", last: "Krishnan", role: "MEMBER" },
        { first: "Farah", last: "Siddiqui", role: "MEMBER" },
    ],
    roleAccounts: [{ account: "member", role: "MEMBER" }],
    pipeline: {
        name: "Students",
        stages: [
            "New enquiry",
            "Intro class booked",
            "Tried a class",
            "Pack or course offered",
            "Joined",
        ],
    },
    leads: [
        { title: "10-class studio pack", value: 550_000 },
        { title: "Yoga foundations course", value: 720_000 },
        { title: "Private sessions — 6", value: 1_500_000 },
        { title: "Online pack", value: 175_000 },
        { title: "Corporate wellness mornings", value: 4_800_000 },
        { title: "Prenatal private series", value: 1_200_000 },
    ],
    leadTarget: 18,
    contacts: 200,
    services: [
        {
            name: "Hatha yoga",
            description:
                "An hour of held postures and slow breathing. Good for every level; mats and blocks provided.",
            minutes: 60,
            capacity: 16,
            priceCents: 60_000,
            rules: [
                { days: [1, 2, 3, 4, 5, 6], from: "07:00", to: "08:00" },
                { days: [1, 3, 5], from: "18:00", to: "19:00" },
            ],
            weight: 8,
        },
        {
            name: "Vinyasa flow",
            description:
                "Breath-led movement from one posture to the next. Some yoga behind you helps.",
            minutes: 60,
            capacity: 16,
            priceCents: 70_000,
            rules: [
                { days: [2, 4, 6], from: "06:00", to: "07:00" },
                { days: [2, 4], from: "19:15", to: "20:15" },
            ],
            weight: 7,
        },
        {
            name: "Live online class",
            description:
                "A 45-minute class on video, taught live from the studio. The link comes with your booking.",
            minutes: 45,
            capacity: 25,
            priceCents: 40_000,
            rules: [
                { days: [1, 2, 3, 4, 5], from: "06:00", to: "06:45" },
                { days: [1, 3], from: "20:30", to: "21:15" },
            ],
            weight: 6,
            meetingUrl: meeting("prana-live-class"),
        },
        {
            name: "Yoga foundations",
            description:
                "The class the foundations course is taught in: alignment, breath and the basic postures, at a beginner's pace.",
            minutes: 75,
            capacity: 12,
            priceCents: 80_000,
            rules: [
                { days: [2, 4], from: "17:30", to: "18:45" },
                { days: [6], from: "09:00", to: "10:15" },
            ],
            weight: 0.8,
        },
        {
            name: "Pranayama and meditation",
            description:
                "Forty-five minutes of breathwork and a guided sit, online.",
            minutes: 45,
            capacity: 30,
            priceCents: 35_000,
            rules: [
                { days: [0], from: "07:00", to: "07:45" },
                { days: [3], from: "19:00", to: "19:45" },
            ],
            weight: 2,
            meetingUrl: meeting("prana-breath"),
        },
        {
            name: "Private session",
            description:
                "One hour, one teacher, at the studio. For an injury, a pregnancy or a practice of your own.",
            minutes: 60,
            capacity: 1,
            priceCents: 250_000,
            rules: [{ days: [1, 2, 3, 4, 5], from: "10:00", to: "13:00" }],
            weight: 1.5,
        },
        {
            name: "Free intro class",
            description:
                "Thirty minutes with a teacher before your first class: what to expect, and which class to start with.",
            minutes: 30,
            capacity: 1,
            priceCents: null,
            rules: [{ days: [1, 2, 3, 4, 5, 6], from: "11:00", to: "12:00" }],
            weight: 1,
        },
    ],
    bookings: 320,
    weekdayWeights: [0.8, 1.1, 1.05, 1.1, 1.05, 0.95, 1.2],
    paymentProvider: "CASHFREE",
    billing: {
        plans: [],
        subscriptions: 0,
        packs: [
            {
                name: "10-class studio pack",
                description:
                    "Ten studio classes — hatha, vinyasa or foundations — within three months.",
                credits: 10,
                validityDays: 90,
                pricePaise: 550_000,
                services: [0, 1, 3],
                status: "ACTIVE",
                buyers: 22,
            },
            {
                name: "5 online classes",
                description:
                    "Five live online classes or breathwork sessions within six weeks.",
                credits: 5,
                validityDays: 45,
                pricePaise: 175_000,
                services: [2, 4],
                status: "ACTIVE",
                buyers: 14,
            },
            {
                name: "Monsoon pack — 8 classes",
                description: "Last monsoon's offer: eight studio classes.",
                credits: 8,
                validityDays: 60,
                pricePaise: 360_000,
                services: [0, 1],
                status: "ARCHIVED",
                buyers: 5,
            },
        ],
        courses: [
            {
                name: "Yoga foundations — six weeks",
                description:
                    "Twelve evening classes that take a beginner from the first posture to a practice of their own.",
                service: 3,
                pricePaise: 720_000,
                seats: 10,
                status: "OPEN",
                firstDay: -22,
                schedule: [
                    { day: 2, at: "17:30" },
                    { day: 4, at: "17:30" },
                ],
                sessions: 12,
                enrolled: 8,
                lateJoiners: 1,
                cancelled: 1,
            },
            {
                name: "Breath and stillness — four weeks online",
                description:
                    "Eight live online sessions of pranayama and meditation, with a recording of each.",
                service: 4,
                pricePaise: 320_000,
                seats: 20,
                status: "OPEN",
                firstDay: 9,
                schedule: [
                    { day: 0, at: "07:00" },
                    { day: 3, at: "19:00" },
                ],
                sessions: 8,
                enrolled: 11,
            },
            {
                name: "Foundations — summer batch",
                description: "Saturday mornings, six weeks.",
                service: 3,
                pricePaise: 540_000,
                seats: 12,
                status: "CLOSED",
                firstDay: -80,
                schedule: [{ day: 6, at: "09:00" }],
                sessions: 6,
                enrolled: 10,
            },
            {
                name: "Yoga for a healthy back",
                description:
                    "Four Saturday sessions on the back, for desk workers. Being planned.",
                service: 3,
                pricePaise: 360_000,
                seats: 8,
                status: "DRAFT",
                firstDay: 30,
                schedule: [{ day: 6, at: "09:00" }],
                sessions: 4,
                enrolled: 0,
            },
        ],
        manualInvoices: [
            {
                lines: [
                    {
                        description: "Corporate wellness morning · two hours",
                        quantity: 1,
                        unitPaise: 1_200_000,
                    },
                    {
                        description: "Mats and props for 20",
                        quantity: 1,
                        unitPaise: 150_000,
                    },
                ],
                taxPaise: 243_000,
                daysAgo: 19,
                state: "PAID",
                company: true,
            },
            {
                lines: [
                    {
                        description: "Private session",
                        quantity: 3,
                        unitPaise: 250_000,
                    },
                ],
                taxPaise: 0,
                daysAgo: 12,
                state: "ISSUED",
            },
            {
                lines: [
                    {
                        description: "Teacher for a private event · 90 minutes",
                        quantity: 1,
                        unitPaise: 600_000,
                    },
                ],
                taxPaise: 0,
                daysAgo: 0,
                state: "DRAFT",
            },
        ],
    },
    footer: "Prana Yoga · 27th Main, HSR Layout Sector 2, Bengaluru · Classes daily from 6am, and online",
    site: {
        slug: "prana-yoga",
        name: "Prana Yoga",
        subdomain: "prana-yoga",
        published: true,
        createdDaysAgo: 210,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    hero(
                        "Yoga at your pace, in the studio or at home",
                        "A small studio in HSR Layout with classes from six in the morning, live online classes for the days you cannot come in, and courses for beginners.",
                        { label: "Book a free intro", href: "/book" },
                    ),
                    {
                        type: "features",
                        content: {
                            heading: "How Prana works",
                            items: [
                                {
                                    title: "Small classes",
                                    body: "Sixteen mats at most, so a teacher can adjust you.",
                                },
                                {
                                    title: "Online, live",
                                    body: "The same teachers, on video, at 6am and in the evening. Your link comes with the booking.",
                                },
                                {
                                    title: "Courses for beginners",
                                    body: "Six weeks of foundations with the same group and the same teacher.",
                                },
                                {
                                    title: "Class packs",
                                    body: "Buy ten classes and use them across the week, studio or online.",
                                },
                            ],
                        },
                    },
                    {
                        type: "servicesList",
                        services: [0, 1, 2, 5],
                        content: { heading: "Classes", showPrices: true },
                    },
                    button("See the timetable", "/classes"),
                ],
            },
            {
                path: "/classes",
                title: "Classes",
                sections: [
                    hero(
                        "Studio and online classes",
                        "Drop in to any class, or use a pack. Online classes are live, never recorded replays.",
                    ),
                    {
                        type: "servicesList",
                        services: [0, 1, 3, 2, 4, 5],
                        content: { showPrices: true },
                    },
                    {
                        type: "faq",
                        content: {
                            heading: "Before your first class",
                            items: [
                                {
                                    question:
                                        "I have never done yoga. Where do I start?",
                                    answer: "Book the free intro, then hatha or the foundations course. Both go at a beginner's pace.",
                                },
                                {
                                    question: "How do online classes work?",
                                    answer: "Book a time and the video link comes with your confirmation. Join five minutes early with a mat and a cushion.",
                                },
                                {
                                    question: "Do class packs expire?",
                                    answer: "The studio pack lasts three months and the online pack six weeks from the day you buy it.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/courses",
                title: "Courses",
                sections: [
                    hero(
                        "Courses",
                        "A fixed group, a fixed teacher and a set number of weeks — the easiest way to start a practice that lasts.",
                    ),
                    html(
                        "<h2>Yoga foundations — six weeks</h2>" +
                            "<p>Tuesday and Thursday evenings, twelve classes, ₹7,200. The next batch opens when this one finishes.</p>" +
                            "<h2>Breath and stillness — four weeks online</h2>" +
                            "<p>Sunday mornings and Wednesday evenings, eight live sessions, ₹3,200.</p>",
                    ),
                    button("Ask about a course", "/contact"),
                ],
            },
            {
                path: "/book",
                title: "Free intro",
                sections: [
                    hero(
                        "Start with a free intro",
                        "Thirty minutes with a teacher: what to expect, and which class to start with.",
                    ),
                    {
                        type: "booking",
                        service: 6,
                        content: {
                            title: "Book a free intro",
                            description:
                                "Pick a time. Come in comfortable clothes.",
                            submitLabel: "Book my intro",
                            successMessage: "Booked — see you at the studio.",
                        },
                    },
                ],
            },
            {
                path: "/contact",
                title: "Contact",
                sections: [
                    hero(
                        "Ask us anything",
                        "About classes, packs, courses or a session at your office.",
                    ),
                    {
                        type: "enquiry",
                        form: { name: "Class enquiry", fields: CONTACT_FIELDS },
                        content: {
                            title: "Send us a message",
                            description: "A teacher replies the same day.",
                            submitLabel: "Send",
                            successMessage: "Thank you — we will reply today.",
                        },
                    },
                ],
            },
        ],
    },
    submissions: [
        {
            message:
                "Complete beginner, quite stiff from desk work. Is the foundations course right for me?",
        },
        {
            message:
                "I travel a lot for work. Can I use the class pack for online classes too?",
        },
        {
            message:
                "Five months pregnant and cleared by my doctor. Do you do prenatal private sessions?",
        },
        {
            message:
                "Our team of 20 wants a yoga morning once a month at the office. Do you come to Koramangala?",
        },
        {
            message: "When does the next foundations batch start?",
        },
        {
            message:
                "Is the 6am online class suitable if I have a slipped disc? Physio says gentle is fine.",
        },
        {
            message: "Can my mother (62) join the hatha class?",
        },
        {
            message:
                "I bought the monsoon pack last year and have two classes left — can I still use them?",
        },
        {
            message:
                "Do you teach in Kannada as well? My father would be more comfortable.",
        },
    ],
    analytics: {
        paths: [
            { path: "/", weight: 0.38 },
            { path: "/classes", weight: 0.26 },
            { path: "/courses", weight: 0.14 },
            { path: "/book", weight: 0.14 },
            { path: "/contact", weight: 0.08 },
        ],
        trendBase: 52,
        weekendFactor: 1.1,
        enquiryRate: 0.015,
    },
};

export const CAREPOINT: ShowcaseBusiness = {
    key: "carepoint",
    slug: "carepoint-clinic",
    name: "CarePoint Clinic",
    modules: ["APPOINTMENTS", "CRM", "WEBSITE"],
    // A Member, on purpose: the film shows what a Member may and may not see.
    demoRole: "MEMBER",
    owner: { first: "Meera", last: "Nair", role: "OWNER" },
    staff: [
        { first: "Pooja", last: "Shetty", role: "ADMIN" },
        { first: "Arjun", last: "Rao", role: "MEMBER" },
        { first: "Sara", last: "Thomas", role: "MEMBER" },
    ],
    roleAccounts: [],
    // Patients are not a sales pipeline: no board, and the clinic's form
    // entries open no leads.
    pipeline: null,
    leads: [],
    contacts: 260,
    services: [
        {
            name: "General consultation — Dr. Meera Nair",
            description:
                "Fifteen minutes with a general physician for anything new: fever, pain, a check on a long-standing condition.",
            minutes: 15,
            capacity: 1,
            priceCents: 60_000,
            rules: [
                { days: [1, 2, 3, 4, 5, 6], from: "09:00", to: "13:00" },
                { days: [1, 2, 3, 4, 5], from: "17:00", to: "20:00" },
            ],
            weight: 8,
        },
        {
            name: "Paediatrics — Dr. Arjun Rao",
            description:
                "Twenty minutes for a child's illness, growth check or vaccination schedule.",
            minutes: 20,
            capacity: 1,
            priceCents: 80_000,
            rules: [
                { days: [1, 3, 5], from: "10:00", to: "13:00" },
                { days: [6], from: "10:00", to: "12:00" },
            ],
            weight: 4,
        },
        {
            name: "Dermatology — Dr. Sara Thomas",
            description:
                "Skin, hair and nails. Bring any creams you are using.",
            minutes: 20,
            capacity: 1,
            priceCents: 90_000,
            rules: [
                { days: [2, 4], from: "16:00", to: "19:00" },
                { days: [6], from: "09:00", to: "12:00" },
            ],
            weight: 3,
        },
        {
            name: "Teleconsultation",
            description:
                "Fifteen minutes on video with a doctor, for a follow-up or a question that does not need an examination. The link comes with your booking.",
            minutes: 15,
            capacity: 1,
            priceCents: 50_000,
            rules: [{ days: [1, 2, 3, 4, 5, 6], from: "13:30", to: "15:00" }],
            weight: 3,
            meetingUrl: meeting("carepoint-teleconsult"),
        },
        {
            name: "Annual health check",
            description:
                "An hour: blood tests, ECG, and a doctor to go through the results. Come fasting.",
            minutes: 60,
            capacity: 2,
            priceCents: 350_000,
            rules: [{ days: [1, 2, 3, 4, 5, 6], from: "07:30", to: "09:30" }],
            weight: 1.5,
        },
        {
            name: "Follow-up visit",
            description:
                "Ten minutes to review results or a treatment, within two weeks of a consultation.",
            minutes: 10,
            capacity: 1,
            priceCents: 30_000,
            rules: [{ days: [1, 2, 3, 4, 5], from: "12:00", to: "13:00" }],
            weight: 3,
        },
    ],
    bookings: 340,
    weekdayWeights: [0, 1.3, 1.1, 1, 1.05, 1, 1.2],
    footer: "CarePoint Clinic · 5th Cross, Malleshwaram, Bengaluru · Mon–Sat 7:30am–8pm · For an emergency, call 108",
    site: {
        slug: "carepoint-clinic",
        name: "CarePoint Clinic",
        subdomain: "carepoint-clinic",
        published: true,
        createdDaysAgo: 240,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    hero(
                        "A neighbourhood clinic that runs on time",
                        "General practice, children's health and skin care in Malleshwaram. Book a time online, in person or on video.",
                        { label: "Book an appointment", href: "/book" },
                    ),
                    {
                        type: "features",
                        content: {
                            heading: "What to expect",
                            items: [
                                {
                                    title: "Appointments, not queues",
                                    body: "Book a time and be seen at that time.",
                                },
                                {
                                    title: "Video when it will do",
                                    body: "Follow-ups and questions on a teleconsultation, without the trip.",
                                },
                                {
                                    title: "The same doctor",
                                    body: "Your records and your doctor stay the same from one visit to the next.",
                                },
                            ],
                        },
                    },
                    {
                        type: "servicesList",
                        services: [0, 1, 2, 3, 4],
                        content: { heading: "Appointments", showPrices: true },
                    },
                ],
            },
            {
                path: "/doctors",
                title: "Doctors",
                sections: [
                    hero("Our doctors"),
                    html(
                        "<h2>Dr. Meera Nair</h2><p>General physician, MBBS, MD. Twenty years in family practice.</p>" +
                            "<h2>Dr. Arjun Rao</h2><p>Paediatrician, MBBS, DCH. Mondays, Wednesdays, Fridays and Saturday mornings.</p>" +
                            "<h2>Dr. Sara Thomas</h2><p>Dermatologist, MBBS, MD. Tuesday and Thursday evenings, Saturday mornings.</p>",
                    ),
                ],
            },
            {
                path: "/book",
                title: "Book",
                sections: [
                    hero(
                        "Book an appointment",
                        "Choose a time. We will send a reminder the day before.",
                    ),
                    {
                        type: "booking",
                        service: 0,
                        content: {
                            title: "General consultation",
                            description: "Fifteen minutes with Dr. Meera Nair.",
                            submitLabel: "Book",
                            successMessage:
                                "Booked — please arrive ten minutes early.",
                        },
                    },
                ],
            },
            {
                path: "/contact",
                title: "Contact",
                sections: [
                    hero(
                        "Ask the clinic",
                        "For appointments, reports or anything else. Not for emergencies — call 108.",
                    ),
                    {
                        type: "enquiry",
                        form: {
                            name: "Ask the clinic",
                            fields: CONTACT_FIELDS,
                        },
                        content: {
                            title: "Send a message",
                            description:
                                "The front desk replies within a working day.",
                            submitLabel: "Send",
                            successMessage:
                                "Thank you — the front desk will reply within a working day.",
                        },
                    },
                ],
            },
        ],
    },
    submissions: [
        {
            message:
                "Are my blood test results from last Tuesday ready? Can they be emailed?",
        },
        {
            message:
                "Does Dr. Arjun Rao give the MMR booster? My daughter is due next month.",
        },
        {
            message: "Do you accept Star Health cashless for the annual check?",
        },
        {
            message:
                "My father needs a fitness certificate for his driving licence renewal. Which appointment should I book?",
        },
        {
            message:
                "Is there parking near the clinic? I will be bringing my mother in a wheelchair.",
        },
        {
            message:
                "Can I get a teleconsultation for a rash? I can send photos beforehand.",
        },
        {
            message:
                "Please could you share the fasting instructions for the health check?",
        },
        {
            message: "Is the clinic open on the Dasara holiday?",
        },
    ],
    analytics: {
        paths: [
            { path: "/", weight: 0.4 },
            { path: "/book", weight: 0.32 },
            { path: "/doctors", weight: 0.18 },
            { path: "/contact", weight: 0.1 },
        ],
        trendBase: 70,
        weekendFactor: 0.6,
        enquiryRate: 0.006,
    },
};

export const LUMEN: ShowcaseBusiness = {
    key: "lumen",
    slug: "lumen-studio",
    name: "Lumen Studio",
    modules: ["CRM", "WEBSITE"],
    demoRole: "REVIEWER",
    owner: { first: "Aditi", last: "Rao", role: "OWNER" },
    leadTarget: 30,
    staff: [
        { first: "Vikram", last: "Iyer", role: "ADMIN" },
        { first: "Sana", last: "Merchant", role: "MEMBER" },
        { first: "Rohan", last: "Pillai", role: "MEMBER" },
    ],
    roleAccounts: [],
    pipeline: {
        name: "Projects",
        stages: [
            "Enquiry",
            "Discovery call",
            "Proposal sent",
            "Negotiation",
            "Contract",
        ],
    },
    leads: [
        { title: "Brand identity refresh", value: 18_000_000 },
        { title: "Website redesign", value: 32_000_000 },
        { title: "Packaging system — 12 SKUs", value: 24_000_000 },
        { title: "Menu and signage", value: 9_500_000 },
        { title: "Launch campaign assets", value: 14_000_000 },
        { title: "Design retainer, 6 months", value: 36_000_000 },
        { title: "Pitch deck and investor site", value: 12_000_000 },
        { title: "E-commerce build", value: 45_000_000 },
        { title: "Logo and stationery", value: 6_000_000 },
        { title: "Annual report design", value: 16_000_000 },
    ],
    contacts: 40,
    companies: [
        "Saffron Table",
        "Koshy Organics",
        "Tidewater Kayaks",
        "Banyan Books",
        "Monsoon Tea Co.",
        "Indigo Loom",
        "Coastline Coffee",
        "Hearth Ceramics",
        "Paper Boat Press",
        "Kolam Kitchen",
        "Mango Street Kids",
        "Nilgiri Honey",
        "Greenfield Clinic",
        "Two Rivers Distillery",
        "Brick Lane Architects",
        "Chakra Cycles",
        "Ooty Bakehouse",
        "Sutra Handlooms",
        "Laalten Lights",
        "Quartz Dental",
        "Terra Firma Landscapes",
        "Seven Hills School",
        "Anchor Legal",
        "Mitti Pottery",
        "Blue Pine Resorts",
        "Kite Robotics",
        "Pepper & Pine",
        "Ghar Interiors",
        "Sona Jewellers",
        "Tulsi Wellness",
    ],
    services: [],
    bookings: 0,
    footer: "Lumen Studio · Brand and web design · HSR Layout, Bengaluru",
    site: {
        slug: "lumen-studio",
        name: "Lumen Studio",
        subdomain: "lumen-studio",
        published: true,
        createdDaysAgo: 240,
        pages: [
            {
                path: "/",
                title: "Home",
                isHome: true,
                sections: [
                    hero(
                        "Brand and web design for independent businesses",
                        "A four-person studio in HSR Layout. We name things, draw things and build websites for restaurants, makers and clinics who would rather not look like everyone else.",
                        { label: "Start a project", href: "/contact" },
                    ),
                    {
                        type: "features",
                        content: {
                            heading: "What we do",
                            items: [
                                {
                                    title: "Brand identity",
                                    body: "Names, logos, type and colour — and the guidelines so it survives the first print run.",
                                },
                                {
                                    title: "Websites",
                                    body: "Sites a business can update itself, built on the platform it already uses.",
                                },
                                {
                                    title: "Packaging",
                                    body: "Labels and boxes designed for the shelf and for the printer's limits.",
                                },
                            ],
                        },
                    },
                    button("See our work", "/work"),
                ],
            },
            {
                path: "/work",
                title: "Work",
                sections: [
                    hero(
                        "Selected work",
                        "A few recent projects, and what changed for the business afterwards.",
                    ),
                    html(
                        "<h2>Coastline Coffee</h2>" +
                            "<p>A new identity and packaging for a roastery moving from cafés into retail. " +
                            "Twelve origins, one system that tells them apart at arm's length.</p>" +
                            "<h2>Hearth Ceramics</h2>" +
                            "<p>An online shop for a studio potter that sells out each firing. " +
                            "Waitlists instead of 'sold out', and a restock email people actually open.</p>" +
                            "<h2>Seven Hills School</h2>" +
                            "<p>Admissions site and prospectus, written with parents rather than at them.</p>",
                    ),
                ],
            },
            {
                path: "/services",
                title: "Services",
                sections: [
                    hero(
                        "How we work",
                        "Fixed-price projects with a clear scope, or a monthly retainer when there is always something next.",
                    ),
                    {
                        type: "features",
                        content: {
                            items: [
                                {
                                    title: "Discovery — one week",
                                    body: "Workshops with you and your customers, and a written brief we both sign off.",
                                },
                                {
                                    title: "Design — three to six weeks",
                                    body: "Two directions, one chosen, then refined until it works at every size.",
                                },
                                {
                                    title: "Build and hand over",
                                    body: "We build it, train your team and stay on call for a month after launch.",
                                },
                            ],
                        },
                    },
                    {
                        type: "faq",
                        content: {
                            heading: "Questions we get asked",
                            items: [
                                {
                                    question: "What does a project cost?",
                                    answer: "Identity projects usually start around ₹1.5 lakh and websites around ₹3 lakh. We quote a fixed price after the discovery call.",
                                },
                                {
                                    question: "How far ahead are you booked?",
                                    answer: "Usually four to six weeks. Small jobs can sometimes fit in sooner.",
                                },
                                {
                                    question: "Do you work outside Bengaluru?",
                                    answer: "Yes — about half our clients are elsewhere in India. Workshops happen on video.",
                                },
                            ],
                        },
                    },
                ],
            },
            {
                path: "/contact",
                title: "Contact",
                sections: [
                    hero(
                        "Start a project",
                        "Tell us where the business is and where you want it to be. We reply within two working days.",
                    ),
                    {
                        type: "enquiry",
                        form: {
                            name: "Project enquiry",
                            fields: [
                                ...ENQUIRY_FIELDS.filter(
                                    (f) => f.name !== "message",
                                ),
                                {
                                    name: "budget",
                                    label: "Rough budget",
                                    type: "text",
                                },
                                {
                                    name: "message",
                                    label: "About the project",
                                    type: "textarea",
                                    required: true,
                                },
                            ],
                        },
                        content: {
                            title: "Tell us about it",
                            description:
                                "A few lines is plenty. We will suggest a time for a call.",
                            submitLabel: "Send",
                            successMessage:
                                "Thanks — we will reply within two working days.",
                        },
                    },
                ],
            },
        ],
    },
    submissions: [
        {
            message:
                "We are opening a second restaurant and want the brand to grow up a bit. Can we talk?",
            extra: { budget: "₹2–3 lakh" },
        },
        {
            message:
                "Need a new website before our Diwali collection launch. Currently on a template that looks tired.",
            extra: { budget: "₹4 lakh" },
        },
        {
            message:
                "Looking for packaging design for a range of cold-pressed oils, 6 SKUs.",
            extra: { budget: "Not sure yet" },
        },
        {
            message:
                "Our clinic needs a site patients can book from, and a logo that doesn't look like a hospital.",
            extra: { budget: "₹3 lakh" },
        },
        {
            message:
                "Would you take on a retainer for monthly social and print assets?",
            extra: { budget: "₹60k a month" },
        },
        {
            message:
                "Investor deck and a one-page site for a robotics startup, in five weeks.",
            extra: { budget: "₹1.5 lakh" },
        },
    ],
    analytics: {
        paths: [
            { path: "/", weight: 0.36 },
            { path: "/work", weight: 0.24 },
            { path: "/services", weight: 0.14 },
            { path: "/contact", weight: 0.1 },
            { path: "/blog/naming-a-small-business", weight: 0.07 },
            { path: "/blog/what-a-brand-refresh-costs", weight: 0.05 },
            { path: "/blog/websites-you-can-update-yourself", weight: 0.04 },
        ],
        trendBase: 38,
        weekendFactor: 0.4,
        enquiryRate: 0.012,
    },
};

/** Lumen's three published posts (ADR-004: a post belongs to its site). */
export const LUMEN_POSTS: readonly {
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    daysAgo: number;
}[] = [
    {
        slug: "naming-a-small-business",
        title: "Naming a small business without a naming agency",
        excerpt: "Five tests a name has to pass before you print anything.",
        content:
            "Most names fail one of five tests: it can be said over the phone, it can be spelled after hearing it once, the domain and handle are free, it does not mean something unfortunate in another language your customers speak, and it still fits when you add a second product.\n\nWe run every shortlist through all five before a client sees it. It is unglamorous work and it saves the reprint.",
        daysAgo: 64,
    },
    {
        slug: "what-a-brand-refresh-costs",
        title: "What a brand refresh actually costs",
        excerpt: "The design fee is the smallest line. Here is the rest.",
        content:
            "When a café asks what a new identity costs, they usually mean our fee. The bigger numbers come after: signage, menus, cups, uniforms, the delivery app banners, and the week of staff time spent swapping everything over.\n\nWe now price a refresh with a rollout plan attached, so the business can phase it over a quarter instead of paying for it all at once.",
        daysAgo: 31,
    },
    {
        slug: "websites-you-can-update-yourself",
        title: "Websites you can update yourself",
        excerpt: "Why we stopped building sites only a developer could change.",
        content:
            "A site that needs us to change the opening hours is a site that will be wrong by Diwali. Every site we build now is edited by the business itself, on a platform it already pays for, and our handover includes an hour of training for whoever will do it.\n\nIt means fewer maintenance invoices for us. It also means the sites stay right, which is the point.",
        daysAgo: 9,
    },
];

export const SHOWCASE_BUSINESSES: readonly ShowcaseBusiness[] = [
    PULSE,
    PRANA,
    CAREPOINT,
    LUMEN,
];

/**
 * Businesses an earlier showcase seeded and this one no longer does. Their
 * `seed_sc_<key>_` rows are removed on every run, so a database seeded before
 * the line-up changed does not keep a salon and a bakery nobody can explain.
 */
export const RETIRED_BUSINESS_KEYS: readonly string[] = ["mirror", "rye"];

/** What gets written on a lead's timeline, per business. */
export const LEAD_TIMELINE: Readonly<
    Record<string, { notes: readonly string[]; tasks: readonly string[] }>
> = {
    nw: {
        notes: [
            "Spoke to their purchase manager — current supplier keeps missing the 2pm cut-off.",
            "Wants samples of the 3-ply and 5-ply before committing to a monthly order.",
            "Asked for 30-day credit terms. Checked references, looks fine.",
            "Volumes should double after Diwali; they want pricing locked till March.",
            "Visited the warehouse. Liked that stock is on the shelf, not on order.",
        ],
        tasks: [
            "Send revised quote with trade pricing",
            "Call back about delivery schedule",
            "Share samples and spec sheets",
            "Confirm credit terms with accounts",
            "Follow up on the trial order",
        ],
    },
    pulse: {
        notes: [
            "Came in for the trial with a friend. Keen on evening HIIT.",
            "Worried about an old shoulder injury — Kabir to plan around it.",
            "Comparing us with the chain gym on 100 Feet Road. Price is the question.",
            "Wants to start after a work trip, back on the 20th.",
            "Loved the yoga class. Asked about the annual pause option.",
        ],
        tasks: [
            "Call to book the free trial",
            "Send membership plans on WhatsApp",
            "Check in after the trial session",
            "Follow up on the annual offer",
            "Confirm PT start date with Kabir",
        ],
    },
    prana: {
        notes: [
            "Came to the free intro. Stiff hamstrings, keen to start slowly.",
            "Asked whether the online pack works with the 6am class — it does.",
            "Wants the foundations course but travels the first week. Offered the next batch.",
            "Office team of 20 — HR wants a quote for monthly mornings.",
            "Tried hatha and vinyasa; prefers hatha. Sent the studio pack price.",
        ],
        tasks: [
            "Call to book the free intro",
            "Send the class timetable",
            "Share the foundations course dates",
            "Follow up after the first class",
            "Send the corporate wellness quote",
        ],
    },
    lumen: {
        notes: [
            "Discovery call went well. They have a launch date they cannot move.",
            "Two decision makers — founder and her brother. Brother cares about cost.",
            "They saw the Coastline Coffee packaging and want something as distinctive.",
            "Existing site is on Shopify; they want to stay on it.",
            "Asked for a phased payment — 40/40/20 is fine.",
            "Went with a larger agency. Said our proposal was clearer, theirs was cheaper.",
        ],
        tasks: [
            "Send proposal and timeline",
            "Schedule the discovery call",
            "Share two reference projects",
            "Chase signed contract and deposit",
            "Book kickoff workshop",
        ],
    },
};
