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

// No LICENSE file exists in the repository and `package.json` carries no
// `license` field, so the previous "MIT ©" footer stated terms that have never
// been granted. A copyright line is true; a licence claim was not.
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
