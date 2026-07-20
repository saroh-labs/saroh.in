import { AuthStatus } from "@saroh/auth/auth-status";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
                <header className="flex items-center justify-end border-b px-6 py-3">
                    <AuthStatus />
                </header>
                {children}
            </body>
        </html>
    );
}
