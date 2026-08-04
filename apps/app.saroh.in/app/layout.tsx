import "@saroh/ui/globals.css";
import { ThemeProvider } from "@saroh/ui/theme-provider";
import type { Metadata } from "next";
import localFont from "next/font/local";
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
    // "storefronts" appeared nowhere in the UI — the product calls them stores,
    // and a description that uses a word the app never says is a small lie
    // search engines repeat. Named for what a merchant does, not for our nouns.
    description:
        "Run your business from one place — sell, take bookings, follow up on enquiries, and keep your website in step.",
};

/**
 * Document-level only. The app chrome lives in `(shell)/layout.tsx` so that
 * first-run routes under `/onboarding` can render without a sidebar full of
 * capabilities the merchant has not chosen yet — asking "what does your
 * business need to do?" beside a nav that already lists the answers is a
 * contradiction. Route groups keep every URL unchanged.
 */
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        // `suppressHydrationWarning` is required by next-themes, not optional
        // politeness: its blocking script stamps the resolved theme class onto
        // <html> before React hydrates, so a visitor whose OS prefers dark
        // always mismatches the server's `defaultTheme`. The other apps already
        // had it; this one did not. It suppresses the warning on this element
        // only, not on its subtree.
        <html lang="en" suppressHydrationWarning>
            <body
                className={`${fontSans.variable} ${fontDisplay.variable} font-sans`}
            >
                {/*
                 * Apply the stored skin BEFORE first paint. Without this the
                 * page renders in the default world and then snaps to the
                 * chosen one on hydration — a flash that is worse the more the
                 * two skins differ, and these differ a lot. Same trick
                 * next-themes uses for dark.
                 *
                 * It is the FIRST CHILD OF <body>, not a sibling of it. A raw
                 * <script> between <html> and <body> is not valid document
                 * structure: the browser hoists it into <head>, so the DOM React
                 * hydrates against no longer matches the tree it rendered, and
                 * every page logged a hydration mismatch. `suppressHydrationWarning`
                 * on <html> does not cover it — that flag applies to the element's
                 * own attributes, not to a child that moved. Here it still runs
                 * before any content paints, because the stylesheet in <head> is
                 * render-blocking and nothing below has been parsed yet.
                 */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var s=localStorage.getItem("saroh-skin");var ok=["panel","instrument","stockroom"];document.documentElement.dataset.skin=ok.indexOf(s)>-1?s:"panel"}catch(e){document.documentElement.dataset.skin="panel"}})()`,
                    }}
                />
                <Providers>
                    <ThemeProvider
                        attribute="class"
                        defaultTheme="light"
                        enableSystem
                        disableTransitionOnChange
                    >
                        {children}
                    </ThemeProvider>
                </Providers>
            </body>
        </html>
    );
}
