import localFont from "next/font/local";

import type { LoadedSiteFaces } from "@saroh/site-blocks";

/**
 * The faces a merchant's site can be set in (industry templates, KTD-2):
 * every family in `FONT_PAIRS`, self-hosted from `packages/site-blocks/fonts`
 * (OFL files from google/fonts, cut to Google's latin and latin-ext ranges),
 * so neither a build nor a visitor's browser ever calls Google.
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
 * Each face is two calls, latin and latin-ext, each with Google's
 * `unicode-range`, as `next/font/google` served them: a page fetches the
 * latin-ext file only when it has a character from it (₹ among them).
 * `next/font/local` can't give one call's files different ranges, and the
 * values must be literals, hence the repetition. Only the latin call computes
 * fallback metrics; `withExt` builds the face's list from the two. next/font
 * names a family after the variable it is assigned to, so the variables carry
 * the family's name (`jost`, `jostExt`) and a page's fonts say what they are.
 *
 * The first pairs' variable fonts load their full weight range, unchanged so
 * no existing site's files change; IBM Plex Mono is not variable and loads
 * the weights its pair lists. The looks' faces name their weights (below).
 */
const fraunces = localFont({
    src: "../../../packages/site-blocks/fonts/fraunces/Fraunces-wght-latin.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: "Times New Roman",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const frauncesExt = localFont({
    src: "../../../packages/site-blocks/fonts/fraunces/Fraunces-wght-latin-ext.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const interTight = localFont({
    src: "../../../packages/site-blocks/fonts/intertight/InterTight-wght-latin.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const interTightExt = localFont({
    src: "../../../packages/site-blocks/fonts/intertight/InterTight-wght-latin-ext.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const newsreader = localFont({
    src: "../../../packages/site-blocks/fonts/newsreader/Newsreader-wght-latin.woff2",
    weight: "200 800",
    display: "swap",
    preload: false,
    adjustFontFallback: "Times New Roman",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const newsreaderExt = localFont({
    src: "../../../packages/site-blocks/fonts/newsreader/Newsreader-wght-latin-ext.woff2",
    weight: "200 800",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const plexSans = localFont({
    src: "../../../packages/site-blocks/fonts/ibmplexsans/IBMPlexSans-wght-latin.woff2",
    weight: "100 700",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const plexSansExt = localFont({
    src: "../../../packages/site-blocks/fonts/ibmplexsans/IBMPlexSans-wght-latin-ext.woff2",
    weight: "100 700",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const plexMono = localFont({
    src: [
        {
            path: "../../../packages/site-blocks/fonts/ibmplexmono/IBMPlexMono-400-latin.woff2",
            weight: "400",
        },
        {
            path: "../../../packages/site-blocks/fonts/ibmplexmono/IBMPlexMono-500-latin.woff2",
            weight: "500",
        },
    ],
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const plexMonoExt = localFont({
    src: [
        {
            path: "../../../packages/site-blocks/fonts/ibmplexmono/IBMPlexMono-400-latin-ext.woff2",
            weight: "400",
        },
        {
            path: "../../../packages/site-blocks/fonts/ibmplexmono/IBMPlexMono-500-latin-ext.woff2",
            weight: "500",
        },
    ],
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const archivoNarrow = localFont({
    src: "../../../packages/site-blocks/fonts/archivonarrow/ArchivoNarrow-wght-latin.woff2",
    weight: "400 700",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const archivoNarrowExt = localFont({
    src: "../../../packages/site-blocks/fonts/archivonarrow/ArchivoNarrow-wght-latin-ext.woff2",
    weight: "400 700",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const archivo = localFont({
    src: "../../../packages/site-blocks/fonts/archivo/Archivo-wght-latin.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const archivoExt = localFont({
    src: "../../../packages/site-blocks/fonts/archivo/Archivo-wght-latin-ext.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const sourceSerif = localFont({
    src: "../../../packages/site-blocks/fonts/sourceserif4/SourceSerif4-wght-latin.woff2",
    weight: "200 900",
    display: "swap",
    preload: false,
    adjustFontFallback: "Times New Roman",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const sourceSerifExt = localFont({
    src: "../../../packages/site-blocks/fonts/sourceserif4/SourceSerif4-wght-latin-ext.woff2",
    weight: "200 900",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const inter = localFont({
    src: "../../../packages/site-blocks/fonts/inter/Inter-wght-latin.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const interExt = localFont({
    src: "../../../packages/site-blocks/fonts/inter/Inter-wght-latin-ext.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const geist = localFont({
    src: "../../../packages/site-blocks/fonts/geist/Geist-wght-latin.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const geistExt = localFont({
    src: "../../../packages/site-blocks/fonts/geist/Geist-wght-latin-ext.woff2",
    weight: "100 900",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const jetbrainsMono = localFont({
    src: "../../../packages/site-blocks/fonts/jetbrainsmono/JetBrainsMono-wght-latin.woff2",
    weight: "100 800",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const jetbrainsMonoExt = localFont({
    src: "../../../packages/site-blocks/fonts/jetbrainsmono/JetBrainsMono-wght-latin-ext.woff2",
    weight: "100 800",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});

/*
 * The looks' faces (DEC-172, U3): two families per look, each with only the
 * weights and styles its `FONT_PAIRS` entry names (a test holds the two to
 * the same values), cut from the variable files to that weight range. Filed
 * under the face's `load` key, not its family: Folio's Newsreader is its own
 * copy, with its optical size and italic, beside the `newsreader` pair's.
 *
 * `preload: false` like every face here, and it has to be: `next/font`
 * preloads per layout FILE, not per request, so a preloaded look face would
 * be preloaded on every site, Classic ones included. Swap and the fallback
 * metrics `next/font` computes keep the text from moving when it arrives.
 *
 * Live's Bricolage keeps its width axis (board VB sets it at 80%), so its
 * faces declare the stretch range.
 */
const newsreaderFolio = localFont({
    src: [
        {
            path: "../../../packages/site-blocks/fonts/newsreader/Newsreader-opsz-wght-latin.woff2",
            weight: "200 800",
            style: "normal",
        },
        {
            path: "../../../packages/site-blocks/fonts/newsreader/Newsreader-Italic-opsz-wght-latin.woff2",
            weight: "200 800",
            style: "italic",
        },
    ],
    display: "swap",
    preload: false,
    adjustFontFallback: "Times New Roman",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const newsreaderFolioExt = localFont({
    src: [
        {
            path: "../../../packages/site-blocks/fonts/newsreader/Newsreader-opsz-wght-latin-ext.woff2",
            weight: "200 800",
            style: "normal",
        },
        {
            path: "../../../packages/site-blocks/fonts/newsreader/Newsreader-Italic-opsz-wght-latin-ext.woff2",
            weight: "200 800",
            style: "italic",
        },
    ],
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const hankenGrotesk = localFont({
    src: "../../../packages/site-blocks/fonts/hankengrotesk/HankenGrotesk-400-600-latin.woff2",
    weight: "400 600",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const hankenGroteskExt = localFont({
    src: "../../../packages/site-blocks/fonts/hankengrotesk/HankenGrotesk-400-600-latin-ext.woff2",
    weight: "400 600",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const cormorantGaramond = localFont({
    src: [
        {
            path: "../../../packages/site-blocks/fonts/cormorantgaramond/CormorantGaramond-300-500-latin.woff2",
            weight: "300 500",
            style: "normal",
        },
        {
            path: "../../../packages/site-blocks/fonts/cormorantgaramond/CormorantGaramond-Italic-300-500-latin.woff2",
            weight: "300 500",
            style: "italic",
        },
    ],
    display: "swap",
    preload: false,
    adjustFontFallback: "Times New Roman",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const cormorantGaramondExt = localFont({
    src: [
        {
            path: "../../../packages/site-blocks/fonts/cormorantgaramond/CormorantGaramond-300-500-latin-ext.woff2",
            weight: "300 500",
            style: "normal",
        },
        {
            path: "../../../packages/site-blocks/fonts/cormorantgaramond/CormorantGaramond-Italic-300-500-latin-ext.woff2",
            weight: "300 500",
            style: "italic",
        },
    ],
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const jost = localFont({
    src: "../../../packages/site-blocks/fonts/jost/Jost-400-500-latin.woff2",
    weight: "400 500",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const jostExt = localFont({
    src: "../../../packages/site-blocks/fonts/jost/Jost-400-500-latin-ext.woff2",
    weight: "400 500",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});
const bricolageGrotesque = localFont({
    src: "../../../packages/site-blocks/fonts/bricolagegrotesque/BricolageGrotesque-wdth-wght-latin.woff2",
    weight: "200 800",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
        { prop: "font-stretch", value: "75% 100%" },
    ],
});
const bricolageGrotesqueExt = localFont({
    src: "../../../packages/site-blocks/fonts/bricolagegrotesque/BricolageGrotesque-wdth-wght-latin-ext.woff2",
    weight: "200 800",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
        { prop: "font-stretch", value: "75% 100%" },
    ],
});
const figtree = localFont({
    src: "../../../packages/site-blocks/fonts/figtree/Figtree-400-700-latin.woff2",
    weight: "400 700",
    display: "swap",
    preload: false,
    adjustFontFallback: "Arial",
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
        },
    ],
});
const figtreeExt = localFont({
    src: "../../../packages/site-blocks/fonts/figtree/Figtree-400-700-latin-ext.woff2",
    weight: "400 700",
    display: "swap",
    preload: false,
    adjustFontFallback: false,
    declarations: [
        {
            prop: "unicode-range",
            value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
        },
    ],
});

/**
 * A face's family list: its latin family, its latin-ext family, then the
 * latin call's metric fallback (`'jost', 'jostExt', 'jost Fallback'`).
 */
function withExt(
    latin: { style: { fontFamily: string } },
    ext: { style: { fontFamily: string } },
): string {
    const [first, ...rest] = latin.style.fontFamily.split(", ");
    return [first, ext.style.fontFamily, ...rest].join(", ");
}

/**
 * Each face's registered CSS name, for `SiteTheme`'s `faces`: by its Google
 * Fonts name, or by its `load` key for a look's face. Keyed by the names
 * `FONT_PAIRS` uses; a test holds every face in the list to an entry here.
 */
export const SITE_FACES: LoadedSiteFaces = {
    Fraunces: withExt(fraunces, frauncesExt),
    "Inter Tight": withExt(interTight, interTightExt),
    Newsreader: withExt(newsreader, newsreaderExt),
    "IBM Plex Sans": withExt(plexSans, plexSansExt),
    "IBM Plex Mono": withExt(plexMono, plexMonoExt),
    "Archivo Narrow": withExt(archivoNarrow, archivoNarrowExt),
    Archivo: withExt(archivo, archivoExt),
    "Source Serif 4": withExt(sourceSerif, sourceSerifExt),
    Inter: withExt(inter, interExt),
    Geist: withExt(geist, geistExt),
    "JetBrains Mono": withExt(jetbrainsMono, jetbrainsMonoExt),
    // The looks' own faces, by their `load` key.
    "folio:heading": withExt(newsreaderFolio, newsreaderFolioExt),
    "folio:body": withExt(hankenGrotesk, hankenGroteskExt),
    "quiet:heading": withExt(cormorantGaramond, cormorantGaramondExt),
    "quiet:body": withExt(jost, jostExt),
    "live:heading": withExt(bricolageGrotesque, bricolageGrotesqueExt),
    "live:body": withExt(figtree, figtreeExt),
};
