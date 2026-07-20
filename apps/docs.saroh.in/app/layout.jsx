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

// Inline copy of the canonical @saroh/ui <Wordmark> (Nextra's JS layout can't
// transpile the shared TSX component). Keep in sync with packages/ui wordmark.
const wordmark = (
    <span
        style={{
            display: "inline-flex",
            alignItems: "baseline",
            gap: "0.4ch",
            fontWeight: 700,
            fontSize: "1.125rem",
            letterSpacing: "-0.02em",
        }}
    >
        <span
            style={{
                backgroundImage:
                    "linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
            }}
        >
            Saroh
        </span>
        <span style={{ fontWeight: 500, color: "#71717a" }}>Docs</span>
    </span>
);

const navbar = (
    <Navbar
        logo={wordmark}
        projectLink="https://github.com/saroh-io/saroh.io"
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
                    docsRepositoryBase="https://github.com/saroh-io/saroh.io/tree/main/apps/docs.saroh.in"
                >
                    {children}
                </Layout>
            </body>
        </html>
    );
}
