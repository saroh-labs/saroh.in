import {
    Archivo,
    Archivo_Narrow,
    Fraunces,
    Geist,
    IBM_Plex_Mono,
    IBM_Plex_Sans,
    Inter,
    Inter_Tight,
    JetBrains_Mono,
    Newsreader,
    Source_Serif_4,
} from "next/font/google";

import type { LoadedSiteFaces } from "@saroh/site-blocks";

/**
 * The faces a merchant's site can be set in (industry templates, KTD-2), for
 * the editor's preview and the Style panel, so a merchant sees the type their
 * site will have. A copy of `apps/saroh.app/lib/site-fonts.ts`: `next/font`
 * must be called with literal options in each app that serves the files, so
 * the list cannot be shared as code; a test holds both to `FONT_PAIRS`.
 *
 * `preload: false` on every face, so the editor fetches only the faces its
 * preview is set in. Imported only by the editor's layouts, which hand the
 * names to client components through `SiteFacesProvider`.
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
    "JetBrains Mono": jetbrainsMono.style.fontFamily,
};
