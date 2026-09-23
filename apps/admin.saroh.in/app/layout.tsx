import "@saroh/ui/globals.css";
import { ThemeProvider } from "@saroh/ui/theme-provider";
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
        default: "Saroh console",
        template: "%s · Saroh console",
    },
    description: "The operator console for a Saroh instance.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        // `suppressHydrationWarning`: next-themes writes the class on <html>
        // before React hydrates, which is the point of it.
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} font-sans`}
            >
                {/* Dark by default and not by system preference: the console
                    must never be mistaken for a merchant's workspace, and the
                    workspace follows the system (plan D7). Same tokens, same
                    Saffron — dark is the whole of the difference, so no
                    accent is overridden. Light stays defined for a toggle
                    later. */}
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem={false}
                    disableTransitionOnChange
                >
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
