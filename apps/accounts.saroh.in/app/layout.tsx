import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./atmosphere.css";

import Providers from "./providers";

// Self-hosted Inter from the shared @saroh/ui font asset — no build-time
// Google Fonts fetch, one file for every app (#96).
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
    title: "Saroh Auth",
    description: "login to your saroh account.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        /* `dark` is pinned, not toggled. This app was already painting a dark
           backdrop while its tokens resolved LIGHT, so every card rendered
           white-on-black and the muted-foreground copy sat at the wrong end of
           its contrast pair. accounts is pure chrome — one action per screen,
           no data — so it commits to the dark register the design system was
           authored in rather than carrying a theme switcher for five forms. */
        <html lang="en" className="dark">
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}
            >
                <Providers>
                    {/* `fixed`, not `absolute` + `h-screen`: the account page is
                        taller than the viewport, and a 100vh backdrop left
                        everything below the fold unstyled. */}
                    <div className="sa-atmosphere" aria-hidden="true">
                        <div className="sa-field sa-field--brand" />
                        <div className="sa-field sa-field--deep" />
                        <div className="sa-field sa-field--lime" />
                    </div>
                    <div className="sa-grain" aria-hidden="true" />
                    <div className="relative z-10 min-h-screen w-full">
                        {children}
                    </div>
                </Providers>
            </body>
        </html>
    );
}
