import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./site.css";

import { home } from "@/content/home";
import { shownLegal } from "@/content/resources";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

import { env } from "@/env";
import { gaMeasurementId } from "@/lib/ga";
import { resourcesContext } from "@/lib/resources-context";

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

// Every page sets its own title, description, canonical and share tags
// (`lib/seo.ts`). These are the fallbacks for a page that sets none, such as
// the 404: Home's words, and no canonical, so a missing page never claims
// another's address.
export const metadata: Metadata = {
    // The site is served at www (saroh.in redirects there), so every
    // canonical and share link names www: one host for search engines.
    metadataBase: new URL(SITE_URL),
    title: home.metaTitle,
    description: home.sub,
    openGraph: {
        type: "website",
        siteName: SITE_NAME,
        locale: "en_IN",
        title: home.metaTitle,
        description: home.sub,
    },
    twitter: {
        card: "summary_large_image",
        title: home.metaTitle,
        description: home.sub,
    },
};

/**
 * Every page is rendered again at most this often (ISR, seconds), so a
 * Resources page, changelog entry or legal page dated today appears within
 * five minutes of midnight in India, with no deploy (plan KTD-2,
 * `PUBLISH_REVALIDATE_SECONDS`). A literal: Next reads it without running
 * the file.
 */
export const revalidate = 300;

/**
 * The shell every page shares: fonts, GA and the light-only scheme. Pages
 * bring their own chrome through route groups: `(v2)` the Marketing Site V2
 * pages, `(standalone)` the waitlist.
 *
 * Light only (owner, 2026-10-03): no theme provider, no dark class, no
 * toggle; `color-scheme: light` is set here and in site.css.
 */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const privacy = shownLegal(resourcesContext()).find(
        (p) => p.id === "privacy",
    );
    return (
        <html lang="en" style={{ colorScheme: "light" }}>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontWordmark.variable} font-sans antialiased`}
            >
                <GoogleAnalytics
                    id={gaMeasurementId({
                        id: env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
                        vercelEnv: env.VERCEL_ENV,
                    })}
                    privacyHref={privacy?.href}
                />
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
