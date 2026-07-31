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
                <Toaster />
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem
                    disableTransitionOnChange
                    forcedTheme="dark"
                >
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
