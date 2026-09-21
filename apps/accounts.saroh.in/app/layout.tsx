import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./auth.css";

import { ThemeProvider } from "@saroh/ui/theme-provider";

import Providers from "./providers";

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

export const metadata: Metadata = {
    title: "Saroh Auth",
    description: "login to your saroh account.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        // `suppressHydrationWarning` because next-themes' blocking script
        // stamps the resolved theme onto <html> before React hydrates, so a
        // visitor whose OS prefers dark always mismatches what the server
        // rendered. It suppresses the warning on this element's own attributes
        // only, not on its subtree.
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} font-sans`}
            >
                {/*
                 * The suite's provider, not a media query.
                 *
                 * This app used to read `prefers-color-scheme` in a hand-rolled
                 * pre-paint script, on the reasoning that accounts has no theme
                 * toggle and needs none. It has one now — the pages are a
                 * full-bleed split that honours dark properly rather than a
                 * light card on a dark backdrop — and a toggle has to REMEMBER,
                 * which a media query cannot. `next-themes` resolves here
                 * through `@saroh/ui`, which depends on it; the old comment
                 * saying otherwise was about importing it directly.
                 */}
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <Providers>
                        {/* `fixed`, not `absolute` + `h-screen`: the account page is
                        taller than the viewport, and a 100vh backdrop left
                        everything below the fold unstyled. */}
                        <div className="sa-page" aria-hidden="true" />
                        <div className="relative z-10 min-h-screen w-full">
                            {children}
                        </div>
                    </Providers>
                </ThemeProvider>
            </body>
        </html>
    );
}
