import "@saroh/ui/globals.css";
import { ThemeProvider } from "@saroh/ui/theme-provider";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";

const fontSans = localFont({
    src: "../../../packages/ui/fonts/Geist-latin.woff2",
    display: "swap",
    variable: "--font-sans",
});

const fontDisplay = localFont({
    src: "../../../packages/ui/fonts/BricolageGrotesque-latin.woff2",
    display: "swap",
    variable: "--font-display",
});

export const metadata: Metadata = {
    title: {
        default: "Saroh",
        template: "%s · Saroh",
    },
    description:
        "Manage your storefronts, sites, leads, bookings and more with Saroh.",
};

/**
 * Document-level only. The app chrome lives in `(shell)/layout.tsx` so that
 * first-run routes under `/onboarding` can render without a sidebar full of
 * capabilities the merchant has not chosen yet — asking "what does your
 * business need to do?" beside a nav that already lists the answers is a
 * contradiction. Route groups keep every URL unchanged.
 */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        // `suppressHydrationWarning` is required by next-themes, not optional
        // politeness: its blocking script stamps the resolved theme class onto
        // <html> before React hydrates, so a visitor whose OS prefers dark
        // always mismatches the server's `defaultTheme`. The other apps already
        // had it; this one did not. It suppresses the warning on this element
        // only, not on its subtree.
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}
            >
                <Providers>
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="light"
                        enableSystem
                        disableTransitionOnChange
                    >
                        {children}
                    </ThemeProvider>
                </Providers>
            </body>
        </html>
    );
}
