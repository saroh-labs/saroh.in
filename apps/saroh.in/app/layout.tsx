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
import { siteRecordingOn } from "@/lib/site-recording";

import { GoogleAnalytics } from "./google-analytics";
import { SiteReplay } from "./site-replay";

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
 * The site is static: every page is built at deploy time and served as a
 * file, with no regeneration at request time (Cloudflare Workers can neither
 * read `content/` nor compile MDX while serving). A page dated today appears
 * through the nightly rebuild at 00:00 IST (plan KTD-2), and published pricing
 * or a launch offer through the build a publish starts (KTD-10).
 */

/**
 * The shell every page shares: fonts, GA and the light-only scheme. Pages
 * bring their own chrome through route groups: `(v2)` the Marketing Site V2
 * pages, `(standalone)` the waitlist, `(preview)` the pricing draft.
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
    const recording = siteRecordingOn({
        key: env.NEXT_PUBLIC_POSTHOG_KEY,
        replay: env.NEXT_PUBLIC_POSTHOG_REPLAY,
    });
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
                    recording={recording}
                />
                {/* Session replay (DEC-125): only where it is switched on,
                    and then only after the notice above is accepted. */}
                <SiteReplay on={recording} />
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
