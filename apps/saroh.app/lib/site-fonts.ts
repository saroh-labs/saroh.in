import {
    Archivo,
    Archivo_Narrow,
    Fraunces,
    Geist,
    IBM_Plex_Mono,
    IBM_Plex_Sans,
    Inter,
    Inter_Tight,
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
 * Variable fonts load their full weight range; IBM Plex Mono is not variable
 * and loads the weights its pair lists.
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

/**
 * Each family's registered CSS name, by its Google Fonts name, for
 * `SiteTheme`'s `faces`. Keyed by the names `FONT_PAIRS` uses; a test holds
 * every family in the list to an entry here.
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
};
