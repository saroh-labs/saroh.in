import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Analytics } from "@/components/shared/analytics";
import { Footer } from "@/components/shared/footer";
import { Header } from "@/components/shared/header";
import { RegionBar } from "@/components/shared/region-bar";
import { site } from "@/site.config";

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

export const metadata: Metadata = {
    metadataBase: new URL(site.url),
    title: site.name,
    description: "Quotes, invoices and one page for every client.",
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
            className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}
        >
            <body className="min-h-screen bg-paper text-ink antialiased">
                <RegionBar />
                <Header />
                <main id="main">{children}</main>
                <Footer />
                <Analytics />
            </body>
        </html>
    );
}
