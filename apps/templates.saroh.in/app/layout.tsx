import { AuthStatus } from "@saroh/auth/auth-status";
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
                    {/* Inline copy of the canonical @saroh/ui <Wordmark>
                        (this app does not depend on @saroh/ui). Keep in sync
                        with packages/ui wordmark. */}
                    <a
                        href="https://saroh.in"
                        aria-label="Saroh"
                        style={{
                            display: "inline-flex",
                            alignItems: "baseline",
                            gap: "0.4ch",
                            fontWeight: 700,
                            fontSize: "1.125rem",
                            letterSpacing: "-0.02em",
                        }}
                    >
                        <span
                            style={{
                                backgroundImage:
                                    "linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)",
                                WebkitBackgroundClip: "text",
                                backgroundClip: "text",
                                color: "transparent",
                            }}
                        >
                            Saroh
                        </span>
                        <span style={{ fontWeight: 500, color: "#71717a" }}>
                            Templates
                        </span>
                    </a>
                    <AuthStatus />
                </header>
                {children}
            </body>
        </html>
    );
}
