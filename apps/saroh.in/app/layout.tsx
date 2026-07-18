import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

// Self-hosted Inter (latin subset, variable weight 100–900) so the build never
// fetches fonts from an external network. Mirrors the previous
// `Inter({ subsets: ["latin"] })` from next/font/google.
const inter = localFont({
    src: "./fonts/InterVariable-latin.woff2",
    weight: "100 900",
    style: "normal",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Create blogs, portfolios or storefronts | saroh.in",
    description:
        "Create your own blog, portfolio or storefront with ease. Easily manage your online presence with saroh.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <Script
                    async
                    src="https://www.googletagmanager.com/gtag/js?id=G-L19ZLH2N5K"
                ></Script>
                <Script id="google-analytics">
                    {` window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-L19ZLH2N5K');`}
                </Script>
                <Toaster />
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem
                    disableTransitionOnChange
                    forcedTheme="dark"
                >
                    {children}
                </ThemeProvider>
            </body>
        </html>
    );
}
