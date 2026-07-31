import { AuthStatus } from "@saroh/auth/auth-status";
import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
                className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}
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
