import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./site.css";

import { GoogleAnalytics } from "./google-analytics";

// The brand's product faces, self-hosted (latin subset, variable) so the
// build never fetches fonts from a network: Geist for all UI, body copy,
// labels and eyebrows; Space Grotesk for display through H3, money and large
// figures (never body copy); JetBrains Mono only where a value is measured
// (the waitlist's opening date).
const fontSans = localFont({
    src: "../../../packages/ui/fonts/Geist-latin.woff2",
    weight: "100 900",
    style: "normal",
    display: "swap",
    variable: "--font-sans",
});

const fontDisplay = localFont({
    src: "../../../packages/ui/fonts/SpaceGrotesk-latin.woff2",
    weight: "300 700",
    style: "normal",
    display: "swap",
    variable: "--font-display",
});

const fontMono = localFont({
    src: "../../../packages/ui/fonts/JetBrainsMono-latin.woff2",
    weight: "100 800",
    style: "normal",
    display: "swap",
    variable: "--font-mono",
    preload: false,
});

// Plus Jakarta Sans 600, the wordmark's face (plan U18). The logo itself is
// the outlined <Wordmark>, never re-typed; this face sets the one piece of
// live text the Marketing Site V2 design gives it, the phone menu's "Menu"
// title. Not preloaded: a browser only fetches it when that sheet opens.
const fontWordmark = localFont({
    src: "./fonts/PlusJakartaSans-latin.woff2",
    weight: "600",
    style: "normal",
    display: "swap",
    variable: "--font-wordmark",
    preload: false,
});

// From "Saroh Marketing Site": what the product is, in the words a search
// result shows.
const DESCRIPTION =
    "Saroh runs the selling, bookings, website and contacts for one business in one place. Switch on what you do; the rest never appears.";

export const metadata: Metadata = {
    // The site is served at www (saroh.in redirects there), so every
    // canonical and share link names www: one host for search engines.
    metadataBase: new URL("https://www.saroh.in"),
    title: "Saroh — one business, not four logins",
    description: DESCRIPTION,
    openGraph: {
        type: "website",
        siteName: "Saroh",
        title: "Saroh — one business, not four logins",
        description: DESCRIPTION,
    },
    twitter: {
        card: "summary_large_image",
        title: "Saroh — one business, not four logins",
        description: DESCRIPTION,
    },
};

/**
 * The shell every page shares: fonts, GA and the light-only scheme. Each
 * generation of the site brings its own chrome through a route group:
 * `(v1)` the pages U26 removes, `(v2)` the Marketing Site V2 pages.
 *
 * Light only (owner, 2026-10-03): no theme provider, no dark class, no
 * toggle; `color-scheme: light` is set here and in site.css.
 */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" style={{ colorScheme: "light" }}>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontWordmark.variable} font-sans antialiased`}
            >
                <GoogleAnalytics />
                <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-[90] focus:rounded-lg focus:bg-foreground focus:px-[13px] focus:py-[9px] focus:text-[13px] focus:text-background"
                >
                    Skip to content
                </a>
                {children}
            </body>
        </html>
    );
}
