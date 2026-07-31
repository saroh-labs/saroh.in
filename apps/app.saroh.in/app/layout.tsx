import { AppShell } from "@/components/shared/app-shell";
import { ThemeProvider } from "@saroh/ui/theme-provider";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

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
    title: {
        default: "Saroh",
        template: "%s · Saroh",
    },
    description:
        "Manage your storefronts, sites, leads, bookings and more with Saroh.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}
            >
                <Providers>
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="light"
                        enableSystem
                        disableTransitionOnChange
                    >
                        <AppShell>{children}</AppShell>
                    </ThemeProvider>
                </Providers>
            </body>
        </html>
    );
}
