/**
 * The shape of a "diary and counter" business (Noor Salon & Bridal, Motion
 * Physio): people on a diary taking one-to-one appointments, packs and
 * multi-visit treatments, and a counter selling retail products. Each
 * business is data in its own files (`salon-*.ts`, `physio-*.ts`); the
 * planner (`diary-shop-plan.ts`) and writer (`diary-shop.ts`) are shared.
 */

/**
 * Where a generated image (a shade card, a band colour) is served: the
 * merchant workspace's `public/demo/` folder, by absolute https address so
 * both the workspace (`mediaSrc` keeps only absolute http(s)) and the
 * merchant sites load it. Local showcase only, like the rest of the seed.
 * `swatches.ts` draws them; `scripts/check-demo-images.mjs` checks the files.
 */
export const DEMO_ASSET_BASE = "https://app.saroh.localhost/demo/";
export const demoAsset = (file: string) => `${DEMO_ASSET_BASE}${file}`;

/** One generated image: a colour drawn as the thing it is. */
export interface DsSwatch {
    /** Path under `apps/app.saroh.in/public/demo/`, e.g. "noor/colour-6-3.png". */
    file: string;
    kind: "hair" | "nail" | "band" | "tape" | "card";
    /** The colour; for a "card", every shade on it. */
    hex: string | readonly string[];
    /** Big label, e.g. "6.3". */
    title: string;
    /** Small label, e.g. "Dark Golden Blonde". */
    subtitle: string;
    /** For a "card", the labels under each chip. */
    labels?: readonly string[];
}

/** A photograph or generated image, credited the way the boutique's are. */
export interface DsImage {
    url: string;
    alt: string;
    width: number;
    height: number;
    /** The photographer, or the business for a generated swatch. */
    creditName: string;
    creditUrl: string;
}

/** 0 = Sunday … 6 = Saturday; "HH:MM" wall clock in Kolkata. */
export interface DsWindow {
    days: readonly number[];
    from: string;
    to: string;
}

export interface DsService {
    key: string;
    name: string;
    description: string;
    /** For the site's grouped price list ("Hair", "Skin", …). */
    group: string;
    minutes: number;
    /** Minutes kept clear before and after (travel for a home visit). */
    buffer?: number;
    /** GST-inclusive price, paise. */
    pricePaise: number;
    /** More than one: a treatment sold as one order (E9). */
    visits: number;
    depositMode: "NONE" | "PERCENT_50";
    locationType: "IN_PERSON" | "EITHER" | "ONLINE";
    meetingUrl: string | null;
    /** On the booking page; a hidden one is booked by the desk. */
    shown: boolean;
    /** Share of the day-to-day diary; 0 = only scenes, packs or treatments. */
    weight: number;
    /** Who books it, for the generated diary: women, men, kids or anyone. */
    audience?: "women" | "men" | "kids" | "any";
    /** A photo that shows it, used on the site (Service has no image). */
    image?: DsImage;
}

export interface DsStaff {
    key: string;
    name: string;
    title: string;
    /** One or two sentences for the site's team section. */
    bio: string;
    /** Service keys they take. */
    services: readonly string[];
    hours: readonly DsWindow[];
    photo?: DsImage;
}

export interface DsPack {
    key: string;
    name: string;
    description: string;
    credits: number;
    validityDays: number;
    pricePaise: number;
    /** Service keys a credit pays for. */
    services: readonly string[];
    /** Packs sold over the last ~90 days. */
    sold: number;
    /** Days between a holder's visits. */
    cadenceDays: readonly [number, number];
}

export interface DsVariant {
    title: string;
    sku: string;
    /** Rupees as a decimal string, or null for the product's price. */
    price: string | null;
    mrp: string | null;
    stock: { onHand: number; warnAt: number };
    /** Index into the product's images, or null for the cover. */
    imageIndex: number | null;
    /**
     * The variant's own picture by address (ProductVariant.image), for a
     * product with more shades than its 15 photos can hold.
     */
    image?: string;
}

