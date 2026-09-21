import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import "@saroh/ui/globals.css";
import { ThemeProvider } from "@saroh/ui/theme-provider";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { Toaster } from "sonner";
import "./site.css";

// The brand's product faces, self-hosted (latin subset, variable) so the
// build never fetches fonts from a network: Geist for all UI, body copy,
// labels and eyebrows; Space Grotesk for display through H3, money and large
// figures (never body copy); JetBrains Mono only where a value is measured —
// SKUs, order references, timestamps, routes. The wordmark's own face ships
// outlined inside <Wordmark>, so no app loads it.
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
});

// From "Saroh Marketing Site": what the product is, in the words a search
// result shows.
const DESCRIPTION =
    "Saroh runs the selling, bookings, website and contacts for one business in one place. Switch on what you do; the rest never appears.";

export const metadata: Metadata = {
    metadataBase: new URL("https://saroh.in"),
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

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        // next-themes writes `class` and `color-scheme` onto <html> before
        // React hydrates, which the server render cannot know about — without
        // this the page logs a hydration mismatch on every load.
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} bg-[hsl(var(--marketing-canvas))] font-sans`}
            >
                <Script
                    async
                    src="https://www.googletagmanager.com/gtag/js?id=G-L19ZLH2N5K"
                ></Script>
                <Script id="google-analytics">
                    {` window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-L19ZLH2N5K');`}
                </Script>
                {/*
                 * Two toasters, swapped by CSS, is how app.saroh.in does it and
                 * this site copies it so a toast is the same object in both
                 * places. Sonner picks its palette from a `theme` prop, which
                 * would mean calling next-themes' `useTheme` and re-rendering
                 * after hydration; letting the `dark` class on <html> hide one
                 * of the two instead means the correct toaster is already the
                 * visible one on first paint.
                 */}
                <Toaster className="dark:hidden" />
                <Toaster theme="dark" className="hidden dark:block" />
                {/*
                 * Light AND dark, following the system by default.
                 * `forcedTheme="dark"` was removed deliberately: PRODUCT.md
                 * names "shop floor / warehouse, bright ambient light" as one of
                 * four primary scenes, and a dark-only marketing site
                 * misrepresents a product whose workspace serves that scene.
                 */}
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                    /*
                     * Versioned key. This site previously shipped
                     * `forcedTheme="dark"`, and next-themes persisted "dark"
                     * for every visitor who ever loaded it. A stored value
                     * beats `defaultTheme`, so without this bump those
                     * visitors would be pinned to dark forever and would never
                     * see the light variant that now exists — the site would
                     * look broken-by-omission to exactly the returning
                     * audience it most wants to impress. Verified live: a
                     * profile with `theme: "dark"` rendered dark under a
                     * light system preference.
                     */
                    storageKey="saroh-site-theme"
                >
                    <a
                        href="#main"
                        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-[90] focus:rounded-lg focus:bg-foreground focus:px-[13px] focus:py-[9px] focus:text-[13px] focus:text-background"
                    >
                        Skip to content
                    </a>
                    <SiteNav />
                    <main id="main">{children}</main>
                    <SiteFooter />
                </ThemeProvider>
            </body>
        </html>
    );
}
