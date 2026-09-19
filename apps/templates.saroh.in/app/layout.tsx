import { AuthStatus } from "@saroh/auth/auth-status";
import "@saroh/ui/globals.css";
import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";
import localFont from "next/font/local";

// The brand's three faces, self-hosted (latin subset, variable) so the build
// never fetches fonts from a network: Plus Jakarta Sans for UI and body, Space
// Grotesk for display through H3 (never body copy), JetBrains Mono for code,
// labels and eyebrows. The same files, loaded the same way, in every Saroh app.
const fontSans = localFont({
    src: "../../../packages/ui/fonts/PlusJakartaSans-latin.woff2",
    weight: "200 800",
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
    title: "Ecommerce templates by saroh",
    description: "Ecommerce storefront templates for Saroh sites.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} font-sans`}
            >
                <header className="flex items-center justify-between border-b px-6 py-3">
                    <a href="https://saroh.in" aria-label="Saroh">
                        <Wordmark suffix="Templates" />
                    </a>
                    <AuthStatus />
                </header>
                {children}
            </body>
        </html>
    );
}
