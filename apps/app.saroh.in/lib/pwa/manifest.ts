import type { MetadataRoute } from "next";

/**
 * Saroh on a phone's home screen (10 Oct 2026): the web app manifest.
 *
 * Installable, and nothing more: no service worker, no push and no offline
 * cache. Opened from the home screen it is the same app in its own window
 * (`standalone`), starting on Home.
 *
 * The colours are the product's own surfaces. A manifest can't read a CSS
 * variable, so they are written out here and `manifest.test.ts` checks them
 * against `--background` in `@saroh/ui/globals.css`, light and dark.
 */

/** `--background`, light: Paper. */
export const PAPER = "#F5F2EC";
/** `--background`, dark. */
export const NIGHT = "#141412";

export const APP_MANIFEST: MetadataRoute.Manifest = {
    name: "Saroh",
    short_name: "Saroh",
    description:
        "Run your business from one place: sell, take bookings, follow up on enquiries, and keep your website in step.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PAPER,
    theme_color: PAPER,
    // The icons the app already ships: the tab's symbol (any size), the
    // home-screen tile, and the brand's 512 tile with a 192 cut from it.
    icons: [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
};
