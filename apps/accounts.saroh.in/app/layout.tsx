import "@saroh/ui/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./auth.css";

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
        // `suppressHydrationWarning` because the script below stamps the theme
        // class onto <html> before React hydrates, so a visitor whose OS prefers
        // dark always mismatches what the server rendered. It suppresses the
        // warning on this element's own attributes only, not on its subtree.
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}
            >
                {/*
                 * Follow the OS, pre-paint. accounts has no theme toggle and
                 * needs none — there is nothing to remember across five forms —
                 * so this is a media query, not `next-themes`. That library
                 * exists to persist a CHOICE and it is not even resolvable from
                 * this app under pnpm's strict layout; adding a dependency to
                 * read `prefers-color-scheme` would be a poor trade.
                 *
                 * It must run before first paint or a dark-mode visitor gets a
                 * white flash. As the FIRST CHILD OF <body> it does: the
                 * stylesheet in <head> is render-blocking and nothing below has
                 * been parsed yet. It is not a sibling of <body>, because a raw
                 * <script> between <html> and <body> gets hoisted into <head>
                 * and the hydrated DOM would no longer match the rendered tree.
                 */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")}catch(e){}})()`,
                    }}
                />
                <Providers>
                    {/* `fixed`, not `absolute` + `h-screen`: the account page is
                        taller than the viewport, and a 100vh backdrop left
                        everything below the fold unstyled. */}
                    <div className="sa-page" aria-hidden="true" />
                    <div className="relative z-10 min-h-screen w-full">
                        {children}
                    </div>
                </Providers>
            </body>
        </html>
    );
}
