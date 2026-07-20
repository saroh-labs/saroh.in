import { AppHeader } from "@/components/shared/app-header";
import { ThemeProvider } from "@/components/theme-provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

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
            <body className={inter.className}>
                <Providers>
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="light"
                        enableSystem
                        disableTransitionOnChange
                    >
                        <AppHeader />
                        {children}
                    </ThemeProvider>
                </Providers>
            </body>
        </html>
    );
}
