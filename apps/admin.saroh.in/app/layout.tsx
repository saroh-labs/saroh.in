import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";

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
    title: {
        default: "Saroh control",
        template: "%s · Saroh control",
    },
    description: "Internal operations and governance control plane for Saroh.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} font-sans`}
            >
                {children}
            </body>
        </html>
    );
}