export interface DsReview {
    rating: number;
    body: string;
    /** "Meera K." */
    displayName: string;
    variantTitle: string | null;
    daysAgo: number;
    reply: string | null;
}

export interface DsProduct {
    slug: string;
    name: string;
    /** A key of the business's categories. */
    category: string;
    /** The one option its variants differ by, or null. */
    option: string | null;
    price: string;
    mrp: string | null;
    description: string;
    keyPoints: string[];
    howToUse: string;
    materials: string;
    maker: string;
    madeIn: string;
    /** GST rate in percent and HSN code (registered businesses only). */
    gstRate: number;
    hsnCode: string;
    /** Single-stock products only. */
    stock: { onHand: number; warnAt: number } | null;
    variants: DsVariant[];
    images: DsImage[];
    /** Relative demand at the counter (1 = ordinary). */
    demand: number;
    reviews: DsReview[];
}

export interface DsAttention {
    kind: "ALLERGY" | "MEDICAL" | "ACCESS" | "OTHER";
    label: string;
    detail: string;
    sensitive: boolean;
}

/** A named regular: who the scenes and notes are about. */
export interface DsClient {
    key: string;
    first: string;
    last: string;
    phone: string;
    gender: "f" | "m";
    attention: readonly DsAttention[];
    notes: readonly string[];
}

export interface DsPost {
    slug: string;
    title: string;
    category: "help" | "news" | "articles";
    /** Days before now it was published. */
    daysAgo: number;
    excerpt: string;
    /** The cover; the body carries at least one image of its own. */
    image: DsImage;
    /** HTML: <p>, <h2>, <h3>, <ul>/<ol>, <strong>, <em>, <a>, <figure><img><figcaption>. */
    body: string;
}

export interface DsEnquiry {
    daysAgo: number;
    /** A named regular's key, or null for someone new. */
    client: string | null;
    first: string;
    last: string;
    phone: string;
    message: string;
    /** Extra form fields, by name. */
    extra?: Record<string, string>;
}

/** A monthly membership sold at the desk (the desk books its visits). */
export interface DsPlan {
    key: string;
    name: string;
    description: string;
    pricePaise: number;
    /** Visits a month it includes. */
    classesPerMonth: number;
    /** Service keys members book on it. */
    services: readonly string[];
    /** Members now, and members who have left over the past year. */
    active: number;
    ended: number;
}

/**
 * A booking a film or a Home card needs, placed relative to now: the first
 * start that works from `day` (at `from`) within `spanDays`.
 */
export interface DsScene {
    key: string;
    /** A named client's key. */
    client: string;
    service: string;
    /** Who may take it, in order of preference; else anyone who does. */
    staff?: readonly string[];
    day: number;
    from?: string;
    spanDays?: number;
    /** Booked this long before its start, by the client on the site or the desk. */
    madeDaysBefore: number;
    by: "client" | "desk";
    pay: "DESK" | "PAID" | "DEPOSIT";
    /** Past ones default to ATTENDED. */
    outcome?: "ATTENDED" | "NO_SHOW" | "UNMARKED" | "LATE_CANCEL";
    /** "Anything we should know?" — a sensitive note waiting as a suggestion. */
    note?: { text: string; label: string; kind: DsAttention["kind"] };
}

/**
 * A run of visits after a first one (a physio's course): how many people
 * start one a week, how many visits they come to — weighted, so the drop
 * after the third shows — and how far apart.
 */
export interface DsCourses {
    first: string;
    then: readonly string[];
    perWeek: number;
    lengths: readonly { visits: number; weight: number }[];
    everyDays: readonly [number, number];
}

/** A multi-visit treatment sold as one order (E9). */
export interface DsTreatments {
    service: string;
    /** Orders started over the last ~90 days. */
    count: number;
    everyDays: readonly [number, number];
    /** Of those started long enough ago, the share who stop after visit 3. */
    dropAfterThird: number;
}

/** One closure, from a local date for some whole days. */
export interface DsClosure {
    /** "2026-11-08", Kolkata. */
    from: string;
    days: number;
    reason: string;
}

