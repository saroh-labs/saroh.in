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

export const metadata: Metadata = {
    title: "Create blogs, portfolios or storefronts | saroh.in",
    description:
        "Create your own blog, portfolio or storefront with ease. Easily manage your online presence with saroh.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
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
