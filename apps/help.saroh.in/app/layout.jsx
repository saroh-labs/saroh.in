import { Wordmark } from "@saroh/ui/wordmark";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "nextra-theme-docs/style.css";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";

export const metadata = {
    title: {
        default: "Saroh Help",
        template: "%s – Saroh Help",
    },
};

const navbar = (
    <Navbar
        logo={<Wordmark suffix="Help" />}
        projectLink="https://app.saroh.in"
    />
);

// The footer once read "MIT ©" while no LICENSE file existed. Terms exist now
// (LICENSE.md — source-available, not open source), but this is the merchant
// help centre: someone reading it is using the hosted product and has no
// licensing question, so it stays out of their way.
const footer = (
    <Footer>
        © {new Date().getFullYear()} Saroh ·{" "}
        <a href="https://saroh.in">saroh.in</a> ·{" "}
        <a href="https://docs.saroh.in">Developer docs</a>
    </Footer>
);

export default async function RootLayout({ children }) {
    return (
        <html lang="en" dir="ltr" suppressHydrationWarning>
            <Head color={{ hue: 221, saturation: 83 }} />
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
