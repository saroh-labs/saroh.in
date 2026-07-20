import { AuthStatus } from "@saroh/auth/auth-status";
import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
    src: "../../../packages/ui/fonts/InterVariable-latin.woff2",
    display: "swap",
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
            <body className={inter.className}>
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
