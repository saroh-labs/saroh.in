/**
 * Shapes shared by the two service-studio showcases (Frame & Vow, Pixel &
 * Chai): their photos and their writing.
 */

/** A free-licence Unsplash photograph, hot-linked and credited, or a generated image (`data:`). */
export interface StudioImage {
    /** `https://images.unsplash.com/photo-…?w=1600&q=80&auto=format&fit=crop`, or a `data:image/svg+xml` URI. */
    url: string;
    alt: string;
    width: number;
    height: number;
    /** The photographer, as Unsplash names them; null for a generated image. */
    creditName: string | null;
    creditUrl: string | null;
}

/** The three shelves a studio's writing sits on. */
export type StudioPostCategory = "help" | "news" | "articles";

export const STUDIO_POST_CATEGORIES: Readonly<
    Record<StudioPostCategory, string>
> = {
    help: "Help",
    news: "News",
    articles: "Articles",
};

/**
 * One published post. `body` is HTML in the tags the publish sanitizer keeps
 * (`p`, `h2`, `h3`, `ul`, `ol`, `li`, `strong`, `em`, `blockquote`, `a`,
 * `figure`, `img`, `figcaption`), with at least one `<figure><img …>` inside.
 */
export interface StudioPost {
    slug: string;
    title: string;
    excerpt: string;
    category: StudioPostCategory;
    /** Days before the seed's now it was published (0–180). */
    daysAgo: number;
    /** The cover the post index and share card show. */
    cover: StudioImage;
    body: string;
}
