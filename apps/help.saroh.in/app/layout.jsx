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

const footer = <Footer>MIT {new Date().getFullYear()} © Saroh.in</Footer>;

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
