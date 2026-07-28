import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
    src: "../../../packages/ui/fonts/InterVariable-latin.woff2",
    display: "swap",
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
            <body className={inter.className}>{children}</body>
        </html>
    );
}
