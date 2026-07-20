import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";

import Providers from "./providers";

// Self-hosted Inter from the shared @saroh/ui font asset — no build-time
// Google Fonts fetch, one file for every app (#96).
const inter = localFont({
    src: "../../../packages/ui/fonts/InterVariable-latin.woff2",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Saroh Auth",
    description: "login to your saroh account.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <Providers>
                    <div className="absolute top-0 z-[-2] h-screen w-screen bg-neutral-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))]"></div>{" "}
                    <div className="relative z-10 h-screen w-full">
                        {children}
                    </div>
                </Providers>
            </body>
        </html>
    );
}
