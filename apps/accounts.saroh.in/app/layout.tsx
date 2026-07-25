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
                    {/* `fixed` + `min-h-screen`, not `absolute` + `h-screen`:
                        every screen here used to fit the viewport, so the
                        backdrop ended at exactly 100vh. The account page is
                        taller than that and the page below the fold rendered
                        unstyled white. */}
                    <div className="fixed inset-0 z-[-2] bg-neutral-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))]"></div>
                    <div className="relative z-10 min-h-screen w-full">
                        {children}
                    </div>
                </Providers>
            </body>
        </html>
    );
}
