import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./site.css";

import { home } from "@/content/home";
import { shownLegal } from "@/content/resources";
import { pageTitle, SITE_NAME, SITE_URL } from "@/lib/seo";

import { resourcesContext } from "@/lib/resources-context";
import { siteTagConfig } from "@/lib/site-tag-config";

import { ReferralKeeper } from "./referral-keeper";
import { SiteTags } from "./site-tags";

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
const FALLBACK_TITLE = pageTitle(home.seoTitle);

export const metadata: Metadata = {
    // The site is served at www (saroh.in redirects there), so every
    // canonical and share link names www: one host for search engines.
    metadataBase: new URL(SITE_URL),
    title: FALLBACK_TITLE,
    description: home.seoDescription,
    openGraph: {
        type: "website",
        siteName: SITE_NAME,
        locale: "en_IN",
        title: FALLBACK_TITLE,
        description: home.seoDescription,
    },
    twitter: {
        card: "summary_large_image",
        title: FALLBACK_TITLE,
        description: home.seoDescription,
    },
};

/**
 * The site is static: every page is built at deploy time and served as a
 * file, with no regeneration at request time (Cloudflare Workers can neither
 * read `content/` nor compile MDX while serving). So a page dated for a day
 * (Help, the QR code maker, the launch entry: `publishOn`) appears with the
 * first deploy made on or after that day, and not before: nothing rebuilds
 * the site on a schedule (owner, 9 Oct 2026), and the owner starts each
 * deploy. Published pricing or a launch offer arrives with the build a
 * publish starts (KTD-10). The day early access opens is in
 * `docs/architecture/runbooks/LAUNCH_DAY_17_OCT.md`.
 *
 * `lang="en-IN"`: Indian English, as the share tags already say (`en_IN`).
 */

/**
 * The shell every page shares: fonts, the tags and the recorder behind the
 * cookie notice (`site-tags.tsx`), the referral code a visitor arrived with
 * (`referral-keeper.tsx`) and the light-only scheme. Pages bring their own chrome
 * through route groups: `(v2)` the Marketing Site V2 pages, `(standalone)`
 * the waitlist and the sign-up hand-off, `(preview)` the pricing draft.
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
        <html lang="en-IN" style={{ colorScheme: "light" }}>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontWordmark.variable} font-sans antialiased`}
            >
                <SiteTags
                    config={siteTagConfig()}
                    privacyHref={privacy?.href}
                />
                <ReferralKeeper />
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
