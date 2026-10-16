/**
 * Shapes shared by the coaching centre and the coworking space (Shiksha
 * Academy, Desk 42): their photographs, the pictures the seed draws itself,
 * and the posts their sites carry.
 *
 * Photographs are free-licence Unsplash images, hot-linked by address and
 * credited to their photographer, as the boutique's are
 * (`boutique-catalog.ts`); `scripts/check-demo-images.mjs` proves each loads.
 *
 * Drawn pictures — book covers, the uniform, timetables, a results card, a
 * floor plan — are PNGs rendered from SVG by
 * `scripts/demo-assets/render-demo-assets.mjs` into
 * `apps/app.saroh.in/public/demo/<business>/`. Both the merchant workspace
 * (`mediaSrc` takes only http and https) and the merchant site draw them with
 * a plain `<img>`, so they are served by the local app at
 * https://app.saroh.localhost — a local showcase only, like the rest of it.
 */

export interface DemoImage {
    url: string;
    alt: string;
    width: number;
    height: number;
    /** Unsplash photographer; null for a picture the seed drew. */
    creditName: string | null;
    creditUrl: string | null;
}

/** An Unsplash photo at the width the boutique hot-links. */
export const unsplash = (photo: string) =>
    `https://images.unsplash.com/${photo}?w=1600&q=80&auto=format&fit=crop`;

/** Where the local app serves the pictures the seed draws. */
export const DEMO_ASSET_BASE = "https://app.saroh.localhost/demo";

/** One drawn picture, e.g. `demoAsset("shiksha-academy", "results-2026.png")`. */
export const demoAsset = (business: string, file: string) =>
    `${DEMO_ASSET_BASE}/${business}/${file}`;

export type DemoPostCategory = "help" | "news" | "articles";

export const DEMO_POST_CATEGORIES: readonly {
    key: DemoPostCategory;
    name: string;
}[] = [
    { key: "help", name: "Help" },
    { key: "news", name: "News" },
    { key: "articles", name: "Articles" },
];

export interface DemoPost {
    slug: string;
    title: string;
    category: DemoPostCategory;
    /** One or two sentences, under 200 characters. */
    excerpt: string;
    /** Published this many days before today (1 to 180). */
    daysAgo: number;
    /** Who wrote it: a team member's full name. */
    author: string;
    /** The card's photo. */
    cover: DemoImage;
    /**
     * HTML the site's sanitiser keeps: p, h2, h3, ul, ol, li, strong, em, a,
     * blockquote, table, figure, img (src alt width height), figcaption.
     * At least one <figure><img …><figcaption>…</figcaption></figure>.
     */
    body: string;
    featured?: boolean;
}

/** An inline picture for a post body. */
export const figure = (img: DemoImage, caption: string) =>
    `<figure><img src="${img.url}" alt="${img.alt.replace(/"/g, "&quot;")}" width="${img.width}" height="${img.height}" /><figcaption>${caption}</figcaption></figure>`;
