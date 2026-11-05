import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Analytics } from "@/components/shared/analytics";
import { Footer } from "@/components/shared/footer";
import { Header } from "@/components/shared/header";
import { RegionBar } from "@/components/shared/region-bar";
import { site } from "@/site.config";

import "@saroh/marketing/tokens.css";
import "@saroh/ui/globals.css";
import "./tech.css";

const fontSans = localFont({
    src: "./fonts/Geist-latin-400-700.woff2",
    weight: "400 700",
    display: "swap",
    variable: "--font-sans",
});

const fontDisplay = localFont({
    src: "../../../packages/ui/fonts/SpaceGrotesk-latin.woff2",
    weight: "300 700",
    display: "swap",
    variable: "--font-display",
});

const fontMono = localFont({
    src: "./fonts/JetBrainsMono-latin-400.woff2",
    weight: "400",
    display: "swap",
    variable: "--font-mono",
    preload: false,
});

const fontWordmark = localFont({
    src: "./fonts/PlusJakartaSans-latin.woff2",
    weight: "600",
    display: "swap",
    variable: "--font-wordmark",
    preload: false,
});

export const metadata: Metadata = {
    metadataBase: new URL(site.url),
    title: site.name,
    description: "Orders, bookings, invoices and your website, in one place.",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#F5F2EC",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html
            lang="en"
            className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable} ${fontWordmark.variable}`}
        >
            <body className="font-sans antialiased">
                <a
                    href="#main"
                    className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-[90] focus:rounded-lg focus:bg-foreground focus:px-[13px] focus:py-[9px] focus:text-[13px] focus:text-background"
                >
                    Skip to content
                </a>
                <div className="min-h-screen bg-background text-foreground [line-height:normal]">
                    <RegionBar />
                    <div className="mx-auto max-w-mk-page overflow-x-clip bg-background">
                        <Header />
                        <main id="main">{children}</main>
                        <Footer />
                    </div>
                </div>
                <Analytics />
            </body>
        </html>
    );
}
