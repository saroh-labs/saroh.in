import BaseLayout from "@/components/layouts/base-layout";
import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";

const inter = localFont({
    src: "../../../packages/ui/fonts/InterVariable-latin.woff2",
    display: "swap",
});

export const metadata: Metadata = {
    title: "saroh/ui — Components",
    description: "UI components, charts and templates for Saroh apps.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // if (typeof window === "undefined")
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className}>
                <BaseLayout>{children}</BaseLayout>
            </body>
        </html>
    );
}
