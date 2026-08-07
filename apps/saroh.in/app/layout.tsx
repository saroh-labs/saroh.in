import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";

// Self-hosted (latin subset, variable) so the build never fetches fonts from an
// external network. Geist carries UI/body; Bricolage Grotesque is the display
// face for headings and the wordmark.
const fontSans = localFont({
    src: "../../../packages/ui/fonts/Geist-latin.woff2",
    weight: "100 900",
    style: "normal",
    display: "swap",
    variable: "--font-sans",
});

const fontDisplay = localFont({
    src: "../../../packages/ui/fonts/BricolageGrotesque-latin.woff2",
    weight: "200 800",
    style: "normal",
    display: "swap",
    variable: "--font-display",
});

// The previous copy ("Create blogs, portfolios or storefronts") described the
// product two rewrites ago — it is a modular business platform now, and the
// title is what a search result shows.
export const metadata: Metadata = {
    metadataBase: new URL("https://saroh.in"),
    title: "Saroh — run your whole business from one place",
    description:
        "Website, commerce, appointments and CRM in one system. Switch on only the modules your business needs and add the rest as you grow.",
    openGraph: {
        type: "website",
        siteName: "Saroh",
        title: "Saroh — run your whole business from one place",
        description:
            "Website, commerce, appointments and CRM in one system. Switch on only the modules your business needs.",
    },
    twitter: {
        card: "summary_large_image",
        title: "Saroh — run your whole business from one place",
        description:
            "Website, commerce, appointments and CRM in one system. Switch on only the modules your business needs.",
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
                className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}
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
                  THESIS: A modular business system shown as a registry, not a
                  feature list. Refuses the category hero — no floating angled
                  screenshot, no gradient confetti, no logo cloud.
                  OWN-WORLD: Shared @saroh/ui mono tokens. Pure black / pure
                  white ground, 1px hairlines doing all separation, one blue
                  spent ~3 times, Geist + Bricolage, 6px controls / 12px cards.
                  Identical system to the product itself.
                  STORY: The visitor sees eight capabilities with real
                  dependencies, sees the product actually running, and starts
                  free — or joins the waitlist if not ready.
                  FIRST VIEWPORT: Left-aligned tag, headline, lede, two
                  buttons; the live Home screenshot seated in a bordered frame
                  directly below, theme-matched to the site.
                  FORM: "D · Precise" — Linear/Vercel register, user-selected
                  after re-rolls; concept-seed.mjs was non-functional in this
                  install (missing catalog), substituted CSPRNG, disclosed.
                  FINISH: unreviewed and undocumented is unfinished; this build
                  ends with the finish review, the verdict, and DESIGN.md.
                */}
                <Toaster />
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
                    <SiteNav />
                    <main>{children}</main>
                    <SiteFooter />
                </ThemeProvider>
            </body>
        </html>
    );
}
