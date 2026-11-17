import localFont from "next/font/local";

/*
 * A merchant's own fonts for the site and post drawings (DESIGN.md: merchant
 * drawings wear the merchant's look, never Saroh's), self-hosted from
 * `packages/site-blocks/fonts/`. A page that draws a site puts
 * `SITE_FONTS` on an ancestor of the drawing.
 */
const siteSerif = localFont({
    src: "../../../../../packages/site-blocks/fonts/fraunces/Fraunces-wght-latin.woff2",
    weight: "400 700",
    variable: "--font-site-serif",
});
const siteSans = localFont({
    src: "../../../../../packages/site-blocks/fonts/figtree/Figtree-400-700-latin.woff2",
    weight: "400 700",
    variable: "--font-site-sans",
});

export const SITE_FONTS = `${siteSerif.variable} ${siteSans.variable}`;