export interface DsSiteSection {
    type: string;
    /** Service keys, resolved to ids, for a servicesList. */
    services?: readonly string[];
    /** For an enquiry: the form to write. */
    form?: {
        name: string;
        fields: readonly {
            name: string;
            label: string;
            type: string;
            required?: boolean;
        }[];
    };
    content: Record<string, unknown>;
}

export interface DsSitePage {
    path: string;
    title: string;
    isHome?: boolean;
    sections: readonly DsSiteSection[];
}

export interface DsBusiness {
    key: string;
    name: string;
    slug: string;
    legalName: string;
    contactEmail: string;
    phoneE164: string;
    phoneDisplay: string;
    address: {
        addressLine1: string;
        addressLine2: string;
        city: string;
        postalCode: string;
    };
    /** The registered address as invoices print it. */
    addressPrinted: string;
    /** One line for the storefront. */
    storeAddress: string;
    storeDescription: string;
    /** Null: not GST-registered (plain receipts, INV-0001…). */
    gst: null | {
        state: string;
        pan: string;
        prefix: string;
        serviceRateBps: number;
        sac: string;
    };
    /** Service SAC when not registered (exempt healthcare). */
    sac: string;
    modules: readonly string[];
    /** When the business joined, days before now. */
    sinceDays: number;
    openingHours: readonly {
        day: string;
        open: string;
        close: string;
        closed: boolean;
    }[];
    rules: {
        bookAheadDays: number;
        latestBookingMinutes: number;
        freeCancelHours: number;
    };
    services: readonly DsService[];
    staff: readonly DsStaff[];
    /** The staff member who is the demo owner (linked to their membership). */
    ownerStaff: string;
    /** Who works the desk with a login, and the diary person they are, if any. */
    desk: { first: string; last: string; staff: string | null };
    /** Who may take a day off this week (the first who can), and why. */
    dayOff: { staff: readonly string[]; reason: string };
    closures: readonly DsClosure[];
    packs: readonly DsPack[];
    plans: readonly DsPlan[];
    scenes: readonly DsScene[];
    courses: DsCourses | null;
    treatments: DsTreatments | null;
    clients: readonly DsClient[];
    generatedClients: number;
    /** Share of generated clients who are women. */
    womenShare: number;
    names: {
        women: readonly string[];
        men: readonly string[];
        last: readonly string[];
    };
    /** The generated diary. */
    diary: {
        /** Chance a free half hour starts a booking: past and coming weeks. */
        pastShare: number;
        aheadShare: number;
        /** By weekday, 0 = Sunday. */
        weekday: readonly number[];
        noShow: number;
        cancel: number;
        /** Of cancels, the share made inside the free-cancel window. */
        lateShare: number;
        /** Booked on the site rather than by the desk. */
        online: number;
        /** Of those booked online without a deposit, paid at booking. */
        payNow: number;
        /** Desk bills paid on the spot; the rest due, a few overdue. */
        paidAtDesk: number;
        /** Busier days (weddings, festivals): Kolkata ISO date → factor. */
        season: (isoDate: string) => number;
    };
    counter: {
        /** Product orders a day on average. */
        perDay: number;
        /** Of those, sold to a client on the books (else a walk-in). */
        clientShare: number;
    };
    categories: readonly { key: string; name: string }[];
    options: readonly {
        key: string;
        name: string;
        values: readonly string[];
    }[];
    products: readonly DsProduct[];
    postCategories: Record<DsPost["category"], string>;
    posts: readonly DsPost[];
    enquiries: readonly DsEnquiry[];
    site: {
        createdDaysAgo: number;
        footer: string;
        pages: readonly DsSitePage[];
    };
    analytics: {
        /** Views on an ordinary weekday at the start of the 90 days. */
        base: number;
        /** Growth over the 90 days, e.g. 0.3 = +30%. */
        growth: number;
        weekend: number;
        paths: readonly { path: string; weight: number }[];
    };
}
