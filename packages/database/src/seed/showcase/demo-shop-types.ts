/**
 * The shape of a per-vertical demo shop's content (Ammi's Achaar, Pagdandi
 * Books): its catalogue, its reviews and its site's posts. Data files fill
 * these; `demo-shop.ts` writes them.
 *
 * Money is rupees as a Decimal(10,2) string ("450.00"), never a float.
 */

/** A photo: a vetted Unsplash address, or a generated `data:image/svg+xml` one. */
export interface DemoPhoto {
    url: string;
    alt: string;
    width: number;
    height: number;
    /** Null for a generated image (no photographer). */
    creditName: string | null;
    creditUrl: string | null;
}

export interface DemoVariant {
    /** Also the option value it is chosen by ("500 g · mustard oil"). */
    title: string;
    sku: string;
    price: string;
    mrp: string | null;
    /** On hand when the product counts stock; ignored when it does not. */
    stock: number;
    /** Index into the product's images; null shows the cover. */
    image: number | null;
}

export interface DemoReview {
    rating: 1 | 2 | 3 | 4 | 5;
    body: string;
    /** "Farah S." — first name and an initial. */
    displayName: string;
    /** The variant bought, by title; null on a product without variants. */
    variantTitle: string | null;
    /** The owner's reply, in their voice, or null. */
    reply: string | null;
}

export interface DemoProduct {
    slug: string;
    name: string;
    /** A key of the shop's categories. */
    category: string;
    /** The shop option its variants are chosen by (a key of its options), or null. */
    option: string | null;
    /** The product's own price: the cheapest variant's when it has variants. */
    price: string;
    mrp: string | null;
    status: "PUBLISHED" | "DRAFT";
    /** Plain text; paragraphs separated by a blank line. */
    description: string;
    keyPoints: string[];
    /** Ingredients, paper, binding — shown as "Materials". */
    materials: string | null;
    /** How to use, store or care for it. */
    howToUse: string | null;
    /** Made here, or by someone else (a publisher, a press, a mill). */
    maker: { name: string; madeIn: string } | null;
    /** Own returns words, or null for the shop's. */
    returnsText: string | null;
    gstRate: string;
    hsnCode: string;
    /**
     * Counts stock: dry goods and books on the shelf. False for what is made
     * after it is ordered, and for a pre-order.
     */
    tracked: boolean;
    /** On hand when tracked and it has no variants. */
    stock: number;
    lowStockAlert: number;
    /** 1–5 photos; the first is the cover. */
    images: DemoPhoto[];
    variants: DemoVariant[];
    /** How often it sells, relative to the shop's other products (1 = typical). */
    demand: number;
    /** Only in a season or for a festival: sells only near these days-ago windows. */
    seasonal?: "winter" | "festive" | null;
    reviews: DemoReview[];
}

export interface DemoOption {
    key: string;
    /** As the shop shows it: "Jar size". */
    name: string;
    values: string[];
}

export interface DemoCategory {
    key: string;
    name: string;
}

export interface DemoPost {
    slug: string;
    title: string;
    category: "help" | "news" | "articles";
    /** Days before the seed's now it was published (0–180). */
    daysAgo: number;
    /** One or two sentences, plain text. */
    excerpt: string;
    /** The cover: an image address (Unsplash or generated). */
    image: string;
    featured?: boolean;
    /**
     * The body as sanitized HTML: p, h2, h3, ul/ol/li, strong, em, a,
     * blockquote, and at least one
     * `<figure><img src="…" alt="…" width="…" height="…"><figcaption>…</figcaption></figure>`.
     */
    html: string;
}
