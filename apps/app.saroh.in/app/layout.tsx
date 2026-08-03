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
        <html lang="en">
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
