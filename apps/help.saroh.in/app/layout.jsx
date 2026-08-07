import { Wordmark } from "@saroh/ui/wordmark";
import localFont from "next/font/local";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "nextra-theme-docs/style.css";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
// Must load AFTER nextra-theme-docs/style.css above, never before: this file
// restyles Nextra by overriding the variables that stylesheet declares, and
// CSS import order is what decides which wins. The lint rule sorts imports
// alphabetically, which happens to preserve that — do not rely on it silently.
import "./globals.css";

// Self-hosted (latin subset, variable) so the build never fetches fonts from an
// external network — the same two files, loaded the same way, as saroh.in and
// the workspace. Geist carries UI/body; Bricolage Grotesque is the display face
// for headings and the wordmark.
const fontSans = localFont({
    src: "../../../packages/ui/fonts/Geist-latin.woff2",
    weight: "100 900",
    style: "normal",
    display: "swap",
    variable: "--font-sans",
});

const fontDisplay = localFont({
    src: "../../../packages/ui/fonts/BricolageGrotesque-latin.woff2",
    weight: "200 800",
    style: "normal",
    display: "swap",
    variable: "--font-display",
});

export const metadata = {
    title: {
        default: "Saroh Help",
        template: "%s – Saroh Help",
    },
};

// `projectIcon` is passed because Nextra's default is a GitHub octocat, and it
// renders that icon whatever `projectLink` points at. This link goes to the
// workspace, so the navbar was showing a merchant — someone who will never open
// a repository — a GitHub mark that did not lead to GitHub. Visible text is its
// own accessible name, which the bare icon also lacked (Nextra wraps
// `projectIcon` in an anchor without labelling it).
const navbar = (
    <Navbar
        logo={<Wordmark suffix="Help" />}
        projectLink="https://app.saroh.in"
        projectIcon={<span className="x:text-sm">Open Saroh →</span>}
    />
);

// No licence link here on purpose. Saroh is source-available under ELv2, but
// someone reading the help centre is using the hosted product and has no
// licensing question — the terms belong in the developer docs, where the reader
// who needs them actually is.
const footer = (
    <Footer>
        © {new Date().getFullYear()} Saroh ·{" "}
        <a href="https://saroh.in">saroh.in</a> ·{" "}
        <a href="https://docs.saroh.in">Developer docs</a>
    </Footer>
);

export default async function RootLayout({ children }) {
    return (
        // The font variables go on <html>, not <body>: globals.css reads them
        // from `:root` to build `--x-font-sans`, and a variable declared one
        // level down would not be in scope there.
        <html
            lang="en"
            dir="ltr"
            className={`${fontSans.variable} ${fontDisplay.variable}`}
            suppressHydrationWarning
        >
            {/*
             * Nextra derives its whole accent ramp from these three numbers, so
             * this is where Saroh's one chromatic token enters the theme:
             * `--brand`, 212 100% 42% in light and 62% in dark, lightened for
             * dark because it has to stay legible on black. It was stock
             * Nextra's 221/83 — a different blue, the loudest tell that these
             * two sites were built from a template rather than from the
             * product. The grounds are the product's grounds too: pure white
             * and true black, not Nextra's #fafafa/#111, which also gets the
             * <meta name="theme-color"> right for both schemes.
             */}
            <Head
                color={{
                    hue: 212,
                    saturation: 100,
                    lightness: { light: 42, dark: 62 },
                }}
                backgroundColor={{ light: "#ffffff", dark: "#000000" }}
            />
            <body>
                <Layout
                    navbar={navbar}
                    footer={footer}
                    pageMap={await getPageMap()}
                    docsRepositoryBase="https://github.com/saroh-io/saroh.io/tree/main/apps/help.saroh.in"
                >
                    {children}
                </Layout>
            </body>
        </html>
    );
}
