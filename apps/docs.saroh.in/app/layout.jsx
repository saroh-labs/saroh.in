import { Wordmark } from "@saroh/ui/wordmark";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "nextra-theme-docs/style.css";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";

export const metadata = {
    title: {
        default: "Saroh.in Documentation",
        template: "%s – Saroh.in",
    },
};

const navbar = (
    <Navbar
        logo={<Wordmark suffix="Docs" />}
        projectLink="https://github.com/saroh-io/saroh.io"
    />
);

// Developers ARE the audience with a licensing question, so unlike the help
// centre this footer links the terms directly. The Introduction covers them in
// full: source-available, free to evaluate and modify, paid for commercial use.
const footer = (
    <Footer>
        © {new Date().getFullYear()} Saroh ·{" "}
        <a href="https://saroh.in">saroh.in</a> ·{" "}
        <a href="https://help.saroh.in">Help centre</a> ·{" "}
        <a href="https://github.com/saroh-io/saroh.io/blob/main/LICENSE.md">
            Licence
        </a>
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
                    docsRepositoryBase="https://github.com/saroh-io/saroh.io/tree/main/apps/docs.saroh.in"
                >
                    {children}
                </Layout>
            </body>
        </html>
    );
}
