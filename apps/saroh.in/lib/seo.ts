import type { Metadata } from "next";

import { home } from "@/content/home";

/**
 * The one host search engines and share cards see (plan U26): saroh.in
 * redirects to www, so every canonical and `og:url` names www.
 */
export const SITE_URL = "https://www.saroh.in";

export const SITE_NAME = "Saroh";

/** Every share card's size and type (`lib/og-card.tsx`). */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** The root card's alt (`app/opengraph-image.tsx`), which Home names itself. */
export const HOME_OG_ALT = `Saroh: ${home.headlineLabel}`;

/**
 * A page's `<title>`: what the page is, then the brand, with " · " between.
 * One pattern for every page (12 Oct 2026; some had a dash, some a colon and
 * the brand twice). The words lead because a search result cuts a long
 * title from the right, and because nobody searching for a kind of software
 * types "Saroh".
 */
export function pageTitle(phrase: string): string {
    return `${phrase} · ${SITE_NAME}`;
}

/** The longest a main page's `<title>` and description may be (`content/seo.test.ts`). */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 150;

export interface PageSeo {
    /** The `<title>`, whole, as `pageTitle` writes it. */
    title: string;
    /** The search-result line, also the share card's. */
    description: string;
    /** The page's path, e.g. `/features/orders`; the canonical and `og:url`. */
    path: string;
    /** A shorter title for share cards, when the `<title>` carries the brand. */
    socialTitle?: string;
    /**
     * Only for Home: the root `app/opengraph-image.tsx` belongs to the root
     * layout, and a page's own `openGraph` replaces the layout's, image and
     * all. Every other page has an `opengraph-image.tsx` beside it.
     */
    image?: { url: string; alt: string };
}

/**
 * Every V2 page's metadata in one shape, so no page forgets a tag (plan U26).
 *
 * Next merges `openGraph` and `twitter` shallowly: a page that sets either
 * replaces the root layout's whole object. So each page gets the full set
 * here (type, site name, locale, url, title, description; Twitter's large
 * card). The share image is NOT set here on purpose: each route's
 * `opengraph-image.tsx` supplies it, and Next only adds a file's image when
 * the page's own `openGraph` has no `images` key. Twitter takes the same
 * image from Open Graph.
 */
export function pageMetadata({
    title,
    description,
    path,
    socialTitle = title,
    image,
}: PageSeo): Metadata {
    const images = image
        ? [{ ...image, ...OG_SIZE, type: OG_CONTENT_TYPE }]
        : undefined;
    return {
        title,
        description,
        alternates: { canonical: path },
        openGraph: {
            type: "website",
            siteName: SITE_NAME,
            locale: "en_IN",
            url: path,
            title: socialTitle,
            description,
            ...(images && { images }),
        },
        twitter: {
            card: "summary_large_image",
            title: socialTitle,
            description,
        },
    };
}
