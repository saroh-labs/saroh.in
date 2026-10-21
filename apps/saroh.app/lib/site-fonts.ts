import {
    Archivo,
    Archivo_Narrow,
    Bricolage_Grotesque,
    Cormorant_Garamond,
    Figtree,
    Fraunces,
    Geist,
    Hanken_Grotesk,
    IBM_Plex_Mono,
    IBM_Plex_Sans,
    Inter,
    Inter_Tight,
    JetBrains_Mono,
    Jost,
    Newsreader,
    Source_Serif_4,
} from "next/font/google";

import type { LoadedSiteFaces } from "@saroh/site-blocks";

/**
 * The faces a merchant's site can be set in (industry templates, KTD-2):
 * every family in `FONT_PAIRS`, self-hosted by `next/font` at build time, so
 * a visitor's browser never calls Google.
 *
 * The ONLY `next/font` import in this app, and gate G7 holds it to this file.
 * These are merchants' choices, never Saroh's brand: no site is set in any of
 * them until its style names a pair, and the default is the system stack (H1).
 *
 * Why every loader is called here, and still a site downloads only its own:
 * `next/font` needs each call with literal options at module scope, so the
 * list cannot be driven from `FONT_PAIRS`. `preload: false` on every face
 * keeps the page from preloading files it will not use; the `@font-face`
 * rules are only declarations, and a browser fetches a face's file only when
 * something on the page is set in it, which is the one pair `SiteTheme`
 * writes into `--site-font-*`.
 *
 * The first pairs' variable fonts load their full weight range, unchanged so
 * no existing site's files change; IBM Plex Mono is not variable and loads
 * the weights its pair lists. The looks' faces name their weights (below).
 */
const fraunces = Fraunces({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});
const interTight = Inter_Tight({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});
const newsreader = Newsreader({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});
const plexSans = IBM_Plex_Sans({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});
const plexMono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500"],
    display: "swap",
    preload: false,
});
const archivoNarrow = Archivo_Narrow({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});
const archivo = Archivo({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});
const sourceSerif = Source_Serif_4({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });
const geist = Geist({ subsets: ["latin"], display: "swap", preload: false });
// A mono role's face (the Developer pair's), for machine facts only.
const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    display: "swap",
    preload: false,
});

/*
 * The looks' faces (DEC-172, U3): two families per look, each with only the
 * weights, styles and subsets its `FONT_PAIRS` entry names (a test holds the
 * two to the same values), so no variable font loads its full range. Filed
 * under the face's `load` key, not its family: Folio's Newsreader is its own
 * trimmed copy beside the full one the `newsreader` pair has always had.
 *
 * `preload: false` like every face here, and it has to be: `next/font`
 * preloads per layout FILE, not per request, so a preloaded look face would
 * be preloaded on every site, Classic ones included. Swap and the fallback
 * metrics `next/font` computes keep the text from moving when it arrives.
 *
 * Next declares a style for every weight in a call, so Quiet's italic is
 * declared at 300 and 500 too; a browser fetches a declared face only for
 * text set in it, and the look sets italic at 400 only.
 */
const folioHeading = Newsreader({
    subsets: ["latin", "latin-ext"],
    weight: ["300", "400"],
    style: ["normal", "italic"],
    display: "swap",
    preload: false,
});
const folioBody = Hanken_Grotesk({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    display: "swap",
    preload: false,
});
const quietHeading = Cormorant_Garamond({
    subsets: ["latin", "latin-ext"],
    weight: ["300", "400", "500"],
    style: ["normal", "italic"],
    display: "swap",
    preload: false,
});
const quietBody = Jost({
    subsets: ["latin"],
    weight: ["400", "500"],
    display: "swap",
    preload: false,
});
// One width (the default, 100): no `wdth` axis is asked for.
const liveHeading = Bricolage_Grotesque({
    subsets: ["latin", "latin-ext"],
    weight: ["700", "800"],
    display: "swap",
    preload: false,
});
const liveBody = Figtree({
    subsets: ["latin", "latin-ext"],
    weight: ["400", "500", "600", "700"],
    display: "swap",
    preload: false,
});

/**
 * Each face's registered CSS name, for `SiteTheme`'s `faces`: by its Google
 * Fonts name, or by its `load` key for a look's face. Keyed by the names
 * `FONT_PAIRS` uses; a test holds every face in the list to an entry here.
 */
export const SITE_FACES: LoadedSiteFaces = {
    Fraunces: fraunces.style.fontFamily,
    "Inter Tight": interTight.style.fontFamily,
    Newsreader: newsreader.style.fontFamily,
    "IBM Plex Sans": plexSans.style.fontFamily,
    "IBM Plex Mono": plexMono.style.fontFamily,
    "Archivo Narrow": archivoNarrow.style.fontFamily,
    Archivo: archivo.style.fontFamily,
    "Source Serif 4": sourceSerif.style.fontFamily,
    Inter: inter.style.fontFamily,
    Geist: geist.style.fontFamily,
    "JetBrains Mono": jetbrainsMono.style.fontFamily,
    // The looks' own faces, by their `load` key.
    "folio:heading": folioHeading.style.fontFamily,
    "folio:body": folioBody.style.fontFamily,
    "quiet:heading": quietHeading.style.fontFamily,
    "quiet:body": quietBody.style.fontFamily,
    "live:heading": liveHeading.style.fontFamily,
    "live:body": liveBody.style.fontFamily,
};
